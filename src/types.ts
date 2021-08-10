import { NetConnectOpts as NetConnectionOptions } from "net";
import { ConnectionOptions as TLSConnectionOptions } from "tls";
import WebSocket from "ws";

export enum ClientState {
  Disconnected,
  Connecting,
  Ready,
  Quiting
}
type WebSocketOptions = {
  mode: 'ws';
  url: string;
  wsOptions?: WebSocket.ClientOptions;
  wsProtocols?: string | string[];
};
type NetOptions = {
  mode: 'net';
  netOptions?: NetConnectionOptions;
};
type TLSOptions = {
  mode: 'tls';
  tlsOptions?: TLSConnectionOptions;
};
type SharedSocketOptions = {
  host: string;
  port: number;
};
type SocketOptions = SharedSocketOptions & (NetOptions | TLSOptions);
type SharedOptions = {
  nickname: string;
  autoReconnect?: boolean;
  preConnectCommands?: string[];
  postConnectCommands?: string[];
};
export type TwitchOptions = {
  oauth?: string;
};
export type IRCOptions = SharedOptions & (SocketOptions | WebSocketOptions);
