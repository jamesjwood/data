/*global window */
/*global $ */
/*global ko */
/*global exports */
/*global require */
/*jslint node: true */

var crypto = require('crypto');
var Crypto = {
  MD5: function(str) {
    return crypto.createHash('md5').update(str).digest('hex');
  }
};
var async = require('async');
var events = require('events');

var assert = require('assert');

var listbroCore = require('core');

var utils = require('utils');



var MODULE_NAME = 'listbroData';


module.exports = function dataAccessLayer(db, types, createLog, callback) {
  "use strict";
  createLog('creating dal');
  var that = new events.EventEmitter();
  that.setMaxListeners(100);
  listbroCore.requireNotNull('db', db);

  that.get = function (id, log, cbk) {
    assert.ok(id);
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
        log('db error');
        cbk(error);
      }
      if (found) {
        log('record found with id: ' + id);
        cbk(null, found);
      } else {
        log('no record found with id: ' + id);
        cbk();
        return;
      }
    }));
  };

  that.save = function (toBeSaved, log, cbk) {
    //callback.log('save');
    assert.ok(toBeSaved);
    var id = toBeSaved._id;

    var finish = function(error){
      if(error)
      {
        log('failed to save');
        log.error(error);
      }
      cbk.apply(this, arguments);
    };

    assert.ok(id, "must have an _id");

    var relatedObjectsToUpdate = [];
    var typeName = toBeSaved.type;

    log('saving');
    db.put(toBeSaved, utils.cb(finish, function(response)
    {
      log('saved, updating rev');
      toBeSaved._rev = response.rev;
      log('returning');
      cbk(undefined, toBeSaved);
    }));
  };

  that.remove = function(toBeDeleted, log, cbk){
    assert.ok(toBeDeleted);
    var finish = function(error){
      if(error)
      {
        log('failed to remove');
        log.error(error);
      }
      cbk(error);
    };
    log('removing: ' + toBeDeleted._id);
    db.remove(toBeDeleted, finish);
  };


  that.executeView = function (viewName, viewArgs, log, cbk) {
    assert.ok(viewName);
    assert.ok(viewArgs);

    log(JSON.stringify(viewArgs));
    db.query(viewName, viewArgs, utils.safe(cbk, function (error, result) {
      if (error) {
        log('error querying database');
        cbk(new Error(viewName + ": " + error.error));
        return;
      } else {
        log('queried database, results: ' + result.rows.length);
        var res = [];
        for (var i = 0; i < result.rows.length; i++) {
          var val = result.rows[i].value;
          if (typeof val.title === 'undefined') {
            val.title = '';
          }
          res.push(val);
        }
        log('returning results');
        cbk(null, res);
      }

    }));

  };

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

  var ifAuthenticated = function (b, cbk) {
    if (typeof b !== 'undefined') {

      module.exports.securityService(utils.cb(cbk, function (service) {
        service.loginWithToken(b.token, cbk);
      }));

    }
    else {
      cbk(new Error('no credentials'));
    }
  };


  that.dispose = function () {
    if(changes)
    {
      changes.cancel();
    }
  };

  var changes;

  var setupChangedFeed = function(cbk){
    createLog('getting db info');
    db.info(utils.cb(callback, function(info){
      createLog('setting up changes feed from:' +info.update_seq);
      changes = db.changes({since: info.update_seq, include_docs:true, continuous: true, onChange: function(change){
        createLog('data changed, emitting change event');
        try
        {
          that.emit('change', change);
        }
        catch (error)
        {
          createLog.error(error);
        }
      }});
      cbk(null, that);
    }));
  };


  createLog('checking indexes');
  module.exports.ensureIndexesForTypes(types, db, createLog.wrap('checking system types'), utils.cb(callback, function () {
    setupChangedFeed(callback);
    //callback(null, that);
  }));

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
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "'], doc.title], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_singleChoice = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "'], doc.title], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_text = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "'], doc.title], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_identity = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "'], doc.title], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
};
module.exports.map_email = function (objectDefinition, questionDefinition) {
  "use strict";
  return "function(doc){if(doc.type && doc.type=='" + objectDefinition.typeName() + "'){emit([doc['" + (questionDefinition.deflatedName || questionDefinition.name) + "'], doc.title], {_id: doc._id, title: doc.title, titleDetail: doc.titleDetail, lastModified: doc.lastModified, created: doc.created, lastModifiedBy: doc.lastModifiedBy, createdBy: doc.createdBy});}}";
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

var genReplicationId = function(src, target, opts) {
  var filterFun = opts.filter ? opts.filter.toString() : '';
  console.log('generating repID from:' + src.id() + target.id() + filterFun);
  if(!src.id() || !target.id())
  {
    throw new Error('the source or target ids cannot be null');
  }
  return '_local/' + Crypto.MD5(src.id() + target.id() + filterFun);
};

var fetchCheckpoint = function(target, id, log, callback) {
  log('getting checkpoint');
  target.get(id, function(err, doc) {
    if (err && err.status === 404) {
      log('could not get checkpoint with id: ' + id);
      callback(null, 0);
    } else {
      log('got checkpoint at:' + doc.last_seq);
      callback(null, doc.last_seq);
    }
  });
};

var writeCheckpoint = function(target, id, checkpoint, log, callback) {
  var check = {
    _id: id,
    last_seq: checkpoint
  };
  log('checking for existing checkpoint: ' + checkpoint);
  target.get(check._id, function(err, doc) {
    if (doc && doc._rev) {
      check._rev = doc._rev;
      log('existing checkpoint at : ' + doc.last_seq);
      if(doc.last_seq === checkpoint)
      {
        callback();
        return;
      }
    }
    else
    {
      log('no existing checkpoint');
    }
    target.put(check, function(err, doc) {
      log('wrote checkpoint: ' + checkpoint);
      callback();
    });
  });
};
var processor;
module.exports.processor = processor = function(processItem, log){
  var that = function(queue, callback){
    async.forEachSeries(Object.keys(queue), function(seq, cbk){
      var onDone = function(error){
        if(error)
        {
          log('error processing change: ' + seq + " message was " + error.message);
          cbk();
          return;
        }
        log('done ' + seq);
        delete queue[seq];
        cbk();
      };
      utils.safe(onDone, processItem)(seq, queue[seq], onDone);
    }, callback);
  };
  return that;
};

var changeQueue;

module.exports.changeQueue = changeQueue = function(processor){
  var queue = {};

  var that = new events.EventEmitter();
  that.cancelled = false;
  that.cancel = function(){
    that.cancelled = true;
    that.emit('cancelled');
    that.removeAllListeners();
  };

  var itemsBeingProcessed = [];
  var processing = false;
  var awaitingProcessing = false;
  that.offline = true;

  var setOffline= function(off){
    if(that.offline !== off)
    {
      that.offline = off;
      that.emit('offline', off);
    }
  };

  var allItemsProcesseed = function(orginalAsArray, updated){
    var all = true;
    if(Object.keys(updated).length === 0)
    {
      return all;
    }
    orginalAsArray.map(function(key){
      if(typeof updated[key] !== undefined)
      {
        all = false;
        return;
      }
    });
    return all;
  };

  that.doneProcessing = function(error){
    that.queued = Object.keys(queue).length;
    if(!that.cancelled)
    {
      if(error)
      {
        setOffline(true);
        that.emit('log', 'error processing queue');
        that.emit('error', error);
        that.cancel();
        return;
      }
      that.emit('log', 'done processing');
      processing = false;

      if(allItemsProcesseed(itemsBeingProcessed, queue) === true)
      {
        setOffline(false);
        if(awaitingProcessing)
        {
          that.emit('log', 'more added while processing');
          setTimeout(that.process, 0);
        }
        else
        {
          that.emit('state', 'idle');
        }
      }
      else
      {
        console.log(queue);
        that.emit('log', 'some changes failed to process, scheduling a retry in 5 seconds');
        setOffline(true);
        setTimeout(that.process, 5000);
        that.emit('state', 'idle');
      }
    }
  };

  that.process = utils.safe.catchSyncronousErrors(that.doneProcessing, function(){
    if(!processing && !that.cancelled)
    {
      itemsBeingProcessed = Object.keys(queue);
      that.queued = itemsBeingProcessed.length;
      if(that.queued > 0)
      {
        that.emit('state', 'busy');
        that.emit('log', 'initiating processing');
        awaitingProcessing = false;
        processing = true;
        that.emit('log', 'calling process');
        utils.safe.catchSyncronousErrors(that.doneProcessing, processor)(queue, that.doneProcessing);
      }
      else
      {
        that.doneProcessing();
      }
      return;
    }
    awaitingProcessing = true;
  });

  that.enqueue = function(seq, payload){
    that.emit('log', 'change queued ' + seq);
    queue[seq]= payload;
    if(!that.cancelled)
    {
      that.process();
    }
  };

  return that;
};


//the processors
var getAwaitingDiffProcessor = function(awaitingGet, opts, target, logs){
  var that = function(queue, callback){
      var diff = {};
      var processing = {};

      Object.keys(queue).map(function(seq){
        var change = queue[seq];
        processing[seq] = change;
        if(typeof opts.filter !== 'undefined' && opts.filter && !opts.filter(change.doc))
        {
          diff[change.id] = [];
          return;
        }
        diff[change.id] = change.changes.map(function(x) { return x.rev; });
      });

      target.revsDiff(diff, utils.safe.catchSyncronousErrors(callback, function(error, diffs){
        if(error)
        {
          logs('could not process awaiting diffs, possibly disconnected');
          callback();
          return;
        }
        Object.keys(processing).map(function(seq){
            var change = queue[seq];
            var id = change.id;
            if(diffs[id] && diffs[id].missing)
            {
              awaitingGet.enqueue(seq, {missing: diffs[id].missing, change: change});
            }
            else
            {
              awaitingGet.enqueue(seq, {missing: [], change: change});
            }
            logs('done ' + seq);
            delete queue[seq];
        });
        callback();
      }));
  };
  return that;
};

var getAwaitingGetProcessor =  function(awaitingSave, src, logs){
  var that = processor(function(seq, payload, callback){
    var foundRevs = [];
    var missing = payload.missing;
    var change = payload.change;

    async.forEachSeries(missing, function(rev, cbk2){
      src.get(change.id, {revs: true, rev: rev, attachments: true}, utils.cb(cbk2, function(rev) {
        foundRevs.push(rev);
        cbk2();
      }));
    }, function(error){
      if(error)
      {
        logs('could not get revs for ' + seq);
        callback(error);
        return;
      }
      awaitingSave.enqueue(seq, {change: change, revs: foundRevs});
      callback();
    });
  }, logs);
  return that;
};

var getAwaitingSaveProcessor = function(awaitingNotify, target, logs){
  var p = processor(function(seq, payload, callback){
    var change = payload.change;
    var revs = payload.revs;
    async.forEachSeries(revs, function(rev, cbk){
      target.bulkDocs({docs: [rev]}, {new_edits: false}, utils.safe.catchSyncronousErrors(cbk, function(error){
        if(error)
        {
          if(error.status ===500)
          {
            cbk();
            return;
            //there is a duplicate record already, that is ok
          }
          console.log(error);
          alert('bulk write error');
        }
        cbk(error);
      }));
    }, function(error){
      if(error)
      {
        callback(error);
        return;
      }
      awaitingNotify.enqueue(seq, change);
      callback();
    });
  }, logs);
  return p;
};

var getAwaitingNotifyProcessor = function(onChange, target, repId, source_seq, log){
  var p = processor(function(seq, change, callback){
    if(source_seq <= seq)
    {
      writeCheckpoint(target, repId, seq, log, utils.cb(callback, function(){
        onChange(change);
        callback();
      }));
      return;
    }
    onChange(change);
    callback();
  }, log);
  return p;
};

module.exports.replicate  = function (src, target, opts)
{
  var that = new events.EventEmitter();
  that.cancelled = false;
  that.total_changes =0;
  that.outstanding_changes =0;
  that.offline =true;

  that.sEmit = function(a, b, c, d){
    try
    {
      that.emit(a, b, c, d);
    }
    catch(error)
    {
      console.log('emit error');
      that.emit('error', error);
    }
  };

  var repId = genReplicationId(src, target, opts);
  var changeCallback = opts.onChange;
  var onInitialComplete = opts.onInitialComplete;
  var onUpToDate = opts.onUpToDate;
  var retries = opts.retries || -1;
  var log = utils.log(that);

  var criticalError = function(error){
    that.sEmit('error', error);
    that.cancel();
  };

  var initialReplicateComplete = function(seq){
    log('initialReplicateComplete');
    that.sEmit('initialReplicateComplete', seq);
    if(!opts.continuous)
    {
      that.cancel();
    }
  };

  var upToDate = function(seq){
    log('upToDate');
    that.sEmit('upToDate', seq);
  };

  var setupComplete = function(error){
    if(error)
    {
      if(retries !== 0)
      {
        retries--;
        setTimeout(function(){
          if(!that.cancelled)
          {
            log('failed to setup, retrying in 10 seconds');
            setup(setupComplete);
          }
        }, 1000);
      }
      else
      {
        criticalError(error);
      }
      return;
    }
    log('setup complete, target at ' + that.target_at_seq + ' source is at ' + that.source_seq);
    that.sEmit('setupComplete');
    if(that.target_at_seq == that.source_seq)
    {
      log('target and source already up to date');
      upToDate();
      initialReplicateComplete();
    }
    else
    {
      log('target and source not up to date, waiting for changes feed');
    }
  };

  var setup = utils.safe(setupComplete, function(callback){
    log('getting sourceDB info');
    src.info(utils.cb(callback, function(info){
    that.source_seq = info.update_seq;
    log('sourceDB at ' + that.source_seq);
    fetchCheckpoint(target, repId, log.wrap('getting checkpoint'), utils.cb(callback, function(checkpoint) {
      that.target_at_seq = checkpoint;
      log('targetDB at ' + that.target_at_seq);
      var incomingChange = function(change){
        that.total_changes++;
        that.outstanding_changes++; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
        awaitingDiff.enqueue(change.seq, change);
        that.sEmit('changeQueued', change);
      };

      var changeReplicated = function(change){
        if(changes.cancelled === true)
        {
          return;
        }
        that.outstanding_changes--; // = awaitingNotify.queued + awaitingSave.queued + awaitingGet.queued + awaitingDiff.queued;
        if(change.seq >= that.source_seq)
        {
          that.source_seq = change.seq;
        }
        log('change ' + change.seq + ' replicated last is ' + that.source_seq);
        that.sEmit('changeReplicated', change);

        if(change.seq === info.update_seq)
        {
          initialReplicateComplete(change.seq);
        }

        if(change.seq === that.source_seq)
        {
          upToDate(change.seq);
        }
      };

      var repOpts = {
        continuous: opts.continuous,
        since: that.target_at_seq,
        style: 'all_docs',
        onChange: incomingChange,
        include_docs: true
      };


      if (opts.query_params) {
        repOpts.query_params = opts.query_params;
      }

      var emitLog = function(name){
        var loge = function(message){
          log(name + ": " + message);
        };
        return loge;
      };

      var awaitingNotify = changeQueue(getAwaitingNotifyProcessor(changeReplicated, target, repId, that.source_seq, log.wrap('notify queue')));
      var awaitingSave = changeQueue(getAwaitingSaveProcessor(awaitingNotify, target, log.wrap('save queue')));
      var awaitingGet = changeQueue(getAwaitingGetProcessor(awaitingSave, src, log.wrap('get queue')));
      var awaitingDiff = changeQueue(getAwaitingDiffProcessor(awaitingGet, opts, target, log.wrap('diff queue')));


      var updateOffline = function(){
        var off = awaitingNotify.offline || awaitingSave.offline || awaitingGet.offline || awaitingDiff.offline;
        if(that.offline !== off)
        {
          that.offline = off;
          that.emit('offline', that.offline);
        }
      };

      awaitingNotify.addListener('offline', updateOffline);
      awaitingSave.addListener('offline', updateOffline);
      awaitingGet.addListener('offline', updateOffline);
      awaitingDiff.addListener('offline', updateOffline);

      awaitingNotify.addListener('error', criticalError);
      awaitingSave.addListener('error', criticalError);
      awaitingGet.addListener('error', criticalError);
      awaitingDiff.addListener('error', criticalError);

      //awaitingNotify.addListener('log', onProcessLog('awaitingNotify'));
      //awaitingSave.addListener('log', onProcessLog('awaitingSave'));
      //awaitingGet.addListener('log', onProcessLog('awaitingGet'));
      awaitingDiff.addListener('log', log.wrap('diff processor'));

      var changes = src.changes(repOpts);


      that.cancel = function(){
        that.cancelled = true;
        that.sEmit('cancelled');
        that.removeAllListeners();

        awaitingNotify.cancel();
        awaitingSave.cancel();
        awaitingGet.cancel();
        awaitingDiff.cancel();

        if(opts.continuous)
        {
          changes.cancel();
        }
      };
      callback();
    }));
  }));
  });

  setup(setupComplete);

  return that;
};


