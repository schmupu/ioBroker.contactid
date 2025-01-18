"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var contactid_exports = {};
__export(contactid_exports, {
  ContactID: () => ContactID
});
module.exports = __toCommonJS(contactid_exports);
var net = __toESM(require("net"));
var dp = __toESM(require("./datapoints"));
class ContactID {
  adapter;
  server;
  /**
   * Construtor
   *
   * @param adapter iobroker adapter
   */
  constructor(adapter) {
    this.adapter = adapter;
  }
  /**
   * Convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
   *
   * @param subscriber subscriber
   */
  getSubscriberID(subscriber) {
    const id = subscriber.replace(/[.\s]+/g, "_");
    return id;
  }
  /**
   * read configuration by subscriber and return the alarmsytem
   *
   * @param subscriber subscriber
   */
  getAlarmSystem(subscriber) {
    for (const key of this.adapter.config.keys) {
      if (key.subscriber == subscriber) {
        return key.alarmsystem;
      }
    }
    return "";
  }
  /**
   * Acknowledge for CID
   *
   * @param cid cid
   */
  ackCID(cid) {
    let ack = void 0;
    switch (this.getAlarmSystem(cid.subscriber)) {
      case "lupusec_xt1":
        ack = Buffer.alloc(1);
        ack[0] = 6;
        break;
      case "lupusec_xt1p":
      case "lupusec_xt2":
      case "lupusec_xt2p":
      case "lupusec_xt3":
      case "lupusec_xt4":
        ack = Buffer.alloc(1);
        ack[0] = 6;
        break;
      default:
        ack = cid.data;
    }
    return ack;
  }
  /**
   * Set state for contact id message
   *
   * @param cid cid
   */
  setStatesCID(cid) {
    const obj = dp.dpCID || {};
    let val = void 0;
    let found = false;
    if (cid) {
      for (const key of this.adapter.config.keys) {
        if (key.subscriber == cid.subscriber) {
          const id = this.getSubscriberID(cid.subscriber);
          found = true;
          for (const prop in obj) {
            const sid = `subscriber.${id}.${prop}`;
            switch (prop) {
              case "subscriber":
                val = cid.subscriber;
                break;
              case "msgtype":
                val = cid.msgtype;
                break;
              case "event":
                val = cid.event;
                break;
              case "eventtext":
                val = cid.eventtext;
                break;
              case "group":
                val = cid.group;
                break;
              case "qualifier":
                val = cid.qualifier;
                break;
              case "sensor":
                val = cid.sensor;
                break;
              case "message":
                val = cid.data.toString();
                break;
              default:
                val = void 0;
            }
            this.adapter.log.debug(`Set value ${sid} : ${val}`);
            this.adapter.setState(sid, { val, ack: true });
          }
          return;
        }
      }
      if (found === false) {
        this.adapter.log.info(`Subcriber ${cid.subscriber} not customizies.`);
      }
    }
  }
  /**
   * Text for Events
   *
   * @param event Eventnummber
   */
  getEventText(event) {
    const events = dp.events;
    return events[event] || "";
  }
  /**
   * parse contactid and put into object
   *
   * @param data contactid message from alarm system
   */
  parseCID(data) {
    const reg = /^\[(.+) (.{2})(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
    const match = reg.exec(data);
    if (match) {
      const cid = {
        data,
        subscriber: match[1].trim(),
        msgtype: match[2],
        qualifier: match[3],
        event: match[4],
        eventtext: this.getEventText(match[4]),
        group: match[5],
        sensor: match[6],
        checksum: match[7]
      };
      return cid;
    }
    return void 0;
  }
  /**
   * Delete unused subscriber
   */
  deleteObjects() {
    this.adapter.getAdapterObjects((obj) => {
      for (const idx in obj) {
        if (!idx.startsWith(`${this.adapter.namespace}.subscriber.`) || obj[idx].type !== "channel") {
          continue;
        }
        let found = false;
        for (const key of this.adapter.config.keys) {
          const idkey = `${this.adapter.namespace}.subscriber.${this.getSubscriberID(key.subscriber)}`;
          if (idx === idkey) {
            found = true;
            break;
          }
        }
        if (found === false) {
          const id = idx.replace("${this.adapter.namespace}.", "");
          this.adapter.log.debug(`Deleting object ${idx} recursive`);
          this.adapter.delObject(id, { recursive: true });
        }
      }
    });
  }
  /**
   * read configuration, and create for all subscribers a channel and states
   */
  createObjects() {
    for (const key of this.adapter.config.keys) {
      const id = `subscriber.${this.getSubscriberID(key.subscriber)}`;
      const obj = dp.dpCID || {};
      this.adapter.log.debug(`Create object ${id}`);
      this.adapter.setObjectNotExists(id, {
        type: "channel",
        common: {
          name: key.subscriber
        },
        native: {}
      });
      for (const prop in obj) {
        const sid = `${id}.${prop}`;
        const parameter = JSON.parse(JSON.stringify(obj[prop]));
        parameter.name = `${key.subscriber} - ${parameter.name}`;
        this.adapter.log.debug(`Create object ${sid}`);
        this.adapter.setObjectNotExists(sid, {
          type: "state",
          common: parameter,
          native: {}
        });
      }
    }
  }
  /**
   * start socket server for listining for contact IDs
   */
  serverStart() {
    this.server = net.createServer((sock) => {
      const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
      this.adapter.log.debug(`New client connected: ${remoteAddress}`);
      sock.on("data", (data) => {
        const strdata = data.toString().trim();
        this.adapter.log.info(`${remoteAddress} sending following message: ${strdata}`);
        const cid = this.parseCID(strdata);
        if (cid) {
          this.adapter.log.debug(`Received message: ${JSON.stringify(cid)}`);
          this.setStatesCID(cid);
          const ack = this.ackCID(cid);
          sock.end(ack);
        } else {
          this.adapter.log.info("Received message could not be parsed!");
          sock.end();
        }
      });
      sock.on("close", () => {
        this.adapter.log.info(`connection from ${remoteAddress} closed`);
      });
      sock.on("error", (err) => {
        this.adapter.setState("info.connection", { val: false, ack: true });
        this.adapter.log.error(`Connection ${remoteAddress}, Error: ${err.message}`);
      });
    });
    this.server.listen(this.adapter.config.port, this.adapter.config.bind, () => {
      const text = `Contact ID Server listening on IP-Adress: ${this.server.address().address}:${this.server.address().port}`;
      this.adapter.setState("info.connection", { val: true, ack: true });
      this.adapter.log.info(text);
    });
  }
  /**
   * Wait (sleep) x seconds
   *
   * @param seconds time in seconds
   * @returns void
   */
  static wait(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1e3));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ContactID
});
//# sourceMappingURL=contactid.js.map
