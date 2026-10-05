'use strict';

const fs = require('fs');
const path = require('path');
const counterFile = process.env.MESSAGE_COUNTER_FILE || path.resolve(__dirname, '../../data/message-counters.json');
let counts = fs.existsSync(counterFile)
  ? JSON.parse(fs.readFileSync(counterFile, 'utf8')) : {};
for (const [key, value] of Object.entries(counts)) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid message counter: ${key}`);
}

module.exports = {
  increment(key) {
    const next = { ...counts, [key]: (counts[key] || 0) + 1 };
    if (!Number.isSafeInteger(next[key])) throw new Error('Message counter overflow');
    fs.mkdirSync(path.dirname(counterFile), { recursive: true, mode: 0o700 });
    // Synchronous atomic replacement keeps concurrent message handlers from losing increments.
    fs.writeFileSync(`${counterFile}.tmp`, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(`${counterFile}.tmp`, counterFile);
    counts = next;
    return counts[key];
  },
};
