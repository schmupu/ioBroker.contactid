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
  async onReady() {
    this.log.info(`Starting: ${this.namespace}`);
    const contactid2 = new import_contactid.ContactID(this);
    if (contactid2) {
      await this.setStateAsync("info.connection", { val: true, ack: true });
      await import_contactid.ContactID.wait(5);
      contactid2.deleteObjects();
      contactid2.createObjects();
      contactid2.serverStart();
    } else {
      await this.setStateAsync("info.connection", { val: false, ack: true });
    }
  }
  async onUnload(callback) {
    try {
      await this.setStateAsync("info.connection", { val: true, ack: true });
      callback();
    } catch (error) {
      callback();
    }
  }
  onObjectChange(id, obj) {
    if (obj) {
      this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    } else {
      this.log.info(`object ${id} deleted`);
    }
  }
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new contactid(options);
} else {
  (() => new contactid())();
}
//# sourceMappingURL=main.js.map
