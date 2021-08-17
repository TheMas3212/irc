import { BaseChannel, BaseChannelManager, BaseClient } from "./baseClient";
import { IRCMessage } from "./Message";
import { IRCOptions, SocketCloseEvent } from "./types";

class IRCChannelManager extends BaseChannelManager<IRCChannel> {
  constructor(client: IRCClient) {
    super(client, IRCChannel);
  }
}

export class IRCChannel extends BaseChannel {
  constructor(manager: IRCChannelManager, name: string) {
    super(manager, name);
  }
}

export interface IRCClient {
  on(event: 'message', listener: (msg: IRCMessage) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'socketOpen', listener: () => void): this;
  on(event: 'socketError', listener: (error: Error) => void): this;
  on(event: 'socketClose', listener: (obj: SocketCloseEvent) => void): this;
  on(event: 'channel-join' | 'channel-part', listener: (channelName: string) => void): this;
}

export class IRCClient extends BaseClient<IRCChannel> {
  readonly channels: IRCChannelManager;
  constructor(options: IRCOptions) {
    super(options);
    this.channels = new IRCChannelManager(this);
  }
}