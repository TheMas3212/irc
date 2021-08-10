
import { IRCClient, IClient } from './client';

// const client = new IRCClient({
//   mode: 'ws',
//   nickname: 'testuser',
//   url: 'ws://irc.tas.bot:6800',
//   autoReconnect: false
// });

const client: IClient = new IRCClient({
  mode: 'net',
  nickname: 'testuser',
  host: 'irc.tas.bot',
  port: 6666,
  autoReconnect: false
});

client.on('socketOpen', () => { console.log('socket open'); });
client.on('socketClose', () => { console.log('socket close'); });
client.on('socketError', () => { console.log('socket error'); });

client.connect();