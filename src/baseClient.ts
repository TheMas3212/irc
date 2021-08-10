import EventEmitter from "events";
import { createConnection as createNetSocket, Socket, NetConnectOpts as NetConnectionOptions } from "net";
import { connect as createTLSSocket, TLSSocket, ConnectionOptions as TLSConnectionOptions } from "tls";
import WebSocket from "ws";
import { ClientState, IRCOptions } from "./types";
import { exhaustiveError } from "./utils";

export abstract class BaseClient extends EventEmitter {
  readonly mode: 'ws' | 'tls' | 'net';
  private _status: ClientState;
  private url: string;
  private host: string;
  private port: number;
  private socket: WebSocket | Socket | TLSSocket;
  private tlsOptions: TLSConnectionOptions;
  private netOptions: NetConnectionOptions;
  private wsProtocols: string | string[];
  private wsOptions: WebSocket.ClientOptions;
  private connectingPromise: Promise<void>;
  private readyPromise: Promise<void>;
  protected nickname: string;
  preConnectCommands: string[];
  postConnectCommands: string[];
  autoReconnect: boolean;
  constructor(options: IRCOptions) {
    super();
    this._status = ClientState.Disconnected;
    this.mode = options.mode;
    this.nickname = options.nickname;
    this.preConnectCommands = options.preConnectCommands ?? [];
    this.postConnectCommands = options.postConnectCommands ?? [];
    this.autoReconnect = options.autoReconnect ?? true;
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
  get status() {
    return this._status;
  }
  connect() {
    if (this._status === ClientState.Quiting) {
      return Promise.reject();
    }
    if (this._status === ClientState.Disconnected) {
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
  waitReady(): Promise<void> {
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
        if (this.autoReconnect) {
          this.connect();
        }
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
        if (this.autoReconnect) {
          this.connect();
        }
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
        if (this.autoReconnect) {
          this.connect();
        }
      });
      this.socket.on('data', (data: string) => {
        this.processDataChunk(data);
      });
    });
  }
  private processDataChunk(chunk: string) {
    console.log(JSON.stringify(chunk));

  }
}
