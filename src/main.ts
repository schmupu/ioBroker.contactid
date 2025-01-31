/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import * as fs from 'fs';
import * as cidmanager from './lib/contactid';
import * as dp from './lib/datapoints';
import * as tools from './lib/tools';

// Load your modules here, e.g.:
// import * as fs from "fs";

class contactid extends utils.Adapter {
    private cidclient: any;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'contactid',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        this.log.info(`Starting Adapter ${this.namespace} in version ${this.version}`);
        // await tools.wait(10);
        await this.setState('info.connection', { val: true, ack: true });
        this.subscribeStates('*');
        await this.deleteObjects();
        await this.createObjects();
        const subscribers: cidmanager.ifsubscriber[] = this.config.keys;
        try {
            this.cidclient = new cidmanager.ContactID({
                host: this.config.bind,
                port: this.config.port,
                logger: this.log,
            });
            this.cidclient.setSubscribers(subscribers);

            this.cidclient.serverStartTCP();
        } catch (err) {
            this.log.error(`Error (1): ${tools.getErrorMessage(err)}`);
        }
        this.cidclient.on('cid', async (cid: cidmanager.ifCID, err: any) => {
            if (cid) {
                try {
                    await this.setStatesContactID(cid);
                } catch (err) {
                    this.log.error(`Error (2): ${tools.getErrorMessage(err)}`);
                }
            }
            if (err) {
                this.log.error(`Error (3): ${err}`);
            }
        });
        this.cidclient.on('data', (data: any) => {
            if (data) {
                this.log.debug(`Data: ${JSON.stringify(data)}`);
                if (this.config.save) {
                    const filename = `${tools.addSlashToPath(this.config.path)}cid_msg_${Date.now()}.txt`;
                    try {
                        if (!fs.existsSync(this.config.path)) {
                            this.log.info(`Creating path ${this.config.path}`);
                            fs.mkdirSync(this.config.path, { recursive: true });
                        }
                        fs.writeFileSync(filename, data, 'binary');
                        if (fs.existsSync(filename)) {
                            this.log.info(`Save ContactID message to ${filename}`);
                        } else {
                            this.log.error(`Could not write ContactID message to file ${filename}.`);
                        }
                    } catch (err) {
                        this.log.error(
                            `Could not write ContactID message to file ${filename}. ${tools.getErrorMessage(err)}`,
                        );
                    }
                }
            }
        });
        this.cidclient.on('error', async (err: any) => {
            this.log.error(`Error ${err}`);
            await this.setState('info.connection', { val: false, ack: true });
        });
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback callback function
     */
    private async onUnload(callback: () => void): Promise<void> {
        try {
            this.log.info(`Stopping sia processes, please wait!`);
            await this.setState('info.connection', { val: false, ack: true });
            callback();
        } catch (err) {
            this.log.error(`Error: ${tools.getErrorMessage(err)}`);
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        if (this.cidclient) {
            try {
                this.cidclient.deleteObjects();
                this.cidclient.createObjects();
            } catch (err) {
                this.log.error(`Error in onObjectChange ${tools.getErrorMessage(err)}`);
            }
        }
    }

    /**
     * Is called if a subscribed state changes.
     *
     * @param id id
     * @param state state
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state && !state.ack) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const stateId = id.replace(`${this.namespace}.`, '');
        }
    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     *
     * @param obj object
     */
    private onMessage(obj: ioBroker.Message): void {
        if (typeof obj === 'object' && obj.message) {
            switch (obj.command) {
                case 'msg': {
                    break;
                }
                default:
                    this.log.error(`Unknown comannd ${obj.command} in onMessage`);
                    break;
            }
        }
    }

    /**
     * convert subscriber to ID for using as channel name. Special characters and spaces are deleted.
     *
     * @param subscribernumber subscribernumber
     */
    private getSubscriberrNumberID(subscribernumber: string): string {
        const id = subscribernumber.replace(/[.\s]+/g, '_');
        return id;
    }

    public async deleteObjects(): Promise<void> {
        try {
            await this.getAdapterObjects((obj: any) => {
                for (const idx in obj) {
                    if (!idx.startsWith(`${this.namespace}.subscriber.`) || obj[idx].type !== 'channel') {
                        continue;
                    }
                    let found = false;
                    for (const key of this.config.keys as any) {
                        const idkey = `${this.namespace}.subscriber.${this.getSubscriberrNumberID(key.subscriber)}`;
                        if (idx === idkey) {
                            found = true;
                            break;
                        }
                    }
                    if (found === false) {
                        const id = idx.replace('${this.adapter.namespace}.', '');
                        this.log.debug(`Deleting object ${idx} recursive`);
                        this.delObject(id, { recursive: true });
                    }
                }
            });
        } catch (err) {
            throw new Error(`Could not delte objects ${tools.getErrorMessage(err)}`);
        }
    }

    /**
     * read configuration, and create for all subscribers a channel and states
     */
    public async createObjects(): Promise<void> {
        for (const key of this.config.keys as any) {
            const id = `subscriber.${this.getSubscriberrNumberID(key.subscriber)}`;
            const obj = dp.dpCID || {};
            const ret = await this.setObjectNotExists(id, {
                type: 'channel',
                common: {
                    name: key.subscriber,
                },
                native: {},
            });
            if (ret) {
                this.log.debug(`Create object ${id}`);
            }
            for (const prop in obj) {
                const sid = `${id}.${prop}`;
                const parameter = JSON.parse(JSON.stringify(obj[prop]));
                parameter.name = `${key.subscriber} - ${parameter.name}`;
                const ret = await this.setObjectNotExists(sid, {
                    type: 'state',
                    common: parameter,
                    native: {},
                });
                if (ret) {
                    this.log.debug(`Create object ${sid}`);
                }
            }
        }
    }

    /**
     * Set state for ContactID message
     *
     * @param cid - ContactID message
     */
    private async setStatesContactID(cid: cidmanager.ifCID): Promise<void> {
        const obj = dp.dpCID || {};
        let val: any = undefined;
        if (!cid?.subscriber) {
            throw new Error(`Subscriber is missing in ContactID message`);
        }
        this.log.debug(`setStatesContactID for ${cid.subscriber} : ${JSON.stringify(cid)}`);
        const id = `subscriber.${this.getSubscriberrNumberID(cid.subscriber)}`;
        if (!(await this.objectExists(id))) {
            throw new Error(`Object ${id} for subscriber ${cid.subscriber} is missing in ContactID message.`);
        }
        for (const prop in obj) {
            const sid = `${id}.${prop}`;
            switch (prop) {
                case 'subscriber':
                    val = cid.subscriber;
                    break;
                case 'msgtype':
                    val = cid.msgtype;
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
                    val = cid.data.toString();
                    break;
                default:
                    val = undefined;
            }
            this.log.debug(`Set state for id ${sid} with value ${val}`);
            await this.setState(sid, {
                val: val,
                ack: true,
            });
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new contactid(options);
} else {
    // otherwise start the instance directly
    (() => new contactid())();
}
