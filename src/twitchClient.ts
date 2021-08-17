import { BaseClient, BaseChannel, BaseChannelManager } from "./baseClient";
import { IRCMessage } from "./Message";
import { IRCOptions, SocketCloseEvent, TwitchOptions } from "./types";

class TwitchChannelManager extends BaseChannelManager<TwitchChannel> {
  constructor(client: TwitchClient) {
    super(client, TwitchChannel);
  }
}

export class TwitchChannel extends BaseChannel {
  constructor(manager: TwitchChannelManager, name: string) {
    super(manager, name);
  }
}

export class TwitchMessage extends IRCMessage {
  constructor(data: string) {
    super(data);
  }
  get bits() {
    const bits = this.tags['bits'];
    return parseInt(bits) || 0;
  }
  get isModerator() {
    return this.tags['badges'] && (this.tags['badges'].includes('moderator') || this.isBroadcaster);
  }
  get isBroadcaster() {
    return this.tags['badges'] && (this.tags['badges'].includes('broadcaster'));
  }
  get isSubscriber() {
    return this.tags['badges'] && (this.tags['badges'].includes('subscriber'));
  }
  get isTurbo() {
    return this.tags['badges'] && (this.tags['badges'].includes('turbo'));
  }
  get isPrime() {
    return this.tags['badges'] && (this.tags['badges'].includes('premium'));
  }
  get isPartner() {
    return this.tags['badges'] && (this.tags['badges'].includes('partner'));
  }
  get isVIP() {
    return this.tags['badges'] && (this.tags['badges'].includes('vip'));
  }
  get isAdmin() {
    return this.tags['badges'] && (this.tags['badges'].includes('admin'));
  }
  get isGlobalMod() {
    return this.tags['badges'] && (this.tags['badges'].includes('global_mod'));
  }
  get isStaff() {
    return this.tags['badges'] && (this.tags['badges'].includes('staff'));
  }
  // TODO gettings for:
  // bits-charity
  // bits-leader
  // bits
  get color() {
    return this.tags['color'];
  }
  get message() {
    switch (this.command) {
      case 'WHISPER':
      case 'PRIVMSG':
      case 'NOTICE': {
        return this.parameters[1];
      }
      default: {
        return undefined;
      }
    }
  }
}

type PartialTwitchConfig = {
  mode: 'ws';
  url: string;
} | {
  mode: 'tls' | 'net';
  host: string;
  port: number;
}

export interface TwitchClient extends BaseClient<TwitchChannel> {
  on(event: 'message', listener: (msg: TwitchMessage) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'socketOpen', listener: () => void): this;
  on(event: 'socketError', listener: (error: Error) => void): this;
  on(event: 'socketClose', listener: (obj: SocketCloseEvent) => void): this;
  on(event: 'channel-join' | 'channel-part', listener: (channelName: string) => void): this;
}
export class TwitchClient extends BaseClient<TwitchChannel> {
  static readonly CONFIG_SSL_WS: PartialTwitchConfig = {
    mode: 'ws',
    url: 'wss://irc-ws.chat.twitch.tv:443'
  }
  static readonly CONFIG_SSL_IRC: PartialTwitchConfig = {
    mode: 'tls',
    host: 'irc.chat.twitch.tv',
    port: 6697
  }
  static readonly CONFIG_PLAINTEXT_WS: PartialTwitchConfig = {
    mode: 'ws',
    url: 'ws://irc-ws.chat.twitch.tv:80'
  }
  static readonly CONFIG_PLAINTEXT_IRC: PartialTwitchConfig = {
    mode: 'net',
    host: 'irc.chat.twitch.tv',
    port: 6667
  }
  static readonly CAP_MEMBERSHIP = 'CAP REQ :twitch.tv/membership';
  static readonly CAP_TAGS = 'CAP REQ :twitch.tv/tags';
  static readonly CAP_COMMANDS = 'CAP REQ :twitch.tv/commands';
  static readonly CAP_ALL = 'CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands'
  static generateNickname() {
    return 'justinfan' + Math.floor(Math.random()*1000000);
  }
  private oauth: string;
  readonly channels: TwitchChannelManager;
  constructor(options: TwitchOptions & IRCOptions) {
    super(options);
    this.oauth = options.oauth;
    this.channels = new TwitchChannelManager(this);
  }
  protected connectHook() {
    if (this.oauth) {
      this.send(`PASS ${this.oauth.startsWith('oauth:') ? this.oauth : `oauth:${this.oauth}`}`);
    }
  }
  protected processMessage(data: string): TwitchMessage {
    return new TwitchMessage(data);
  }
}