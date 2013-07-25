var pouch;
if(typeof window ==='undefined')
{
  pouch = require('pouch');
}
else
{
  pouch = Pouch;
}




var events = require('events');

var serverURL = '';

var PRODUCTION_COUCH_HOSTNAME = 'collaborlistcouchproxy.jit.su';
var PRODUCTION_COUCH_PORT = 80;
var PRODUCTION_COUCH_PROTOCOL = 'http:';

module.exports  = function(){
	var that = {};


	var setupComplete = false;

	that.setupDBs = function(username, password, log, callback){
		var userDBURL = {};
		userDBURL.auth = encodeURIComponent(username) + ":" + encodeURIComponent(password);
   		userDBURL.hostname = PRODUCTION_COUCH_HOSTNAME;
   		userDBURL.port = PRODUCTION_COUCH_PORT;
   		userDBURL.protocol = PRODUCTION_COUCH_PROTOCOL;
   		userDBURL.pathname = '/user_' + userId;
		offlinePouch(url.format(userBDURL), {filter: userFilter, waitForInitialReplicate: true}, log.wrap('getting user DB'), utils.cb(callback, function(){
			offlinePouch.changes({since: 0, onChange: function(change){
				//create of delete list databases

				
			}});
			setupComplete = true;
			callback();
		}));
	};

	return that;
}



  var userFilter = function(doc, req) {
    var result = true;
    var type;
    try
    {
      if("_design/" === doc._id.substr(0, 8))
      {
        result = false;
        type = 'design document';
      }
      else
      {
        if(typeof doc.type !== 'undefined')
        {
          type = doc.type;
          if(doc.type === 'login')
          {
            result =false;
          }
        }
        else
        {
          if(doc._deleted === true)
          {
            type = 'deleted';
          }
          else
          {
            type = 'unknown type';
          }
        }
      }
      var inclu;
      if(result === true)
      {
        inclu = 'including';
      }
      else
      {
        inclu ='excluding';
      }
    }
    catch(error)
    {
      result = false;
    }
    return result;
  };


