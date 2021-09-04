import EventEmitter from "events";
import { createConnection as createNetSocket, Socket, NetConnectOpts as NetConnectionOptions } from "net";
import { connect as createTLSSocket, TLSSocket, ConnectionOptions as TLSConnectionOptions } from "tls";
import WebSocket from "ws";
import { IRCMessage } from "./Message";
import { ClientState, IRCOptions, SocketCloseEvent } from "./types";
import { exhaustiveError } from "./utils";
import { NUMERIC_REPLY } from "./rfc2812";

export interface BaseClient<T extends BaseChannel> {
  on(event: 'message', listener: (msg: IRCMessage) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'socketOpen', listener: () => void): this;
  on(event: 'socketError', listener: (error: Error) => void): this;
  on(event: 'socketClose', listener: (obj: SocketCloseEvent) => void): this;
  on(event: 'channel-join' | 'channel-part', listener: (channelName: string) => void): this;
}

export abstract class BaseClient<T extends BaseChannel> extends EventEmitter {
  preConnectCommands: string[];
  postConnectCommands: string[];
  autoReconnect: boolean;
  readonly mode: 'ws' | 'tls' | 'net';
  readonly url?: string;
  readonly host?: string;
  readonly port?: number;
  readonly channels: BaseChannelManager<T>;
  autojoin: string | string[];
  protected nickname: string;
  protected username: string;
  protected realname: string;
  private _status: ClientState;
  private watchdog: Watchdog;
  private socket: WebSocket | Socket | TLSSocket;
  private tlsOptions?: TLSConnectionOptions;
  private netOptions?: NetConnectionOptions;
  private wsProtocols?: string | string[];
  private wsOptions?: WebSocket.ClientOptions;
  private connectingPromise: Promise<void>;
  private readyPromise: Promise<void>;
  private dataChunk: string;
  private reconnectAttempt: number;
  private reconnectMultiplier: number;
  private reconnectMax?: number;
  private reconnectFailAtMax?: boolean;
  private static DEFAULT_RECONNECT_ATTEMPT_MULTIPLIER = 3;
  private static DEFAULT_RECONNECT_MAX = 5;
  private static DEFAULT_WATCHDOG_TIMEOUT = 1000*60*7; // 7 minutes
  constructor(options: IRCOptions) {
    super();
    this._status = ClientState.Disconnected;
    this.watchdog = new Watchdog(this.kill.bind(this), options.watchdogTimeout ?? BaseClient.DEFAULT_WATCHDOG_TIMEOUT);
    this.autojoin = options.autojoin;
    this.mode = options.mode;
    this.nickname = options.nickname;
    this.username = options.username ?? this.nickname;
    this.realname = options.realname ?? this.username;
    this.preConnectCommands = options.preConnectCommands ?? [];
    this.postConnectCommands = options.postConnectCommands ?? [];
    this.autoReconnect = options.autoReconnect ?? false;
    this.dataChunk = '';
    this.reconnectAttempt = 0;
    this.reconnectMultiplier = options.reconnectMultiplier ?? BaseClient.DEFAULT_RECONNECT_ATTEMPT_MULTIPLIER;
    this.reconnectMax = options.reconnectMax ?? BaseClient.DEFAULT_RECONNECT_MAX;
    this.reconnectFailAtMax = options.reconnectFailAtMax ?? false;
    this.on('socketOpen', this.socketOpen.bind(this));
    this.on('socketClose', this.socketClose.bind(this));
    switch (options.mode) {
      case 'ws': {
        this.url = options.url;
        this.wsProtocols = options.wsProtocols;
        this.wsOptions = options.wsOptions;
        break;
      }
      case 'tls': {
        this.host = options.host;
        this.port = options.port;
        this.tlsOptions = options.tlsOptions;
        break;
      }
      case 'net': {
        this.host = options.host;
        this.port = options.port;
        this.netOptions = options.netOptions;
        break;
      }
      default: {
        throw exhaustiveError(options, 'Invalid Client Mode');
      }
    }
  }
  public get status() {
    return this._status;
  }
  public connect() {
    if (this._status === ClientState.Quiting) {
      return Promise.reject();
    }
    if (this._status === ClientState.Disconnected) {
      this._status = ClientState.Connecting;
      this.dataChunk = '';
      switch (this.mode) {
        case 'ws': {
          this.connectingPromise = this.wsConnect();
          break;
        }
        case 'net': {
          this.connectingPromise = this.netConnect();
          break;
        }
        case 'tls': {
          this.connectingPromise = this.tlsConnect();
          break;
        }
        default: {
          throw exhaustiveError(this.mode, 'Invalid Client Mode');
        }
      }
    }
    return this.connectingPromise;
  }
  public disconnect(reason?: string): Promise<void> {
    return new Promise((resolve) => {
      if (this._status === ClientState.Ready) {
        this._status = ClientState.Quiting;
        if (reason) {
          this.send(`QUIT :${reason}`);
        } else {
          this.send('QUIT');
        }
        this.watchdog.stop();
        this.once('socketClose', () => {
          this._status = ClientState.Disconnected;
          resolve();
        });
      } else if (this._status === ClientState.Connecting) {
        this.kill();
      } else if (this._status === ClientState.Quiting) {
        this.once('socketClose', () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  public kill() {
    this.watchdog.stop();
    this._status = ClientState.Disconnected;
    if (this.socket !== undefined) {
      switch (this.mode) {
        case 'ws': {
          return (this.socket as WebSocket).terminate();
        }
        case 'net': {
          return (this.socket as Socket).destroy();
        }
        case 'tls': {
          return (this.socket as TLSSocket).destroy();
        }
        default: {
          throw exhaustiveError(this.mode, 'Invalid Client Mode');
        }
      }
    }
  }
  public waitReady(): Promise<void> {
    if (this.readyPromise === undefined) {
      this.readyPromise = new Promise((resolve) => {
        if (this._status === ClientState.Ready) {
          resolve();
        } else {
          this.once('ready', resolve);
        }
      });
    }
    return this.readyPromise;
  }
  private wsConnect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket = new WebSocket(this.url, this.wsProtocols, this.wsOptions);
      this.socket.on('open', () => {
        this.emit('socketOpen');
        resolve();
      });
      this.socket.on('error', (error: Error) => {
        this.emit('socketError', error);
      });
      this.socket.on('close', (code: number, reason: string) => {
        this._status = ClientState.Disconnected;
        this.socket = undefined;
        this.emit('socketClose', {code, reason});
      });
      this.socket.on('message', (data: WebSocket.Data, isBinary: boolean) => {
        if (isBinary) {
          this.processDataChunk(data.toString('utf8'));
        } else {
          this.processDataChunk(data as string);
        }
      });
    });
  }
  private netConnect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket = createNetSocket({
        host: this.host,
        port: this.port,
        ...this.netOptions
      });
      this.socket.setNoDelay(true);
      this.socket.setEncoding('utf8');
      this.socket.on('connect', () => {
        this.emit('socketOpen');
        resolve();
      });
      this.socket.on('error', (error: Error) => {
        this.emit('socketError', error);
      });
      this.socket.on('close', (hadError: boolean) => {
        this._status = ClientState.Disconnected;
        this.socket = undefined;
        this.emit('socketClose', {hadError});
      });
      this.socket.on('data', (data: string) => {
        this.processDataChunk(data);
      });
    });
  }
  private tlsConnect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket = createTLSSocket({
        host: this.host,
        port: this.port,
        ...this.tlsOptions
      });
      this.socket.setNoDelay(true);
      this.socket.setEncoding('utf8');
      this.socket.on('connect', () => {
        this.emit('socketOpen');
        resolve();
      });
      this.socket.on('error', (error: Error) => {
        this.emit('socketError', error);
      });
      this.socket.on('close', (hadError: boolean) => {
        this._status = ClientState.Disconnected;
        this.socket = undefined;
        this.emit('socketClose', {hadError});
      });
      this.socket.on('data', (data: string) => {
        this.processDataChunk(data);
      });
    });
  }
  protected connectHook() {}
  private socketOpen() {
    this.watchdog.start();
    for (const command of this.preConnectCommands) {
      this.send(command);
    }
    this.connectHook();
    this.send(`NICK ${this.nickname}`);
    this.send(`USER ${this.username} * * :${this.realname}`);
  }
  private socketClose() {
    if (this.autoReconnect) {
      const reconnectDelay = ((this.reconnectMultiplier**this.reconnectAttempt)-1)*1000;
      this.reconnectAttempt++;
      if (this.reconnectAttempt > this.reconnectMax) {
        if (this.reconnectFailAtMax) {
          this.emit('socketError', new Error('Reconnect Failure on Socket'));
          return;
        } else {
          this.reconnectAttempt = this.reconnectMax;
        }
      }
      setTimeout(() => {
        this.connect();
      }, reconnectDelay);
    }
  }
  private processDataChunk(newChunk: string) {
    const lines = (this.dataChunk + newChunk).split('\r\n');
    this.dataChunk = lines.pop();
    for (const line of lines) {
      this.watchdog.reset();
      const msg = this.processMessage(line);
      if (msg.command === 'PING') {
        this.send(msg.raw.replace('PING', 'PONG'));
      }
      if (msg.command === NUMERIC_REPLY.ERR_NOMOTD || msg.command === NUMERIC_REPLY.RPL_MOTD) {
        for (const command of this.postConnectCommands) {
          this.send(command);
        }
        this._status = ClientState.Ready;
        this.reconnectAttempt = 0;
        if (this.autojoin) {
          if (typeof this.autojoin === 'string') {
            this.channels.join(this.autojoin);
          } else {
            for (const channel of this.autojoin) {
              this.channels.join(channel);
            }
          }
        }
        this.emit('ready');
      }
      // TODO: Handle channels
      this.emit('message', msg);
    }
  }
  protected processMessage(data: string): IRCMessage {
    return new IRCMessage(data);
  }
  public send(command: string | Buffer) {
    if (!Buffer.isBuffer(command)) {
      command = Buffer.from(command+'\r\n', 'utf8');
    } else {
      command = Buffer.concat([command, Buffer.from('\r\n', 'utf8')]);
    }
    switch (this.mode) {
      case 'ws': {
        return (this.socket as WebSocket).send(command.toString('utf8'));
      }
      case 'net': {
        return (this.socket as Socket).write(command);
      }
      case 'tls': {
        return (this.socket as TLSSocket).write(command);
      }
      default: {
        throw exhaustiveError(this.mode, 'Invalid Client Mode');
      }
    }
  }
  public join(channelName: string) {
    return this.channels.join(channelName);
  }
  public part(channelName: string) {
    return this.channels.part(channelName);
  }
}

export class Watchdog {
  private failureFunction: () => void;
  private timeout: number;
  private timer: NodeJS.Timeout;
  constructor(failureFunction: () => void, timeout: number) {
    this.failureFunction = failureFunction;
    this.timeout = timeout;
  }
  reset(): void {
    if (this.timer) {
      this.timer.refresh();
    }
  }
  start(): void {
    if (this.timer) {
      this.timer.refresh();
    } else {
      this.timer = setTimeout(() => {
        this.failureFunction();
      }, this.timeout);
      this.timer.unref();
    }
  }
  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

interface ChannelManagerConstructable<Type extends BaseChannel> {
  new(manager: BaseChannelManager<Type>, channelName: string): Type
}

export abstract class BaseChannelManager<T extends BaseChannel> extends Map<string,T> {
  readonly client: BaseClient<T>;
  private channelConstructor: ChannelManagerConstructable<T>;
  constructor(client: BaseClient<T>, channelConstructor: ChannelManagerConstructable<T>) {
    super();
    this.channelConstructor = channelConstructor;
    this.client = client;
    this.client.on('message', (msg) => {
      if (msg.command === 'JOIN') {
        const channelName = msg.parameters[1];
        if (!this.has(channelName)) {
          this.set(channelName, new this.channelConstructor(this, channelName));
        }
      }
      if (msg.command === 'PART') {
        const channelName = msg.parameters[1];
        if (this.has(channelName)) {
          this.delete(channelName);
        }
      }
    });
  }
  public join(channelName: string): Promise<T> {
    let channel = this.get(channelName);
    if (channel === undefined) {
      channel = new this.channelConstructor(this, channelName);
      this.set(channelName, channel);
    }
    return channel.join();
  }
  public part(channelName: string, reason?: string): Promise<void> {
    const channel = this.get(channelName);
    if (channel) {
      const ret = channel.part(reason);
      ret.then(() => {
        this.delete(channelName);
      });
      return ret;
    }
    return Promise.resolve();
  }
}

export abstract class BaseChannel {
  readonly manager: BaseChannelManager<BaseChannel>;
  readonly name: string;
  private joinPromise: Promise<this>;
  constructor(manager: BaseChannelManager<BaseChannel>, name: string) {
    this.manager = manager;
    this.name = name;
  }
  public join(): Promise<this> {
    if (this.joinPromise) return this.joinPromise;
    return new Promise((resolve, reject) => {
      const callback = (msg: IRCMessage) => {
        if (msg.parameters[1] === this.name) {
          if (msg.command === NUMERIC_REPLY.RPL_ENDOFNAMES) {
            this.manager.client.off('message', callback);
            return resolve(this);
          }
          if ([
            NUMERIC_REPLY.ERR_BANNEDFROMCHAN,
            NUMERIC_REPLY.ERR_INVITEONLYCHAN,
            NUMERIC_REPLY.ERR_BADCHANNELKEY,
            NUMERIC_REPLY.ERR_CHANNELISFULL,
            NUMERIC_REPLY.ERR_BADCHANMASK,
            NUMERIC_REPLY.ERR_NOSUCHCHANNEL,
            NUMERIC_REPLY.ERR_TOOMANYCHANNELS,
            NUMERIC_REPLY.ERR_TOOMANYTARGETS,
            NUMERIC_REPLY.ERR_UNAVAILRESOURCE
          ].includes(msg.command as NUMERIC_REPLY)) {
            this.manager.client.off('message', callback);
            return reject();
          }
        }
      };
      this.manager.client.on('message', callback);
      this.manager.client.send(`JOIN :${this.name}`);
    });
  }
  public part(reason?: string): Promise<void> {
    return new Promise((resolve) => {
      const callback = (msg: IRCMessage) => {
        if (msg.parameters[0] === this.name) {
          if ([
            'PART',
            NUMERIC_REPLY.ERR_NOSUCHCHANNEL,
            NUMERIC_REPLY.ERR_NOTONCHANNEL
          ].includes(msg.command as NUMERIC_REPLY)) {
            this.manager.client.off('message', callback);
            return resolve();
          }
        }
      };
      this.manager.client.on('message', callback);
      if (reason) {
        this.manager.client.send(`PART ${this.name} :${reason}`);
      } else {
        this.manager.client.send(`PART :${this.name}`);
      }
    });
  }
  public send(msg: string) {
    this.manager.client.send(`PRIVMSG ${this.name} :${msg}`);
  }
  public on(event: 'join' | 'part', listener: (channelName: string) => void) {
    this.manager.client.on(`channel-${event}`, listener);
  }
  public off(event: 'join' | 'part', listener: (channelName: string) => void) {
    this.manager.client.off(`channel-${event}`, listener);
  }
  public once(event: 'join' | 'part', listener: (channelName: string) => void) {
    this.manager.client.once(`channel-${event}`, listener);
  }
}

