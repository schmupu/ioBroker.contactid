"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var import_contactid = require("./lib/contactid");
class contactid extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "contactid"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("objectChange", this.onObjectChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    this.log.info(`Starting: ${this.namespace}`);
    const contactid2 = new import_contactid.ContactID(this);
    if (contactid2) {
      await import_contactid.ContactID.wait(5);
      contactid2.deleteObjects();
      contactid2.createObjects();
      contactid2.serverStart();
    } else {
      await this.setStateAsync("info.connection", { val: false, ack: true });
    }
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback callback function
   */
  async onUnload(callback) {
    try {
      callback();
    } catch (error) {
      callback();
    }
    await this.setStateAsync("info.connection", { val: true, ack: true });
  }
  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  */
  onObjectChange(id, obj) {
    if (obj) {
      this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    } else {
      this.log.info(`object ${id} deleted`);
    }
  }
  /**
   * Is called if a subscribed state changes.
   *
   * @param id id
   * @param state state
   */
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  // /**
  //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
  //  */
  // private onMessage(obj: ioBroker.Message): void {
  //     if (typeof obj === 'object' && obj.message) {
  //         if (obj.command === 'send') {
  //             // e.g. send email or pushover or whatever
  //             this.log.info('send command');
  //             // Send response in callback if required
  //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
  //         }
  //     }
  // }
}
if (require.main !== module) {
  module.exports = (options) => new contactid(options);
} else {
  (() => new contactid())();
}
//# sourceMappingURL=main.js.map
