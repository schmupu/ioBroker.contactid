'use strict';

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var net = require('net');

var adapter = new utils.Adapter('contactid');
var server = null; // Server instance


// *****************************************************************************************************
// is called when adapter shuts down - callback has to be called under any circumstances!
// *****************************************************************************************************
adapter.on('unload', function(callback) {
  try {
    adapter.log.info('Closing Contact ID Server');

    if (server) {
      server.close();
    }

    callback();
  } catch (e) {
    callback();
  }
});


// *****************************************************************************************************
// is called if a subscribed object changes
// *****************************************************************************************************
adapter.on('objectChange', function(id, obj) {

  // Warning, obj can be null if it was deleted
  if (obj) {

  }

});


// *****************************************************************************************************
// is called if a subscribed state changes
// *****************************************************************************************************
adapter.on('stateChange', function(id, state) {

  // Warning, state can be null if it was deleted
  if (state && !state.ack) {

  }

});



// *****************************************************************************************************
// is called when databases are connected and adapter received configuration.
// start here!
// *****************************************************************************************************
adapter.on('ready', function() {

  adapter.log.info(adapter.namespace);
  main();

});


// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {

  // delete not used / missing object in configuration
  deleteObects();

  // add object from configuration.
  createObjects();

  // start socket server
  serverStart();

  // in this contactid all states changes inside the adapters namespace are subscribed
  adapter.subscribeStates('*');

}


// *****************************************************************************************************
// convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
// *****************************************************************************************************
function getSubscriberID(subscriber) {

  var id = subscriber.replace(/[.\s]+/g, '_');
  return id;

}


// *****************************************************************************************************
// delete channel and states which are missing in configuration
// *****************************************************************************************************
function deleteChannel(obj) {

  // adapter.log.info('deleteChannel: ' + JSON.stringify(obj));

  // search recrusive for channel name. If found and missing in
  // configuration, delete channel and all states
  Object.keys(obj).forEach(key => {

    if (obj[key] && typeof obj[key] === 'object') {

      deleteChannel(obj[key]); // recurse.

    } else {

      if (obj[key] == 'channel') {

        var found = false;
        var channelname = obj.common.name;

        // Channel Name ist ein subscriber
        for (var i = 0; i < adapter.config.keys.length; i++) {

          var key = adapter.config.keys[i];
          var id = getSubscriberID(key.subscriber);

          if (id == channelname) {

            found = true;

          }

        }

        if (!found) {

          adapter.deleteChannel(channelname);

        }

      }

    }

  });

}


// *****************************************************************************************************
// list of all objects (devices, channel, states) for this instance. call function  deleteChannel
// for deleting old (not used) channels in configuration
// *****************************************************************************************************
function deleteObects() {

  adapter.getAdapterObjects(function(obj) {

    deleteChannel(obj);

  });

}


// *****************************************************************************************************
// create for every ID a channel and create a few states
// *****************************************************************************************************
function createObject(id, key) {

  var states = ["subscriber", "event", "eventtext", "group", "qualifier", "sensor", "message"];

  adapter.setObjectNotExists(id, {
    type: 'channel',
    common: {
      name: key.subscriber
    },
    native: {}
  });

  for (var j = 0; j < states.length; j++) {

    adapter.setObjectNotExists(id + '.' + states[j], {
      type: 'state',
      common: {
        name: states[j],
        type: "string",
        role: "",
        read: true,
        write: false
      },
      native: {}
    });

  }

}


// *****************************************************************************************************
// read configuration, and create for all subscribers a channel and states
// *****************************************************************************************************
function createObjects() {

  for (var i = 0; i < adapter.config.keys.length; i++) {

    var key = adapter.config.keys[i];
    var id = getSubscriberID(key.subscriber);

    createObject(id, key);

  }

}


// *****************************************************************************************************
// read configuration by subscriber and return the alarmsytem
// *****************************************************************************************************
function getAlarmSystem(subscriber) {

  for (var i = 0; i < adapter.config.keys.length; i++) {

    var key = adapter.config.keys[i];

    if (key.subscriber == subscriber) {

      return key.alarmsystem;

    }

  }

  return null;

}


// *****************************************************************************************************
// Set state for contact id message
// *****************************************************************************************************
function setStates(cid) {

  var states = ["subscriber", "event", "eventtext", "group", "qualifier", "sensor", "message"];

  if (cid) {

    for (var i = 0; i < adapter.config.keys.length; i++) {

      var key = adapter.config.keys[i];

      if (key.subscriber == cid.subscriber) {

        var id = getSubscriberID(cid.subscriber);

        for (var j = 0; j < states.length; j++) {

          adapter.setState(id + '.' + states[j], {
            val: cid[states[j]],
            ack: true
          });

        }

        break;

      }

    }

  }

}


// *****************************************************************************************************
// start socket server for listining for contact IDs
// *****************************************************************************************************
function serverStart() {

  server = net.createServer(onClientConnected);

  server.listen(adapter.config.port, adapter.config.bind, function() {

    var text = 'Contact ID Server listening on IP-Adress: ' + server.address().address + ':' + server.address().port;
    adapter.log.info(text);

  });

}


function byteToHexString(uint8arr) {
  if (!uint8arr) {
    return '';
  }

  var hexStr = '';
  for (var i = 0; i < uint8arr.length; i++) {
    var hex = (uint8arr[i] & 0xff).toString(16);
    hex = (hex.length === 1) ? '0' + hex : hex;
    hexStr += hex;
  }

  return hexStr.toUpperCase();
}

function sia(data) {

  var sia = {};
  var len = data.length - 1;
  var tmp = null;
  var str = null;
  var m = null;
  var n = null;
  var regex = null;

  if (data && data[0] == 0x0a && data[len] == 0x0d) {

    sia.lf = data[0]; // <lf>
    sia.crc = data.subarray(1, 3); // <crc>
    sia.len = parseInt((data.subarray(3, 7)).toString(), 16); // length of data
    sia.cr = data[len]; // <cr>

    str = (data.subarray(7, len)).toString(); // data
    regex = /\"(.+)\"(\d{4})(.*)\#(.+)\[(.*)\](.*)/gm;
    // const str = `"SIA-DCS"0171L0#alarmanlage[alarmanlage|Nri1OP0001*Familie*]_08:24:11,06-04-2018`;

    if ((m = regex.exec(str)) !== null && m.length == 6) {

      sia.id = m[1]; // id
      sia.seq = m[2]; // sqeuence number

      // Receiver Number
      try {
        sia.rpref = (/R(\d{1,6})/gm).exec(m[3])[1];
      } catch (e) {
        sia.rpref = null;
      }

      // Account Number
      try {
        sia.lpref = (/L(\d{1,6})/gm).exec(m[3])[1];
      } catch (e) {
        sia.lpref = null;
      }

      sia.act = m[4]; // acount number

      // timestamp
      try {
        sia.ts = (/_(.+)/gm).exec(m[6])[1];
      } catch (e) {
        sia.ts = null;
      }


      // Message
      sia.data = m[5];
      tmp = sia.data.split("|");

      for(var i=0; i<tmp.length; i++) {
    
      }

    }

  }

  return sia;

}

// *****************************************************************************************************
// alarm system connected and sending contact ID message
// *****************************************************************************************************
function onClientConnected(sock) {

  var remoteAddress = sock.remoteAddress + ':' + sock.remotePort;
  var strclose = "close"
  var len = strclose.length;
  var ack = null;

  // adapter.log.info('New client connected: ' + remoteAddress);

  sock.on('data', function(data) {

    var strdata = data.toString().trim();
    var h = byteToHexString(data);
    sia(data);
    adapter.log.info(h);

    // [alarmanlage 18140101001B4B6]
    // [alarmanlage 18160200000C5B7]
    adapter.log.info(remoteAddress + ' sending following message: ' + strdata);

    var cid = parseCid(strdata);

    if (cid) {

      // adapter.log.info("Received message: " + JSON.stringify(cid));
      setStates(cid);

      switch (getAlarmSystem(cid.subscriber)) {

        case "lupusec_xt1":

          ack = new Buffer(1);
          ack[0] = 6; //Acknowledge Lupusex 0x6
          sock.end(ack);
          break;

        case "lupusec_xt1p":
        case "lupusec_xt2":
        case "lupusec_xt2p":
        case "lupusec_xt3":

          ack = data;
          sock.end(ack);
          break;

        default:

          sock.end();

      }

    } else {

      sock.end();

    }

  });

  sock.on('close', function() {
    adapter.log.info('connection from ' + remoteAddress + ' closed');
  });


  sock.on('error', function(err) {
    adapter.log.error('Connection ' + remoteAddress + ' error: ' + err.message);
  });

}


// *****************************************************************************************************
// parse contactid and put into object
// *****************************************************************************************************
function parseCid(data) {

  var reg = /^\[(.+) 18(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
  var match = reg.exec(data);
  var cid = null;

  if (match) {

    // <ACCT><MT><QXYZ><GG><CCC><S>
    cid = {

      message: match[0],
      subscriber: match[1].trim(),
      qualifier: match[2],
      event: match[3],
      eventtext: getEventText(match[3]),
      group: match[4],
      sensor: match[5],
      checksum: match[6]
    };

  }

  return cid;

}

// *****************************************************************************************************
// Text for Events
// *****************************************************************************************************
function getEventText(event) {

  var events = {
    '100': 'Medical',
    '101': 'Personal Emergency',
    '102': 'Fail to report in',
    '110': 'Fire',
    '111': 'Smoke',
    '112': 'Combustion',
    '113': 'Water flow',
    '114': 'Heat',
    '115': 'Pull Station',
    '116': 'Duct',
    '117': 'Flame',
    '118': 'Near Alarm',
    '120': 'Panic',
    '121': 'Duress',
    '122': 'Silent',
    '123': 'Audible',
    '124': 'Duress – Access granted',
    '125': 'Duress – Egress granted',
    '130': 'Burglary',
    '131': 'Perimeter',
    '132': 'Interior',
    '133': '24 Hour (Safe)',
    '134': 'Entry/Exit',
    '135': 'Day/night',
    '136': 'Outdoor',
    '137': 'Tamper',
    '138': 'Near alarm',
    '139': 'Intrusion Verifier',
    '140': 'General Alarm',
    '141': 'Polling loop open',
    '142': 'Polling loop short',
    '143': 'Expansion module failure',
    '144': 'Sensor tamper',
    '145': 'Expansion module tamper',
    '146': 'Silent Burglary',
    '147': 'Sensor Supervision Failure',
    '150': '24 Hour Non-Burglary',
    '151': 'Gas detected',
    '152': 'Refrigeration',
    '153': 'Loss of heat',
    '154': 'Water Leakage',
    '155': 'Foil Break',
    '156': 'Day Trouble',
    '157': 'Low bottled gas level',
    '158': 'High temp',
    '159': 'Low temp',
    '161': 'Loss of air flow',
    '162': 'Carbon Monoxide detected',
    '163': 'Tank level',
    '200': 'Fire Supervisory',
    '201': 'Low water pressure',
    '202': 'Low CO2',
    '203': 'Gate valve sensor',
    '204': 'Low water level',
    '205': 'Pump activated',
    '206': 'Pump failure',
    '300': 'System Trouble',
    '301': 'AC Loss',
    '302': 'Low system battery',
    '303': 'RAM Checksum bad',
    '304': 'ROM checksum bad',
    '305': 'System reset',
    '306': 'Panel programming changed',
    '307': 'Self- test failure',
    '308': 'System shutdown',
    '309': 'Battery test failure',
    '310': 'Ground fault',
    '311': 'Battery Missing/Dead',
    '312': 'Power Supply Overcurrent',
    '313': 'Engineer Reset',
    '320': 'Sounder/Relay',
    '321': 'Bell 1',
    '322': 'Bell 2',
    '323': 'Alarm relay',
    '324': 'Trouble relay',
    '325': 'Reversing relay',
    '326': 'Notification Appliance Ckt. # 3',
    '327': 'Notification Appliance Ckt. #4',
    '330': 'System Peripheral trouble',
    '331': 'Polling loop open',
    '332': 'Polling loop short',
    '333': 'Expansion module failure',
    '334': 'Repeater failure',
    '335': 'Local printer out of paper',
    '336': 'Local printer failure',
    '337': 'Exp. Module DC Loss',
    '338': 'Exp. Module Low Batt.',
    '339': 'Exp. Module Reset',
    '341': 'Exp. Module Tamper',
    '342': 'Exp. Module AC Loss',
    '343': 'Exp. Module self-test fail',
    '344': 'RF Receiver Jam Detect',
    '350': 'Communication trouble',
    '351': 'Telco 1 fault',
    '352': 'Telco 2 fault',
    '353': 'Long Range Radio xmitter fault',
    '354': 'Failure to communicate event',
    '355': 'Loss of Radio supervision',
    '356': 'Loss of central polling',
    '357': 'Long Range Radio VSWR problem',
    '370': 'Protection loop',
    '371': 'Protection loop open',
    '372': 'Protection loop short',
    '373': 'Fire trouble',
    '374': 'Exit error alarm (zone)',
    '375': 'Panic zone trouble',
    '376': 'Hold-up zone trouble',
    '377': 'Swinger Trouble',
    '378': 'Cross-zone Trouble',
    '380': 'Sensor trouble',
    '381': 'Loss of supervision - RF',
    '382': 'Loss of supervision - RPM',
    '383': 'Sensor tamper',
    '384': 'RF low battery',
    '385': 'Smoke detector Hi sensitivity',
    '386': 'Smoke detector Low sensitivity',
    '387': 'Intrusion detector Hi sensitivity',
    '388': 'Intrusion detector Low sensitivity',
    '389': 'Sensor self-test failure',
    '391': 'Sensor Watch trouble',
    '392': 'Drift Compensation Error',
    '393': 'Maintenance Alert',
    '400': 'Open/Close',
    '401': 'O/C by user',
    '402': 'Group O/C',
    '403': 'Automatic O/C',
    '404': 'Late to O/C (Note: use 453, 454 instead )',
    '405': 'Deferred O/C (Obsolete- do not use )',
    '406': 'Cancel',
    '407': 'Remote arm/disarm',
    '408': 'Quick arm',
    '409': 'Keyswitch O/C',
    '441': 'Armed STAY',
    '442': 'Keyswitch Armed STAY',
    '450': 'Exception O/C',
    '451': 'Early O/C',
    '452': 'Late O/C',
    '453': 'Failed to Open',
    '454': 'Failed to Close',
    '455': 'Auto-arm Failed',
    '456': 'Partial Arm',
    '457': 'Exit Error (user)',
    '458': 'User on Premises',
    '459': 'Recent Close',
    '461': 'Wrong Code Entry',
    '462': 'Legal Code Entry',
    '463': 'Re-arm after Alarm',
    '464': 'Auto-arm Time Extended',
    '465': 'Panic Alarm Reset',
    '466': 'Service On/Off Premises',
    '411': 'Callback request made',
    '412': 'Successful download/access',
    '413': 'Unsuccessful access',
    '414': 'System shutdown command received',
    '415': 'Dialer shutdown command received',
    '416': 'Successful Upload',
    '421': 'Access denied',
    '422': 'Access report by user',
    '423': 'Forced Access',
    '424': 'Egress Denied',
    '425': 'Egress Granted',
    '426': 'Access Door propped open',
    '427': 'Access point Door Status Monitor trouble',
    '428': 'Access point Request To Exit trouble',
    '429': 'Access program mode entry',
    '430': 'Access program mode exit',
    '431': 'Access threat level change',
    '432': 'Access relay/trigger fail',
    '433': 'Access RTE shunt',
    '434': 'Access DSM shunt',
    '501': 'Access reader disable',
    '520': 'Sounder/Relay Disable',
    '521': 'Bell 1 disable',
    '522': 'Bell 2 disable',
    '523': 'Alarm relay disable',
    '524': 'Trouble relay disable',
    '525': 'Reversing relay disable',
    '526': 'Notification Appliance Ckt. # 3 disable',
    '527': 'Notification Appliance Ckt. # 4 disable',
    '531': 'Module Added',
    '532': 'Module Removed',
    '551': 'Dialer disabled',
    '552': 'Radio transmitter disabled',
    '553': 'Remote Upload/Download disabled',
    '570': 'Zone/Sensor bypass',
    '571': 'Fire bypass',
    '572': '24 Hour zone bypass',
    '573': 'Burg. Bypass',
    '574': 'Group bypass',
    '575': 'Swinger bypass',
    '576': 'Access zone shunt',
    '577': 'Access point bypass',
    '601': 'Manual trigger test report',
    '602': 'Periodic test report',
    '603': 'Periodic RF transmission',
    '604': 'Fire test',
    '605': 'Status report to follow',
    '606': 'Listen- in to follow',
    '607': 'Walk test mode',
    '608': 'Periodic test - System Trouble Present',
    '609': 'Video Xmitter active',
    '611': 'Point tested OK',
    '612': 'Point not tested',
    '613': 'Intrusion Zone Walk Tested',
    '614': 'Fire Zone Walk Tested',
    '615': 'Panic Zone Walk Tested',
    '616': 'Service Request',
    '621': 'Event Log reset',
    '622': 'Event Log 50% full',
    '623': 'Event Log 90% full',
    '624': 'Event Log overflow',
    '625': 'Time/Date reset',
    '626': 'Time/Date inaccurate',
    '627': 'Program mode entry',
    '628': 'Program mode exit',
    '629': '32 Hour Event log marker',
    '630': 'Schedule change',
    '631': 'Exception schedule change',
    '632': 'Access schedule change',
    '641': 'Senior Watch Trouble',
    '642': 'Latch-key Supervision',
    '651': 'Reserved for Ademco Use',
    '652': 'Reserved for Ademco Use',
    '653': 'Reserved for Ademco Use',
    '654': 'System Inactivity',
  }

  return events[event];

}
