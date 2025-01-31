import { EventEmitter } from 'events';
import * as net from 'net';
import * as dp from './datapoints';
import * as tools from './tools';

/**
 * Interface subscriber
 */
export interface ifsubscriber {
    subscriber: string;
    alarmsystem: string;
}

export interface ifCID {
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
export class ContactID extends EventEmitter {
    private subscribers: ifsubscriber[];
    private port: number;
    private host: string;
    private logger: any;

    /**
     * Contructor
     *
     * @param parameter parameter
     * @param parameter.host bind host
     * @param parameter.port bind port
     * @param parameter.logger logger
     */
    public constructor(parameter: { host: string; port: number; logger?: any }) {
        super();
        this.host = parameter.host;
        this.port = parameter.port;
        this.subscribers = [];
        if (parameter.logger) {
            this.logger = {
                info: parameter.logger.info ? parameter.logger.info : parameter.logger,
                debug: parameter.logger.debug ? parameter.logger.debug : parameter.logger,
                error: parameter.logger.error ? parameter.logger.error : parameter.logger,
            };
        }
    }

    /**
     * Set Subscribers
     *
     * @param subcribers subscriber
     */
    public setSubscribers(subcribers: ifsubscriber[]): void {
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
    private getAlarmSystem(subscriber: string): string {
        return this.getSubscriberInfo(subscriber).alarmsystem;
    }

    /**
     * Get configuratoin for subscriber
     *
     * @param subscriber subscriber
     * @returns configuration
     */
    private getSubscriberInfo(subscriber: string): ifsubscriber {
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
    private parseCID(data: any): ifCID {
        if (!data) {
            throw new Error(`Could not parse ContactID message, because it is empty`);
        }
        const strdata = data.toString().trim();
        const reg = /^\[(.+) (.{2})(.)(.{3})(.{2})(.{3})(.)(.*)\]/gm;
        const match = reg.exec(strdata);
        if (match) {
            // <ACCT><MT><QXYZ><GG><CCC><S>
            const cid = {
                data: strdata,
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
        throw new Error(`Could not parse ContactID message ${strdata}.`);
    }

    /**
     * start socket server for listining for contact IDs
     */
    public serverStartTCP(): void {
        const servertcp = net.createServer(sock => {
            const remoteAddress = `${sock.remoteAddress}:${sock.remotePort}`;
            this.logger && this.logger.debug(`New client connected: ${remoteAddress}`);
            sock.on('data', data => {
                try {
                    this.emit('data', data);
                    this.logger &&
                        this.logger.info(`received from ${remoteAddress} following data: ${JSON.stringify(data)}`);
                    this.logger &&
                        this.logger.info(`received from ${remoteAddress} following message: ${data.toString().trim()}`);
                    const cid = this.parseCID(data);
                    this.logger && this.logger.debug(`Paresed message: ${JSON.stringify(cid)}`);
                    this.logger && this.logger.debug(`Paresed message: ${JSON.stringify(cid)}`);
                    const ack = this.ackCID(cid);
                    this.emit('cid', cid, undefined);
                    this.logger &&
                        this.logger.info(`sending to ${remoteAddress} following ACK message: ${ack.toString().trim()}`);
                    sock.end(ack);
                } catch (err) {
                    this.logger && this.logger.info('Received message could not be parsed!');
                    this.emit('sia', undefined, tools.getErrorMessage(err));
                    sock.end();
                }
            });
            sock.on('close', () => {
                this.logger && this.logger.info(`connection from ${remoteAddress} closed`);
            });
            sock.on('error', err => {
                this.logger && this.logger.error(`Connection ${remoteAddress} error:  ${tools.getErrorMessage(err)}`);
                this.emit('error', tools.getErrorMessage(err));
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
    public static wait(seconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }
}
