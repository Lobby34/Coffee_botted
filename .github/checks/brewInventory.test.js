'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addItem, validateSlots } = require('../../src/lib/brew/inventory');

test('Brew stacks spill into new slots up to the configured capacity', () => {
  const config = { rows: 2, columns: 2, stackSize: 128 };
  const original = [{ slot: 0, item_id: 'beans', rarity: 0, quantity: 127 }];
  const next = addItem(original, 'beans', 0, 130, config);
  assert.deepEqual(next.map(slot => slot.quantity), [128,128,1]);
  assert.equal(original[0].quantity, 127);
  validateSlots(next, config);
  assert.throws(() => addItem(next, 'mug', 1, 129, config), /full/);
  assert.throws(() => addItem([], 'beans', 5, 1, config), /rarity/);
  assert.equal(addItem([], 'coffee', 5, 1, config)[0].rarity, 5);
  assert.throws(() => validateSlots(next, { rows: 1, columns: 1, stackSize: 128 }), /configuration/);
});
