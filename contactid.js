'use strict';

/*
 * Created with @iobroker/create-adapter v1.30.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const dp = require(__dirname + '/lib/datapoints');
const net = require('net');
let server = undefined; // Server instance

class Contactid extends utils.Adapter {

  constructor(options) {
    super({
      ...options,
      name: 'contactid',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    // this.on('objectChange', this.onObjectChange.bind(this));
    // this.on('message', this.onMessage.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    await this.setStateAsync('info.connection', { val: true, ack: true });
    this.log.info('Starting : ' + this.namespace);
    // delete not used / missing object in configuration
    this.deleteObjects();
    // add object from configuration.
    this.createObjects();
    // start socket server
    this.serverStart();
    // in this contactid all states changes inside the adapters namespace are subscribed
    // adapter.subscribeStates('*');
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   * @param {() => void} callback
   */
  async onUnload(callback) {
    try {
      // Here you must clear all timeouts or intervals that may still be active
      await this.setStateAsync('info.connection', { val: false, ack: true });
      callback();
    } catch (e) {
      callback();
    }
  }


  /**
   * Is called if a subscribed state changes
   * @param {string} id
   * @param {ioBroker.State | null | undefined} state
   */
  // @ts-ignore
  onStateChange(id, state) {
  }

  /**
   * Convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
   * @param {*} subscriber 
   */
  getSubscriberID(subscriber) {
    let id = subscriber.replace(/[.\s]+/g, '_');
    return id;
  }

  /**
   * delete channel and states which are missing in configuration
   * @param {*} obj 
   */
  deleteChannels(obj) {
    Object.keys(obj).forEach((key) => {
      if (obj[key] && typeof obj[key] === 'object') {
        this.deleteChannels(obj[key]); // recurse.
      } else {
        if (obj[key] == 'channel') {
          let found = false;
          let channelname = obj.common.name;
          // Channel Name ist ein subscriber
          // @ts-ignore
          for (let i = 0; i < this.config.keys.length; i++) {
            // @ts-ignore
            let keyc = this.config.keys[i];
            let idc = this.getSubscriberID(keyc.subscriber);
            if (idc == channelname) {
              found = true;
            }
          }
          if (!found) {
            this.deleteChannel(channelname);
          }
        }
      }
    });
  }

  /**
   * list of all objects (devices, channel, states) for this instance. call function  deleteChannel
   * for deleting old (not used) channels in configuration
   */
  deleteObjects() {
    this.getAdapterObjects((obj) => {
      this.deleteChannels(obj);
    });
  }

  /**
   * create for every ID a channel and create a few states
   * @param {*} id 
   * @param {*} key 
   */
  createObjectCID(id, key) {
    let obj = dp.dpCID || {};
    this.setObjectNotExists(id, {
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
      this.setObjectNotExists(sid, {
        type: 'state',
        common: parameter,
        native: {}
      });
    }
  }

  /**
   * read configuration, and create for all subscribers a channel and states
   */
  createObjects() {
    // @ts-ignore
    for (let i = 0; i < this.config.keys.length; i++) {
      // @ts-ignore
      let key = this.config.keys[i];
      let id = this.getSubscriberID(key.subscriber);
      this.createObjectCID(id, key);
    }
  }

  /**
   * read configuration by subscriber and return the alarmsytem
   * @param {*} subscriber 
   */
  getAlarmSystem(subscriber) {
    // @ts-ignore
    for (let i = 0; i < this.config.keys.length; i++) {
      // @ts-ignore
      let key = this.config.keys[i];
      if (key.subscriber == subscriber) {
        return key.alarmsystem;
      }
    }
    return undefined;
  }

  /**
   * Acknowledge for CID
   * @param {*} cid 
   */
  ackCID(cid) {
    let ack = undefined;
    switch (this.getAlarmSystem(cid.subscriber)) {
      case 'lupusec_xt1':
        ack = Buffer.alloc(1);
        ack[0] = 6; //Acknowledge Lupusex 0x6
        break;
      case 'lupusec_xt1p':
      case 'lupusec_xt2':
      case 'lupusec_xt2p':
      case 'lupusec_xt3':
        // ack = cid.data; // komplette Nachricht wieder zurückegeben
        ack = Buffer.alloc(1);
        ack[0] = 6; //Acknowledge Lupusex 0x6
        break;
      default:
        ack = cid.data;
    }
    return ack;
  }

  /**
   * Set state for contact id message
   * @param {*} cid 
   */
  setStatesCID(cid) {
    let obj = dp.dpCID || {};
    let val = undefined;
    if (cid) {
      // @ts-ignore
      for (let i = 0; i < this.config.keys.length; i++) {
        // @ts-ignore
        let key = this.config.keys[i];
        if (key.subscriber == cid.subscriber) {
          let id = this.getSubscriberID(cid.subscriber);
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
                val = undefined;
            }
            this.setState(sid, {
              val: val,
              ack: true
            });
          }
        }
      }
    }
  }

  /**
   * start socket server for listining for contact IDs
   */
  serverStart() {
    server = net.createServer((sock) => {
      const remoteAddress = sock.remoteAddress + ':' + sock.remotePort;
      let ack = undefined;
      let self = this;
      // adapter.log.info('New client connected: ' + remoteAddress);
      sock.on('data', (data) => {
        let strdata = data.toString().trim();
        self.log.info(remoteAddress + ' sending following message: ' + strdata);
        // [alarmanlage 18140101001B4B6]
        // [alarmanlage 18160200000C5B7]
        let cid = self.parseCID(strdata);
        if (cid) {
          // adapter.log.info("Received message: " + JSON.stringify(cid));
          self.setStatesCID(cid);
          ack = self.ackCID(cid);
          sock.end(ack);
        } else {
          sock.end();
        }
      });
      sock.on('close', () => {
        self.log.info('connection from ' + remoteAddress + ' closed');
      });
      sock.on('error', (err) => {
        self.log.error('Connection ' + remoteAddress + ' error: ' + err.message);
      });
    });
    // @ts-ignore
    server.listen(this.config.port, this.config.bind, () => {
      let text = 'Contact ID Server listening on IP-Adress: ' + server.address().address + ':' + server.address().port;
      // @ts-ignore
      this.log.info(text);
    });
  }

  /**
   * parse contactid and put into object
   * @param {*} data 
   */
  parseCID(data) {
    let reg = /^\[(.+) 18(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
    let match = reg.exec(data);
    let cid = undefined;
    if (match) {
      // <ACCT><MT><QXYZ><GG><CCC><S>
      cid = {
        data: data
        , subscriber: match[1].trim()
        , qualifier: match[2]
        , event: match[3]
        , eventtext: this.getEventText(match[3])
        , group: match[4]
        , sensor: match[5]
        , checksum: match[6]
      };
    }
    return cid;
  }

  /**
   * Text for Events
   * @param {*} event 
   */
  getEventText(event) {
    let events = dp.events || [];
    return events[event];
  }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
  // Export the constructor in compact mode
  module.exports = (options) => new Contactid(options);
} else {
  // otherwise start the instance directly
  new Contactid();
}