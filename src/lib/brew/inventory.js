'use strict';

class BrewError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function addItem(slots, itemId, rarity, quantity, config) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new BrewError('Invalid item quantity');
  if (!Number.isInteger(rarity) || rarity < 0 || rarity > (itemId === 'coffee' ? 5 : 4)) throw new BrewError('Invalid ingredient rarity');
  validateSlots(slots, config);
  const next = slots.map(slot => ({ ...slot }));
  let remaining = quantity;
  for (const slot of next.sort((a,b) => a.slot-b.slot)) {
    if (slot.item_id !== itemId || slot.rarity !== rarity) continue;
    const added = Math.min(config.stackSize - slot.quantity, remaining);
    slot.quantity += added;
    remaining -= added;
    if (!remaining) return next;
  }
  const occupied = new Set(next.map(slot => slot.slot));
  const capacity = config.rows * config.columns;
  for (let index = 0; index < capacity && remaining; index++) {
    if (occupied.has(index)) continue;
    const added = Math.min(config.stackSize, remaining);
    next.push({ slot: index, item_id: itemId, rarity, quantity: added });
    remaining -= added;
  }
  if (remaining) throw new BrewError('Inventory is full', 409);
  return next.sort((a,b) => a.slot-b.slot);
}

async function saveSlots(client, userId, slots) {
  await client.query('DELETE FROM brew_inventory WHERE user_id=$1', [userId]);
  if (slots.length) {
    await client.query('INSERT INTO brew_inventory (user_id,slot,item_id,rarity,quantity) SELECT $1,u.* FROM unnest($2::integer[],$3::text[],$4::smallint[],$5::integer[]) AS u(slot,item_id,rarity,quantity)', [userId,slots.map(s=>s.slot),slots.map(s=>s.item_id),slots.map(s=>s.rarity),slots.map(s=>s.quantity)]);
  }
  await client.query('UPDATE brew_players SET inventory_version=inventory_version+1 WHERE user_id=$1', [userId]);
}

async function loadSlots(client, userId) {
  return (await client.query('SELECT slot,item_id,rarity,quantity FROM brew_inventory WHERE user_id=$1 ORDER BY slot', [userId])).rows;
}

function validateSlots(slots, config) {
  const indices = new Set();
  for (const slot of slots) {
    if (!Number.isInteger(slot.slot) || slot.slot < 0 || slot.slot >= config.rows * config.columns ||
        indices.has(slot.slot) || !Number.isInteger(slot.quantity) || slot.quantity < 1 || slot.quantity > config.stackSize) {
      throw new BrewError('Inventory no longer fits its configuration', 409);
    }
    indices.add(slot.slot);
  }
}

module.exports = { BrewError, addItem, loadSlots, saveSlots, validateSlots };
