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
var import_events = require("events");
var net = __toESM(require("net"));
var dp = __toESM(require("./datapoints"));
var tools = __toESM(require("./tools"));
class ContactID extends import_events.EventEmitter {
  subscribers;
  port;
  host;
  logger;
  /**
   * Contructor
   *
   * @param parameter parameter
   * @param parameter.host bind host
   * @param parameter.port bind port
   * @param parameter.logger logger
   */
  constructor(parameter) {
    super();
    this.host = parameter.host;
    this.port = parameter.port;
    this.subscribers = [];
    if (parameter.logger) {
      this.logger = {
        info: parameter.logger.info ? parameter.logger.info : parameter.logger,
        debug: parameter.logger.debug ? parameter.logger.debug : parameter.logger,
        error: parameter.logger.error ? parameter.logger.error : parameter.logger
      };
    }
  }
  /**
   * Set Subscribers
   *
   * @param subcribers subscriber
   */
  setSubscribers(subcribers) {
    this.subscribers = subcribers;
    if (this.subscribers.length === 0) {
      throw new Error(`Subscribers are missing!`);
    }
  }
  /**
   * read configuration by subscriber and return the alarmsytem
   *
   * @param subscriber subscriber
   * @returns alarmsystem
   */
  getAlarmSystem(subscriber) {
    return this.getSubscriberInfo(subscriber).alarmsystem;
  }
  /**
   * Get configuratoin for subscriber
   *
   * @param subscriber subscriber
   * @returns configuration
   */
  getSubscriberInfo(subscriber) {
    for (const key of this.subscribers) {
      if (key.subscriber === subscriber) {
        return key;
      }
    }
    throw new Error(`Subscriber ${subscriber} unknown. Not found in configuratin!`);
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
    if (!data) {
      throw new Error(`Could not parse ContactID message, because it is empty`);
    }
    const strdata = data.toString().trim();
    const reg = /^\[(.+) (.{2})(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
    const match = reg.exec(strdata);
    if (match) {
      const cid = {
        data: strdata,
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
    throw new Error(`Could not parse ContactID message ${strdata}.`);
  }
  /**
   * start socket server for listining for contact IDs
   */
  serverStartTCP() {
    const servertcp = net.createServer((sock) => {
      const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
      this.logger && this.logger.debug(`New client connected: ${remoteAddress}`);
      sock.on("data", (data) => {
        try {
          this.emit("data", data);
          this.logger && this.logger.info(`received from ${remoteAddress} following data: ${JSON.stringify(data)}`);
          this.logger && this.logger.info(`received from ${remoteAddress} following message: ${data.toString().trim()}`);
          const cid = this.parseCID(data);
          this.logger && this.logger.debug(`Paresed message: ${JSON.stringify(cid)}`);
          this.logger && this.logger.debug(`Paresed message: ${JSON.stringify(cid)}`);
          const ack = this.ackCID(cid);
          this.emit("cid", cid, void 0);
          this.logger && this.logger.info(`sending to ${remoteAddress} following ACK message: ${ack.toString().trim()}`);
          sock.end(ack);
        } catch (err) {
          this.logger && this.logger.info("Received message could not be parsed!");
          this.emit("sia", void 0, tools.getErrorMessage(err));
          sock.end();
        }
      });
      sock.on("close", () => {
        this.logger && this.logger.info(`connection from ${remoteAddress} closed`);
      });
      sock.on("error", (err) => {
        this.logger && this.logger.error(`Connection ${remoteAddress} error:  ${tools.getErrorMessage(err)}`);
        this.emit("error", tools.getErrorMessage(err));
      });
    });
    servertcp.listen(this.port, this.host, () => {
      this.logger && this.logger.info(`ContactID Server listening on IP-Adress (TCP): ${this.host}:${this.port}`);
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
