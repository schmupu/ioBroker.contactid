import * as net from 'net';
import * as dp from './datapoints';

interface ifCID {
    data: any;
    subscriber: string;
    msgtype: string;
    event: string;
    eventtext: string;
    group: string;
    qualifier: string;
    sensor: string;
    checksum: string;
}

/**
 * Contact ID Klasse
 */
export class ContactID {
    private adapter: any;
    private server: any;

    /**
     * Construtor
     *
     * @param adapter iobroker adapter
     */
    public constructor(adapter: any) {
        this.adapter = adapter;
    }

    /**
     * Convert subcriber to ID for using as channel name. Special characters and spaces are deleted.
     *
     * @param subscriber subscriber
     */
    private getSubscriberID(subscriber: string): string {
        const id = subscriber.replace(/[.\s]+/g, '_');
        return id;
    }

    /**
     * read configuration by subscriber and return the alarmsytem
     *
     * @param subscriber subscriber
     */
    private getAlarmSystem(subscriber: string): string {
        for (const key of this.adapter.config.keys) {
            if (key.subscriber == subscriber) {
                return key.alarmsystem;
            }
        }
        return '';
    }

    /**
     * Acknowledge for CID
     *
     * @param cid cid
     */
    private ackCID(cid: ifCID): any {
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
            case 'lupusec_xt4':
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
     *
     * @param cid cid
     */
    private setStatesCID(cid: ifCID): void {
        const obj = dp.dpCID || {};
        let val = undefined;
        let found = false;
        if (cid) {
            for (const key of this.adapter.config.keys) {
                if (key.subscriber == cid.subscriber) {
                    const id = this.getSubscriberID(cid.subscriber);
                    found = true;
                    for (const prop in obj) {
                        const sid = `subscriber.${id}.${prop}`;
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
                        this.adapter.log.debug(`Set value ${sid} : ${val}`);
                        this.adapter.setState(sid, { val: val, ack: true });
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
    private getEventText(event: string): string {
        const events: dp.defEvents = dp.events;
        return events[event] || '';
    }

    /**
     * parse contactid and put into object
     *
     * @param data contactid message from alarm system
     */
    private parseCID(data: any): ifCID | undefined {
        const reg = /^\[(.+) (.{2})(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
        const match = reg.exec(data);
        if (match) {
            // <ACCT><MT><QXYZ><GG><CCC><S>
            const cid = {
                data: data,
                subscriber: match[1].trim(),
                msgtype: match[2],
                qualifier: match[3],
                event: match[4],
                eventtext: this.getEventText(match[4]),
                group: match[5],
                sensor: match[6],
                checksum: match[7],
            };
            return cid;
        }
        return undefined;
    }

    /**
     * Delete unused subscriber
     */
    public deleteObjects(): void {
        this.adapter.getAdapterObjects((obj: any) => {
            for (const idx in obj) {
                if (!idx.startsWith(`${this.adapter.namespace}.subscriber.`) || obj[idx].type !== 'channel') {
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
                    const id = idx.replace('${this.adapter.namespace}.', '');
                    this.adapter.log.debug(`Deleting object ${idx} recursive`);
                    this.adapter.delObject(id, { recursive: true });
                }
            }
        });
    }

    /**
     * read configuration, and create for all subscribers a channel and states
     */
    public createObjects(): void {
        for (const key of this.adapter.config.keys) {
            const id = `subscriber.${this.getSubscriberID(key.subscriber)}`;
            const obj = dp.dpCID || {};
            this.adapter.log.debug(`Create object ${id}`);
            this.adapter.setObjectNotExists(id, {
                type: 'channel',
                common: {
                    name: key.subscriber,
                },
                native: {},
            });
            for (const prop in obj) {
                const sid = `${id}.${prop}`;
                const parameter = JSON.parse(JSON.stringify(obj[prop]));
                parameter.name = `${key.subscriber} - ${parameter.name}`;
                this.adapter.log.debug(`Create object ${sid}`);
                this.adapter.setObjectNotExists(sid, {
                    type: 'state',
                    common: parameter,
                    native: {},
                });
            }
        }
    }

    /**
     * start socket server for listining for contact IDs
     */
    public serverStart(): void {
        this.server = net.createServer(sock => {
            const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
            this.adapter.log.debug(`New client connected: ${remoteAddress}`);
            sock.on('data', data => {
                const strdata = data.toString().trim();
                this.adapter.log.info(`${remoteAddress} sending following message: ${strdata}`);
                // [alarmanlage 18140101001B4B6]
                // [alarmanlage 18160200000C5B7]
                const cid = this.parseCID(strdata);
                if (cid) {
                    this.adapter.log.debug(`Received message: ${JSON.stringify(cid)}`);
                    this.setStatesCID(cid);
                    const ack = this.ackCID(cid);
                    sock.end(ack);
                } else {
                    this.adapter.log.info('Received message could not be parsed!');
                    sock.end();
                }
            });
            sock.on('close', () => {
                this.adapter.log.info(`connection from ${remoteAddress} closed`);
            });
            sock.on('error', err => {
                this.adapter.setState('info.connection', { val: false, ack: true });
                this.adapter.log.error(`Connection ${remoteAddress}, Error: ${err.message}`);
            });
        });

        this.server.listen(this.adapter.config.port, this.adapter.config.bind, () => {
            const text = `Contact ID Server listening on IP-Adress: ${this.server.address().address}:${this.server.address().port}`;
            this.adapter.setState('info.connection', { val: true, ack: true });
            this.adapter.log.info(text);
        });
    }

    /**
     * Wait (sleep) x seconds
     *
     * @param seconds time in seconds
     * @returns void
     */
    public static wait(seconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }
}
