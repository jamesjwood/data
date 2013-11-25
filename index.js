/*global window */
/*global $ */
/*global ko */
/*global exports */
/*global require */
/*jslint node: true */

var jsonCrypto = require('jsonCrypto');
var async = require('async');
var events = require('events');
var assert = require('assert');
var listbroCore = require('core');
var utils = require('utils');

var is = utils.is;

var MODULE_NAME = 'data';


module.exports = function dataAccessLayer(db, types, userPrivatePEMBuff, userCertificate, createLog) {
  "use strict";

  is.object(db, 'db');
  is.object(types, 'types');
  is.function(createLog, 'createLog');


  is.function(db.put, 'db.put');
  is.function(db.post, 'db.post');
  is.function(db.get, 'db.get');
  is.function(db.allDocs, 'db.allDocs');
  is.function(db.changes, 'db.changes');
  is.function(db.bulkDocs, 'db.bulkDocs');
  is.function(db.info, 'db.info');
  is.function(db.query, 'db.query');
  is.function(db.remove, 'db.remove');


  createLog('creating dal');
  var that = new events.EventEmitter();

  var runLog = utils.log(that);
  that.setMaxListeners(100);
  listbroCore.requireNotNull('db', db);

  that.get = function (id, log, cbk) {
    is.string(id);
    is.function(log);
    is.function(cbk);

    log('getting from db');
    db.get(id, utils.safe(cbk, function (error, found) {
      log('response from db');
      if (error) {
        if (error.error !== "not_found") {
          log('error getting record' + id);
          cbk({
            message: error.error,
            details: error.reason
          });
          return;
        }
      }
      
      if (found) {
        log('record found with id: ' + id);
        found.dirty = false;
        cbk(null, found);
      } else {
        log('no record found with id: ' + id);
        cbk();
        return;
      }
    }));
  };

  var prepareForSave = function(toBeSaved, log){
     var id = toBeSaved._id;
    assert.ok(id, "must have an _id");

    if(!toBeSaved.creator)
    {
      toBeSaved.creator = userCertificate.id;
      toBeSaved.created = new Date();
    }
    if(typeof toBeSaved.dirty !== 'undefined')
    {
      delete toBeSaved.dirty;
    }
    log('signing the object');
    toBeSaved.editor = userCertificate.id;
    toBeSaved.edited = new Date();
    var signedObject = jsonCrypto.signObject(toBeSaved, userPrivatePEMBuff, userCertificate, true, log.wrap('signing object'));
    return signedObject;
  };


  that.save = function (toBeSaved, log, cbk) {
    //callback.log('save');
    assert.ok(toBeSaved);
    assert.ok(log);
    assert.ok(cbk);

    
    var finish = function(error){
      if(error)
      {
        log('failed to save');
        log.error(error);
      }
      cbk.apply(this, arguments);
    };

    var signedObject = prepareForSave(toBeSaved, log);
    db.put(signedObject, utils.cb(finish, function(response)
    {
      log('saved, updating rev');
      signedObject._rev = response.rev;

      finish(undefined, signedObject);
    }));
  };

  that.remove = function(toBeDeleted, log, cbk){
    assert.ok(toBeDeleted);
    assert.ok(toBeDeleted._id);
    var finish = function(error){
      if(error)
      {
        log('failed to remove');
        log.error(error);
      }
      cbk(error);
    };
    toBeDeleted._deleted = true;
    var signedObject = prepareForSave(toBeDeleted, log);
    db.put(signedObject,  utils.cb(finish, function(response){
      log('removed');
      //signedObject._rev = response.rev;
      finish();
    }));
  };



  that.executeView = utils.f(function executeView(viewName, viewArgs, log, cbk) {
    assert.ok(viewName);
    is.object(viewArgs, 'viewArgs');
    is.function(log, 'log');
    is.function(cbk, 'cbk');
    log('querying with args: ' + JSON.stringify(viewArgs));

    log('query');
    db.query(viewName, viewArgs, utils.safe(cbk, function (error, result) {
      if (error) {
        log('error querying database');
        var e = new Error('Error querying database view: ' +viewName);
        e.inner = error;
        cbk(e);
        return;
      } else {
        log('queried database, results: ' + result.rows.length);
        log('returning results');
        cbk(null, result);
      }
    }));
  });

  that.view = function (viewArgs, log, cbks) {
    listbroCore.requireNotNull('viewArgs', viewArgs);

    var viewName = viewArgs.viewName;
    var t = new events.EventEmitter();



    t.get = function (b, l, cbk) {

      var startkey = viewArgs.startkey;
      var endkey = viewArgs.endkey;


      if (!b.skip || b.skip < 0) {
        b.skip = 0;
      }

      var getArgs = {
        reduce: false
      };

      if (typeof b.skip !== 'undefined') {
        getArgs.skip = b.skip;
      }
      if (typeof b.limit !== 'undefined') {
        getArgs.limit = b.limit;
      }
      if (typeof startkey !== 'undefined') {
        getArgs.startkey = startkey;
      }
      if (typeof endkey !== 'undefined') {
        getArgs.endkey = endkey;
      }

      that.executeView(viewName, getArgs, l.wrap('executing view'), utils.cb(cbk, function (result) {
        cbk(null, {
          got: result
        });
      }));
    };

    t.count = function (b, l, cbk) {
      var getArgs = {
        reduce: true
      };

      var startkey = viewArgs.startkey;
      var endkey = viewArgs.endkey;


      if (startkey) {
        getArgs.startkey = startkey;
      }
      if (endkey) {
        getArgs.endkey = endkey;
      }
      that.executeView(viewName, getArgs, l.wrap('executing view'), utils.cb(cbk, function (result) {
        var count = 0;
        if (result.length > 0) {
          count = result[0];
        }
        cbk(null, {
          count: count
        });
      }));
    };


    t.dispose = function () {

    };
    cbks(null, t);
  };



  that.dispose = function () {
    if(changes)
    {
      changes.cancel();
    }
  };

  var changes;


  var setupComplete = function(error){
    if(error)
    {
      that.emit('error', error);
      return;
    }
    that.emit('setupComplete');
  };


  var whenDbIsSetup = utils.safe(setupComplete, function(){
    runLog('checking indexes');
    module.exports.ensureIndexesForTypes(types, db, runLog.wrap('checking system types'), utils.cb(setupComplete, function () {
      runLog('getting db info');
      db.info(utils.cb(setupComplete, function(info){
        that.seq = info.update_seq;
        runLog('setting up changes feed from:' + that.seq);

/*
        changes = db.changes({since: info.update_seq, include_docs:true, continuous: true, onChange: function(change){ 
          try
          {
            runLog('data changed, emitting change event');
            that.seq = change.seq;
            that.emit('change', change);
          }
          catch (error)
          {
            runLog.error(error);
          }
        }});
*/
        setupComplete();
      }));
    }));
  });

  if(typeof db.setupComplete !== 'undefined' && db.setupComplete === false)
  {
    db.on('setupComplete', whenDbIsSetup); 
  }
  else
  {
    whenDbIsSetup();
  }

  return that;
};

module.exports.objectTypes = require('objectTypes');

var map = "function(doc) {if(doc.type){emit(doc.type, doc);}}"; //if(doc.type) {if (doc.type === '" + typename +"');
module.exports.getQuestionMapFunction = function (objectDefinition, questionDefinition) {
  "use strict";
  var mf = module.exports['map_' + questionDefinition.type];
  if (typeof(mf) !== 'undefined') {
    return mf(objectDefinition, questionDefinition);
  } else {
    return null;
  }

};


module.exports.map_relatedSingleChoice = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "']], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_singleChoice = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "']], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_text = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "']], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_identity = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "']], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_email = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "']], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_multiChoice = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){for(i=0; i< doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "'].length; i++){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "'][i]], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}}";
};


var reduce =  "function(keys, values, rereduce) {if (rereduce) {return sum(values);} else {return values.length;}}";

module.exports.getDesignDocumentName = function (typeName) {
  "use strict";

  listbroCore.requireNotNull('typeName', typeName);

  return '_design/' + typeName;
};

module.exports.getViewName = function (typeName, indexedFieldName) {
  "use strict";
  listbroCore.requireNotNull('typeName', typeName);
  listbroCore.requireNotNull('indexedFieldName', indexedFieldName);

  return typeName + '/' + indexedFieldName;
};

module.exports.makeCouchViewDefinitionForType = function (type) {
  "use strict";
  var viewName = module.exports.getDesignDocumentName(type.typeName());
  var view = {
    _id: viewName,
    language: "javascript",
    views: {}
  };
  for (var i = 0; i < type.questionDefinitions.length; i++) {

    var questionDefinition = type.questionDefinitions[i];
    if (questionDefinition.indexed === true) {
      var mapFunction = module.exports.getQuestionMapFunction(type, questionDefinition);
      if (mapFunction) {
        view.views[questionDefinition.name] = {
          map: mapFunction,
          reduce: reduce
        };
      }
    }
  }
  return view;
};

module.exports.ensureIndexesForType = function (type, db, log, cbk) {
  "use strict";
  log('make couch view');
  var newView = module.exports.makeCouchViewDefinitionForType(type);

  var saveView = function (v, slog, cb) {
    slog('saving view: ' + v._id);
    db.put(v, utils.safe(cb, function (error) {
      if(error)
      {
        slog('failed to save ' + v._id);
      }
      else
      {
        slog('saved ' + v._id);
      }
      cb(error);
    }));
  };

  log('checking if view exists');
  db.get(newView._id, utils.safe(cbk, function (error, existingView) {
    if (error) {
      if (error.error === 'not_found' || 'getting view undefined') {
        log('view does not exist');
        saveView(newView, log.wrap('save view'), utils.cb(cbk, function () {
          cbk(undefined, true);
        }));
        return;
      } else {
        log('could not check if view exists');
        cbk(new Error('getting view ' + error.error), false);
      }
      return;
    }
    newView._rev = existingView._rev;
    log('view already exists, comparing...');
    var newViewString = JSON.stringify(newView.views);
    var existingViewString = JSON.stringify(existingView.views);

    if (newViewString !== existingViewString) {
      log('view has changed, updating');
      newView._rev = existingView._rev;
      saveView(newView, log.wrap('save view'), utils.cb(cbk, function () {
        cbk(undefined, true);
      }));
    }
    else {
      log('view has not changed');
      cbk(undefined, false);
    }
  }));
};

module.exports.ensureIndexesForTypes = function (typeArray, db, log, cb) {
  "use strict";
  async.forEach(typeArray, function (typ, cbk) {
    if (!typ) {
      cbk(new Error('type was null'));
      return;
    }
    log('checking ' + typ.name);
    module.exports.ensureIndexesForType(typ, db, log.wrap(typ.name), cbk);
  }, cb);
};


