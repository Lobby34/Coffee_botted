'use strict';

const counters = require('../lib/messageCounterStore');

module.exports = {
  name: 'zuh',
  description: 'Show the persistent zuh message count.',
  matches: message => message.toLowerCase().includes('zuh'),
  async observe() {
    await counters.increment('zuh');
  },
  async execute({ client, channel }) {
    const count = await counters.get('zuh');
    await client.say(channel, `${count} zuh .`);
  },
};
