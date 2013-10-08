

/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */
/*global Pouch */
var assert = require('assert');
var utils = require('utils');
var async = require('async');
var masterLog = utils.log().wrap('data');

var lib = require('./index.js');

if (typeof process.env.COVERAGE !== 'undefined') {
  //lib = require('./../../../lib-cov/shared/data.js');
  masterLog = utils.log.fake();
}
var jsonCrypto = require('jsonCrypto');


var EXPONENT = 65537;
var MODULUS = 512;

var userKeyPair = jsonCrypto.generateKeyPEMBufferPair(MODULUS, EXPONENT);
var userCertificate =  jsonCrypto.createCert(userKeyPair.publicPEM);


var remoteDbUrl = 'http://admin:password@localhost:5984/';

var localDbUrl;

var dbName = 'system';

describe('data', function () {
  'use strict';

  var pouch = require('pouchdb');
  if (typeof window === 'undefined') {
    masterLog('running on server');
    localDbUrl = 'leveldb://stage/'; 
  }
  else {
    localDbUrl ='';
    masterLog('running on browser');

    /*window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
    if(typeof window.indexedDB !=='undefined')
    {
        localDbUrl = 'idb://';
    }  
    else
    {
      localDbUrl = 'websql://';
    }             
    */
  }


  var fakeData = {};
  var fakePouch = {
    get: function (_id, callback) {
      if (fakeData[_id]) {
        callback(null, fakeData[_id]);
      }
      else {
        callback({
          error: 'not_found'
        });
      }
    },
    put: function (object, callback) {
      fakeData[object._id] = object;
      callback();
    },
    query: function (name, callback) {
      callback();
    }
  };

  after(function(d){
    async.forEach([9,10,11,12], function(number, cbs){
      var dbName = remoteDbUrl + 'test-data-' + number;
      pouch.destroy(dbName, utils.safe(cbs, function (error) {
        cbs();
      }));
    }, function(){
      d();
    });
  });





it('1: should be able to create a dal', function (done) {
  var mylog = masterLog.wrap('1');
  var onDone = function (error) {
    if (error) {
      mylog.error(error);
    }
    done(error);
  };
  var dbName = localDbUrl + 'test-data-1';
  mylog('deleting old database');
  pouch.destroy(dbName, utils.safe(onDone, function (error) {
    mylog('creating new database');
    utils.safe(onDone, pouch)(dbName, utils.cb(onDone, function (db) {
      mylog('database created');
      var dal = lib(db, [], userKeyPair.privatePEM, userCertificate, mylog);
      dal.on('setupComplete', utils.safe.catchSyncronousErrors(onDone, function (dal) {
        onDone(undefined, dal);
      }));
    }));
  }));
});

it('2: should be save and retrieve and delete a record', function (done) {
  var onDone = function (error) {
    if (error) {
      console.dir(error);
      console.dir(error.stack);
    }
    done(error);
  };

  var mylog = masterLog.wrap('2');

  var id = "3432424324324234";
  var toBeSaved = {
    _id: id,
    dirty:true
  };


  var dbName = localDbUrl + 'test-data-2';

  mylog('deleting old database');
  pouch.destroy(dbName, utils.safe(onDone, function (error) {
    mylog('creating new database');
    pouch(dbName, utils.cb(onDone, function (db) {
      mylog('database created');
      var dal = lib(db, [], userKeyPair.privatePEM, userCertificate, mylog.wrap('creating dal'));
      dal.on('setupComplete', utils.safe.catchSyncronousErrors(onDone, function () {
        assert.ok(dal.seq !== null, 'should have a seq');
        mylog('dal created');
        dal.save(toBeSaved, mylog.wrap('saving'), utils.cb(onDone, function (mySaved) {
          assert.ok(mySaved, 'should return the saved object');
          assert.ok(mySaved.signature, 'should have a signature');
          assert.ok(mySaved.creator, 'should have a creator');
          assert.ok(mySaved.created, 'should have a created');
          assert.ok(mySaved.editor, 'should have a editor');
          assert.ok(mySaved.edited, 'should have a edited');
          assert.ok(mySaved._rev, 'should have a rev');
          assert.ifError(mySaved.dirty, 'should delete dirty');
          mylog('record saved, checking');
          dal.get(id, mylog.wrap('getting'), utils.cb(onDone, function (found) {
            mylog('record found');
            assert.ok(found);
            dal.remove(found, mylog.wrap('remove'), utils.cb(onDone, function(){
              dal.get(id, mylog.wrap('getting'), utils.safe(onDone, function (error, foundAgain) {
                assert.ifError(foundAgain, 'should not find a record');
                onDone();
              }));
            }));
          }));
        }));
      }));
    }));
  }));                                    
});


it('3: makeCouchViewDefinitionForType', function (done) {
  var view = lib.makeCouchViewDefinitionForType(lib.objectTypes.login);
  assert.ok(view.views._id, 'has _id index');
  assert.ifError(view.views.salt, 'has id index');

  done();
});

it('4: ensureIndexesForType', function (done) {

  if (typeof lib.ensureIndexesForTypes.restore !== 'undefined') {
    lib.ensureIndexesForTypes.restore();
  }
  var mylog = masterLog.wrap('4');
  var myType = lib.objectTypes.login;
  var fakeData = {};
  var fakeDB = {
    get: function (_id, callback) {
      if (fakeData[_id]) {
        callback(null, fakeData[_id]);
      }
      else {
        callback({
          error: 'not_found'
        });
      }
    },
    put: function (object, callback) {
      fakeData[object._id] = object;
      callback();
    },
    query: function (name, callback) {
      callback();
    }
  };

  lib.ensureIndexesForType(myType, fakeDB, mylog, function (error2, result) {
    assert.ifError(error2);

    assert.ok(fakeData['_design/login']);
    assert.equal(true, result, 'should create a new view');
    lib.ensureIndexesForType(myType, fakeDB, mylog, function (error3, result2) {
      assert.ifError(error2);
      assert.equal(false, result2, 'should not updatethe view if no changes');
      done();
    });
  });

});
it('5: should raise change events', function (done) {
 var mylog = masterLog.wrap('5');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
  done(error);
};
var dbName = localDbUrl + 'test-data-5';
mylog('deleting old database');
pouch.destroy(dbName, utils.safe(onDone, function (error) {
  mylog('creating new database');
  utils.safe(onDone, pouch)(dbName, utils.cb(onDone, function (db) {
    mylog('database created');
    var dal = lib(db, [], userKeyPair.privatePEM, userCertificate, mylog);
    dal.on('setupComplete', utils.safe.catchSyncronousErrors(onDone, function () {
      dal.on('change', function(c){
        mylog.dir(c);
        if(c.id ==='12323213213')
        {
          dal.dispose();
          onDone();
        }
      });
      dal.save({_id:'12323213213'}, mylog.wrap('saving an object to invoke change'), function(error){
        assert.ifError(error);
      });
    }));
  }));
}));
});

});