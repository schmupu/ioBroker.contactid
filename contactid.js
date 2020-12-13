/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

const utils = require('@iobroker/adapter-core');
const dp = require(__dirname + '/lib/datapoints');
const net = require('net');
const adapterName = require('./package.json').name.split('.').pop();
let server = null; // Server instance
let adapter;

function startAdapter(options) {
  options = options || {};
  options.name = adapterName;
  adapter = new utils.Adapter(options);

  // *****************************************************************************************************
  // is called when adapter shuts down - callback has to be called under any circumstances!
  // *****************************************************************************************************
  adapter.on('unload', function (callback) {
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
  // is called when databases are connected and adapter received configuration.
  // start here!
  // *****************************************************************************************************
  adapter.on('ready', function () {
    adapter.log.info("Starting : " + adapter.namespace);
    main();
  });
  return adapter;
}

// *****************************************************************************************************
// Main function
// *****************************************************************************************************
function main() {
  // delete not used / missing object in configuration
  deleteObjects();
  // add object from configuration.
  createObjects();
  // start socket server
  serverStart();
  // in this contactid all states changes inside the adapters namespace are subscribed
  // adapter.subscribeStates('*');
}

// *****************************************************************************************************
// convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
// *****************************************************************************************************
function getSubscriberID(subscriber) {
  let id = subscriber.replace(/[.\s]+/g, '_');
  return id;
}

// *****************************************************************************************************
// delete channel and states which are missing in configuration
// *****************************************************************************************************
function deleteChannel(obj) {
  // adapter.log.info('deleteChannel: ' + JSON.stringify(obj));
  // search recrusive for channel name. If found and missing in
  // configuration, delete channel and all states
  Object.keys(obj).forEach((key) => {
    if (obj[key] && typeof obj[key] === 'object') {
      deleteChannel(obj[key]); // recurse.
    } else {
      if (obj[key] == 'channel') {
        let found = false;
        let channelname = obj.common.name;
        // Channel Name ist ein subscriber
        for (let i = 0; i < adapter.config.keys.length; i++) {
          let keyc = adapter.config.keys[i];
          let idc = getSubscriberID(keyc.subscriber);
          if (idc == channelname) {
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
function deleteObjects() {
  adapter.getAdapterObjects(function (obj) {
    deleteChannel(obj);
  });
}

// *****************************************************************************************************
// create for every ID a channel and create a few states
// *****************************************************************************************************
function createObjectCID(id, key) {
  let obj = dp.dpCID || {};
  adapter.setObjectNotExists(id, {
    type: 'channel',
    common: {
      name: key.subscriber
    },
    native: {}
  });
  for (let prop in obj) {
    let sid = id + '.' + prop;
    let parameter = JSON.parse(JSON.stringify(obj[prop]));
    parameter.name = key.subscriber + ' ' + parameter.name;
    adapter.setObjectNotExists(sid, {
      type: 'state', 
      common: parameter, 
      native: {}
    });
  }
}
// *****************************************************************************************************
// read configuration, and create for all subscribers a channel and states
// *****************************************************************************************************
function createObjects() {
  for (let i = 0; i < adapter.config.keys.length; i++) {
    let key = adapter.config.keys[i];
    let id = getSubscriberID(key.subscriber);
    createObjectCID(id, key);
  }
}
// *****************************************************************************************************
// read configuration by subscriber and return the alarmsytem
// *****************************************************************************************************
function getAlarmSystem(subscriber) {
  for (let i = 0; i < adapter.config.keys.length; i++) {
    let key = adapter.config.keys[i];
    if (key.subscriber == subscriber) {
      return key.alarmsystem;
    }
  }
  return null;
}
// *****************************************************************************************************
// Acknowledge for CID
// *****************************************************************************************************
function ackCID(cid) {
  let ack = null;
  switch (getAlarmSystem(cid.subscriber)) {
    case "lupusec_xt1":
      ack = Buffer.alloc(1);
      ack[0] = 6; //Acknowledge Lupusex 0x6
      break;
    case "lupusec_xt1p":
    case "lupusec_xt2":
    case "lupusec_xt2p":
    case "lupusec_xt3":
      // ack = cid.data; // komplette Nachricht wieder zurückegeben
      ack = Buffer.alloc(1);
      ack[0] = 6; //Acknowledge Lupusex 0x6
      break;
    default:
      ack = null;
  }
  return ack;
}
// *****************************************************************************************************
// Set state for contact id message
// *****************************************************************************************************
function setStatesCID(cid) {
  let obj = dp.dpCID || {};
  let val = null;
  if (cid) {
    for (let i = 0; i < adapter.config.keys.length; i++) {
      let key = adapter.config.keys[i];
      if (key.subscriber == cid.subscriber) {
        let id = getSubscriberID(cid.subscriber);
        for (let prop in obj) {
          let sid = id + '.' + prop;
          switch (prop) {
            case 'subscriber':
              val = cid.subscriber;
              break;
            case 'event':
              val = cid.event;
              break;
            case 'eventtext':
              val = cid.eventtext;
              break;
            case 'group':
              val = cid.group;
              break;
            case 'qualifier':
              val = cid.qualifier;
              break;
            case 'sensor':
              val = cid.sensor;
              break;
            case 'message':
              val = cid.data;
              break;
            default:
              val = null;
          }
          adapter.setState(sid, {
            val: val, 
            ack: true
          });
        }
      }
    }
  }
}

// *****************************************************************************************************
// start socket server for listining for contact IDs
// *****************************************************************************************************
function serverStart() {
  server = net.createServer(onClientConnected);
  server.listen(adapter.config.port, adapter.config.bind, function () {
    let text = 'Contact ID Server listening on IP-Adress: ' + server.address().address + ':' + server.address().port;
    adapter.log.info(text);
  });
}

// *****************************************************************************************************
// alarm system connected and sending contact ID message
// *****************************************************************************************************
function onClientConnected(sock) {
  let remoteAddress = sock.remoteAddress + ':' + sock.remotePort;
  let ack = null;
  // adapter.log.info('New client connected: ' + remoteAddress);
  sock.on('data', function (data) {
    let strdata = data.toString().trim();
    adapter.log.info(remoteAddress + ' sending following message: ' + strdata);
    // [alarmanlage 18140101001B4B6]
    // [alarmanlage 18160200000C5B7]
    let cid = parseCID(strdata);
    if (cid) {
      // adapter.log.info("Received message: " + JSON.stringify(cid));
      setStatesCID(cid);
      ack = ackCID(cid);
      sock.end(ack);
    } else {
      sock.end();
    }
  });
  sock.on('close', function () {
    adapter.log.info('connection from ' + remoteAddress + ' closed');
  });
  sock.on('error', function (err) {
    adapter.log.error('Connection ' + remoteAddress + ' error: ' + err.message);
  });
}

// *****************************************************************************************************
// parse contactid and put into object
// *****************************************************************************************************
function parseCID(data) {
  let reg = /^\[(.+) 18(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
  let match = reg.exec(data);
  let cid = null;
  if (match) {
    // <ACCT><MT><QXYZ><GG><CCC><S>
    cid = {
      data: data
      , subscriber: match[1].trim()
      , qualifier: match[2]
      , event: match[3]
      , eventtext: getEventText(match[3])
      , group: match[4]
      , sensor: match[5]
      , checksum: match[6]
    };
  }
  return cid;
}

// *****************************************************************************************************
// Text for Events
// *****************************************************************************************************
function getEventText(event) {
  let events = dp.events || [];
  return events[event];
}

// If started as allInOne mode => return function to create instance
if (typeof module !== "undefined" && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
}