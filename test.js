

/*jslint node: true */
/*global describe */
/*global it */
/*global before */
/*global after */
/*global Pouch */

var assert = require('assert');
var utils = require('utils');
var async = require('async');
var nano  = require('nano');
var masterLog = utils.log().wrap('data');

var lib = require('./index.js');

if (typeof process.env.COVERAGE !== 'undefined') {
  //lib = require('./../../../lib-cov/shared/data.js');
  masterLog = utils.log.fake();
}




var remoteDbUrl = 'http://admin:password@localhost:5984/';

var localDbUrl;

var dbName = 'system';

describe('data', function () {
  'use strict';

  var pouch;
  if (typeof window === 'undefined') {
    masterLog('running on server');
    localDbUrl = 'leveldb://stage/';
    pouch = require('pouchdb');
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
    pouch = Pouch;
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
    }, utils.safe(d, function(){
      var s = nano(remoteDbUrl);
      s.db.list(function(err, body){
        async.forEachSeries(body, function(name, cbk){
          if(name.substr(0,6) === 'testdb')
          {
            console.log(name);
            s.db.destroy(encodeURI(name), cbk);
          }
          else
          {
            cbk();
          }
        }, function(){
          d();
        });
      });
    }));
  });



/*
  it('makeReplicatedPouch', function (done) {
    //should create or make a new local databse and syc it with the server
    var index = 0;
    sinon.stub(lib.pouch, 'replicate', function (from, to, options, callback) {
      if (index === 0) {
        assert.equal(remoteDbUrl, from);
        assert.equal(localDbUrl, to);
        index++;
        callback();
        return;
      }
      if (index === 1) {
        assert.equal(localDbUrl, from);
        assert.equal(remoteDbUrl, to);
        index++;
        return;
      }
      if (index === 2) {
        assert.equal(remoteDbUrl, from);
        assert.equal(localDbUrl, to);
        index++;
        return;
      }

    });
    lib.makeReplicatedPouch(remoteDbUrl, function (error, db) {
      assert.ifError(error);
      lib.pouch.replicate.restore();
      done();
    });
  });
*/
/*
  it('createDB: if in browser should makeReplicatedPouch', function (done) {
    if (typeof lib.makeReplicatedPouch.restore !== 'undefined') {
      lib.makeReplicatedPouch.restore();
    }
    process.env.LOCATION = 'browser';
    sinon.stub(lib, 'makeReplicatedPouch', function (name, cb) {
      assert.equal(remoteDbUrl, name);
      cb(null, {});
    });
    lib.createDB({
      databaseName: 'testDB'
    }, function (error, db) {
      assert.ifError(error);
      lib.makeReplicatedPouch.restore();
      done();
    });
  });
*/
/*
  it('createDB: if in server should connect', function (done) {

    process.env.LOCATION = 'server';

    lib.createDB({
      databaseName: 'testDB'
    }, function (error, db) {
      assert.ifError(error);
      done();
    });
  });


*/


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
      lib(db, [], mylog, utils.cb(onDone, function (dal) {
        onDone(undefined, dal);
      }));
    }));
  }));
});

it('2: should be save and retrieve a record', function (done) {
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
  _id: id
};

var dbName = localDbUrl + 'test-data-2';

mylog('deleting old database');
pouch.destroy(dbName, utils.safe(onDone, function (error) {
  mylog('creating new database');
  pouch(dbName, utils.cb(onDone, function (db) {
    mylog('database created');
    lib(db, [], mylog.wrap('creating dal'), utils.cb(onDone, function (dal) {
      mylog('dal created');
      dal.save(toBeSaved, mylog.wrap('saving'), utils.cb(onDone, function (mySaved) {
        assert.ok(mySaved);
        assert.ok(mySaved._rev);
        mylog('record saved, checking');
        dal.get(id, mylog.wrap('getting'), utils.cb(onDone, function (found) {
          mylog('record found');
          assert.ok(found);
          onDone();
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
    lib(db, [], mylog, utils.cb(onDone, function (dal) {
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

var replicationFilter = function(doc){
  if(typeof doc !== 'undefined')
  {
    mylog('filtering: ' + doc._id);
    var result;
    if("_design/" === doc._id.substr(0, 8))
    {
      result = false;
    }
    else
    {
      result = true;
    }
    return result;
  }
  return false;
};

it('6: processor should call ', function (done) {
 var mylog = masterLog.wrap('6');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
    done(error);
  };

  var changes = {test: 1};
  var queueProcessor = lib.processor(function(id, data, callback){
    assert.equal('test', id);
    callback();
  }, mylog);
  queueProcessor(changes, function(error){
    assert.equal('undefined', typeof changes.test);
    onDone(error);
  });
});


it('7: processor should call each', function (done) {
 var mylog = masterLog.wrap('7');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
    done(error);
  };
  var changes = {test: 1, test2: 2};
  var count = 0;
  var queueProcessor = lib.processor(function(id, data, callback){
    count++;
    callback();
  }, mylog);
  queueProcessor(changes, function(error){
    assert.equal('undefined', typeof changes.test);
    assert.equal('undefined', typeof changes.test2);
    assert.equal(2, count);
    onDone();
  });
});

it('8: change queue', function (done) {
 var mylog = masterLog.wrap('8');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
    done(error);
  };

  var queueProcessor = function(queue, callback){
    assert.equal('hello', queue[1].id);
    delete queue[1];
    callback();
  };

  var queue = lib.changeQueue(queueProcessor);
  queue.on('error', function(error){
    onDone(error);
  });
  queue.on('log', function(message){
   mylog(message);
  });
  queue.on('state', function(message){
    if(message === 'idle')
    {
      onDone();
    }
  });

  queue.enqueue(1, {id: 'hello'});
});


it('9: replicate, should fire initialReplicate', function (done) {
 var mylog = masterLog.wrap('9');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
  done(error);
};

var dbName = localDbUrl + 'test-data-9';
var remoteDbName = remoteDbUrl + 'test-data-9';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
      mylog('initiating replication');
        var replicator = lib.replicate(serverdb, localdb, {continuous: false});
        replicator.on('error', mylog.wrap('replicator').error);
        replicator.on('setupComplete', function(){
          replicator.on('initialReplicateComplete', function(change){
            onDone();
          });
        });
        replicator.on('log', mylog.wrap('replicator'));
      }));
    }));
  }));
}));
});

it('10: replicate, should fire upToDate', function (done) {
 var mylog = masterLog.wrap('10');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
  done(error);
};

var dbName = localDbUrl + 'test-data-10';
var remoteDbName = remoteDbUrl + 'test-data-10';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
         var replicator = lib.replicate(serverdb, localdb, {continuous: false});
        replicator.on('error', function(error){
            mylog.error(error);
          });

        replicator.on('log', function(message){
            mylog.log(message);
          });

        replicator.on('upToDate', function(change){
            onDone();
        });
      }));
    }));
  }));
}));
});


it('11: replicate, should replicate an item', function (done) {
 var mylog = masterLog.wrap('11');
 var onDone = function (err) {
  if (typeof err !== 'undefined') {
    mylog.error(err);
  }
  done(err);
};

var dbName = localDbUrl + 'test-data-11';
var remoteDbName = remoteDbUrl + 'test-data-11';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
        serverdb.put({_id: 'testitem'}, utils.cb(onDone, function(){

          var replicator = lib.replicate(serverdb, localdb, {continuous: false});
          replicator.on('error', function(error){
            mylog.error(error);
            onDone(error);
          });

          replicator.on('log', function(message){
            mylog.log(message);
          });

          replicator.on('initialReplicateComplete', function(change){
            mylog('checking doc is synced');
            localdb.get('testitem', {}, utils.safe(onDone, function(err3, item){
              assert.ifError(err3);
              assert.equal('testitem', item._id);
              onDone();
            }));
          });
        }));
      }));
    }));
  }));
}));
});


it('12: replicate, should be continuous', function (done) {
 var mylog = masterLog.wrap('12');
 var onDone = function (err) {
  if (typeof err !== 'undefined') {
    mylog.error(err);
  }
  done(err);
};

var dbName = localDbUrl + 'test-data-12';
var remoteDbName = remoteDbUrl + 'test-data-12';
mylog('creating new database: ' + remoteDbName);
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  pouch(remoteDbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    mylog('creating new database: ' + dbName);
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      pouch(dbName, utils.cb(onDone, function (localdb) {
          var count =0;

          var replicator = lib.replicate(serverdb, localdb, {continuous: true});
          replicator.on('error', function(error){
            mylog.error(error);
            onDone(error);
          });

          replicator.on('log', function(message){
            mylog.log(message);
          });

          replicator.on('upToDate', function(seq){
            mylog.log('upToDate called');
            if(count ===0)
            {
              count++;
              return;
            }
            replicator.cancel();
            mylog('checking doc is synced');
            localdb.get('testitem', {}, utils.safe(onDone, function(err3, item){
              console.dir(err3);
              assert.ifError(err3);
              assert.equal('testitem', item._id);
              onDone();
            }));
          });
          serverdb.put({_id: 'testitem'}, utils.cb(onDone, function(){
            mylog('doc written');
          }));
      }));
    }));
  }));
}));
});

/*
*/

/*
it('7: should replicate from server', function (done) {
 var mylog = masterLog.wrap('7');
 var onDone = function (error) {
  if (error) {
    mylog.error(error);
  }
  done(error);
};
var id = Math.uuid();
var dbName = localDbUrl + 'test-data-7';
var remoteDbName = remoteDbUrl + 'test-data-7';
mylog('deleting old database');
pouch.destroy(remoteDbName, utils.safe(onDone, function (error) {
  mylog('creating new database: ' + remoteDbName);
  pouch(dbName, utils.cb(onDone, function (serverdb) {
    mylog('database created');
    pouch.destroy(dbName, utils.safe(onDone, function (error) {
      mylog('creating new database: ' + dbName);
      pouch(dbName, utils.cb(onDone, function (localdb) {
        mylog('database created');
        lib(localdb, mylog, utils.cb(onDone, function (dal) {
          mylog('setting up replication');
          pouch.replicate(serverdb, localdb, {continuous: true});
          dal.on('change', function(change){
            done();
          });
          serverdb.put({_id: id}, function(){
            mylog('saved server doc');
          });
        }));
      }));
    }));
  }));
}));
});
*/

/*
  it('dataAccessLayer: browser', function (done) {
    process.env.LOCATION = 'browser';
    lib.dataAccessLayer({
      databaseName: 'browserDB'
    }, function (error, db) {
      assert.ifError(error);
      done();
    });
  });


  it('dataAccessLayer', function (done) {

    process.env.LOCATION = 'server';
    lib(fakePouch, utils.cb(done, function (error, db) {
      done();
    }));
});*/
});