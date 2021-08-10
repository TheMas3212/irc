import { BaseClient } from "./baseClient";
import { Channel, IClient, Message } from "./client";
import { IRCOptions, TwitchOptions } from "./types";

interface ITwitchClient extends IClient {
  on(event: string, listener: (...args: any[]) => void): void;
  on(event: 'message', listener: (msg: TwitchMessage) => void): void;
}
class TwitchClient extends BaseClient implements ITwitchClient {
  private oauth: string;
  constructor(options: TwitchOptions & IRCOptions) {
    super(options);
    this.oauth = options.oauth;
  }
  joinChannel(channel: string): Promise<Channel> {
    throw new Error("Method not implemented.");
  }
  leaveChannel(channel: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

export class TwitchMessage extends Message {
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