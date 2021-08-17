// TODO Refactor
export class IRCMessage {
  raw: string;
  tags: {};
  command: string;
  prefix: Prefix;
  parameters: string[];
  constructor(raw: string) {
    this.raw = raw;
    this.tags = {};
    this.parameters = [];
    let data = raw.split(' ');
    let data2 = data.shift();
    let a = data2.charAt(0);
    if (a === '@') {
      data2.slice(1).split(';').forEach((r_tag) => {
        let s_tag = r_tag.split('=', 2);
        this.tags[s_tag[0]] = s_tag[1];
      });
      data2 = data.shift();
      a = data2.charAt(0);
    }
    if (a === ':') {
      this.prefix = new Prefix(data2);
      data2 = data.shift();
      a = data2.charAt(0);
    }
    this.command = data2;
    for (; ;) {
      if (data[0] == undefined) {
        break;
      }
      else if (data[0].charAt(0) === ':') {
        let parameter = data.join(' ').slice(1);
        this.parameters.push(parameter);
        break;
      }
      else if (data.length === 1) {
        let parameter = data[0];
        this.parameters.push(parameter);
        break;
      }
      else {
        let parameter = data.shift();
        this.parameters.push(parameter);
      }
    }
  }
  get channel() {
    switch (this.command) {
      case 'PRIVMSG':
      case 'NOTICE':
      case 'HOSTTARGET':
      case 'ROOMSTATE':
      case 'USERNOTICE':
      case 'USERSTATE': {
        return this.parameters[0];
      }
      default: {
        return undefined;
      }
    }
  }
  get sender() {
    switch (this.command) {
      case 'PRIVMSG':
      case 'NOTICE': {
        return this.prefix.nickname;
      }
      default: {
        return undefined;
      }
    }
  }
  get message() {
    switch (this.command) {
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
export class Prefix {
  nickname: string;
  username: string;
  hostname: string;
  constructor(raw: string) {
    this.nickname = this.username = this.hostname = '';
    if (raw.charAt(0) === ':') {
      let raw2 = raw.slice(1).split(/[!@]/);
      this.nickname = raw2[0];
      this.username = raw2[1];
      this.hostname = raw2[2];
    }
  }
}