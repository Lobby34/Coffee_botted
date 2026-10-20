'use strict';

const counters = require('../lib/messageCounterStore');

module.exports = {
  name: 'zuh',
  description: 'Show the persistent zuh message count.',
  matches: message => message.toLowerCase().includes('zuh'),
  async observe({ audit } = {}) {
    const count = await counters.increment('zuh');
    audit?.set({ count });
  },
  async execute({ client, channel, audit }) {
    const count = await counters.get('zuh');
    audit?.set({ count });
    await client.say(channel, `${count} zuh .`);
  },
};
