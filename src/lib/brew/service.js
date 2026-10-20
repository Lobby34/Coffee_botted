'use strict';

const { randomInt, createHash } = require('node:crypto');
const { items } = require('./catalog');
const { loadConfig } = require('./config');
const { probabilities, sample } = require('./probabilities');
const { BrewError, addItem, loadSlots, saveSlots, validateSlots } = require('./inventory');

const catalog = new Map(items.map(item => [item.id,item]));
const secureRandom = () => randomInt(0,0x100000000)/0x100000000;

function createBrewService(pool, random = secureRandom) {
  async function transaction(run) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  }

  async function event(client,userId,type,details) {
    await client.query('INSERT INTO brew_events (user_id,type,details) VALUES ($1,$2,$3::jsonb)',[userId,type,JSON.stringify(details)]);
  }

  async function player(client,identity,config) {
    if (!identity || !/^\d+$/.test(identity.id) || typeof identity.login !== 'string' || !/^[a-z0-9_]{1,25}$/.test(identity.login)) throw new BrewError('Invalid Twitch identity',401);
    const inserted = await client.query('INSERT INTO brew_players (user_id,username,display_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id',[identity.id,identity.login,identity.displayName || identity.login]);
    const row = (await client.query('SELECT * FROM brew_players WHERE user_id=$1 FOR UPDATE',[identity.id])).rows[0];
    if (inserted.rowCount) {
      let slots = [];
      for (const [itemId,quantity] of Object.entries(config.starterItems)) {
        if (quantity) slots = addItem(slots,itemId,0,quantity,config.inventory);
      }
      await saveSlots(client,identity.id,slots);
      await event(client,identity.id,'starter',{ items: config.starterItems });
      row.inventory_version = String(Number(row.inventory_version)+1);
    }
    await client.query('UPDATE brew_players SET username=$2,display_name=$3 WHERE user_id=$1',[identity.id,identity.login,identity.displayName || identity.login]);
    return row;
  }

  function snapshot(row,slots,config) {
    return {
      userId: row.user_id, username: row.username,
      version: Number(row.inventory_version),
      configVersion: config.version,
      layout: config.settings.inventory,
      rarities: config.settings.rarities, catalog: items,
      slots: slots.map(slot => ({ ...slot, ...catalog.get(slot.item_id) })),
    };
  }

  function recipe(slots,selection,config) {
    if (!Array.isArray(selection) || selection.length < 5 || selection.length > 5+config.recipe.maxExtras ||
        selection.some(slot => !Number.isSafeInteger(slot) || slot < 0) || new Set(selection).size !== selection.length) {
      throw new BrewError('Select five different core slots and optional distinct extras');
    }
    const selected = selection.map(index => slots.find(slot => slot.slot === index));
    if (selected.some(slot => !slot || !catalog.has(slot.item_id))) throw new BrewError('Selected ingredient is no longer available',409);
    if (new Set(selected.map(slot => slot.item_id)).size !== selected.length) throw new BrewError('Only one of each ingredient can be used');
    const core = [], extras = [];
    for (const slot of selected) {
      const category = catalog.get(slot.item_id).category;
      if (category === 'extra') extras.push(slot);
      else if (config.recipe.categories.includes(category)) core.push(slot);
      else throw new BrewError('Coffee cannot be used as an ingredient');
    }
    if (core.length !== 5 || config.recipe.categories.some(category => core.filter(slot => catalog.get(slot.item_id).category === category).length !== 1)) {
      throw new BrewError('Use Beans, Filter, Grinder, Mug, and exactly one Liquid');
    }
    return { core, extras, selected };
  }

  async function inventory(identity) {
    return transaction(async client => {
      const config = await loadConfig(client);
      const row = await player(client,identity,config.settings);
      const slots = await loadSlots(client,identity.id);
      validateSlots(slots,config.settings.inventory);
      return snapshot(row,slots,config);
    });
  }

  async function preview(identity,selection) {
    return transaction(async client => {
      const config = await loadConfig(client);
      const row = await player(client,identity,config.settings);
      const slots = await loadSlots(client,identity.id);
      validateSlots(slots,config.settings.inventory);
      const selected = recipe(slots,selection,config.settings);
      return { probabilities: probabilities(selected.core,selected.extras,config.settings), configVersion: config.version, inventoryVersion: Number(row.inventory_version) };
    });
  }

  async function craft(identity,selection,requestId,expected = {}) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(requestId)) throw new BrewError('A valid craft request ID is required');
    if (!Array.isArray(selection)) throw new BrewError('Select ingredients');
    const hash = createHash('sha256').update(JSON.stringify([...selection].sort((a,b) => a-b))).digest('hex');
    return transaction(async client => {
      const config = await loadConfig(client);
      const row = await player(client,identity,config.settings);
      const previous = await client.query('SELECT request_hash,result FROM brew_crafts WHERE user_id=$1 AND request_id=$2',[identity.id,requestId]);
      if (previous.rowCount) {
        if (previous.rows[0].request_hash !== hash) throw new BrewError('Request ID was already used for another recipe',409);
        return { result: previous.rows[0].result, replayed: true, inventory: snapshot(row,await loadSlots(client,identity.id),config) };
      }
      if ((expected.configVersion !== undefined && expected.configVersion !== config.version) ||
          (expected.inventoryVersion !== undefined && expected.inventoryVersion !== Number(row.inventory_version))) throw new BrewError('Inventory or probabilities changed; preview the recipe again',409);
      const slots = await loadSlots(client,identity.id);
      validateSlots(slots,config.settings.inventory);
      const selected = recipe(slots,selection,config.settings);
      const odds = probabilities(selected.core,selected.extras,config.settings);
      const rarity = sample(odds,random);
      const consumed = new Set(selection);
      const remaining = slots.map(slot => ({ ...slot, quantity: slot.quantity-(consumed.has(slot.slot)?1:0) })).filter(slot => slot.quantity > 0);
      const next = addItem(remaining,'coffee',rarity,1,config.settings.inventory);
      const result = { itemId: 'coffee', rarity, rarityName: config.settings.rarities[rarity].name, probabilities: odds };
      await saveSlots(client,identity.id,next);
      await client.query('INSERT INTO brew_crafts (user_id,request_id,request_hash,config_version,recipe,probabilities,result) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)',[identity.id,requestId,hash,config.version,JSON.stringify(selected.selected),JSON.stringify(odds),JSON.stringify(result)]);
      await event(client,identity.id,'craft',{ requestId, recipe: selected.selected, ...result });
      row.inventory_version = String(Number(row.inventory_version)+1);
      return { result, replayed: false, inventory: snapshot(row,next,config) };
    });
  }

  async function move(identity,from,to,inventoryVersion) {
    return transaction(async client => {
      const config = await loadConfig(client);
      const row = await player(client,identity,config.settings);
      const capacity = config.settings.inventory.rows*config.settings.inventory.columns;
      if (![from,to,inventoryVersion].every(Number.isSafeInteger) || from<0 || to<0 || from>=capacity || to>=capacity) throw new BrewError('Invalid inventory slots');
      if (inventoryVersion !== Number(row.inventory_version)) throw new BrewError('Inventory changed; try moving the item again',409);
      const slots = await loadSlots(client,identity.id);
      validateSlots(slots,config.settings.inventory);
      const source = slots.find(slot => slot.slot===from);
      if (!source) throw new BrewError('Source slot is empty',409);
      if (from===to) return snapshot(row,slots,config);
      const target = slots.find(slot => slot.slot===to);
      source.slot = to;
      if (target) target.slot = from;
      await saveSlots(client,identity.id,slots);
      await event(client,identity.id,'move',{ from,to });
      row.inventory_version = String(Number(row.inventory_version)+1);
      return snapshot(row,slots,config);
    });
  }

  async function trackChat(userId) {
    if (!/^\d+$/.test(userId || '')) return;
    await pool.query('INSERT INTO brew_chat_activity (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET last_chat_at=NOW()',[userId]);
  }

  async function due() {
    const config = await loadConfig(pool);
    if (!config.settings.drops.enabled) return false;
    const seconds = config.settings.drops.intervalSeconds;
    await pool.query("INSERT INTO brew_drop_clock (interval_seconds,next_drop_at) VALUES ($1,NOW()+$1::integer*INTERVAL '1 second') ON CONFLICT DO NOTHING",[seconds]);
    return (await pool.query('SELECT next_drop_at<=NOW() AS due FROM brew_drop_clock WHERE id=TRUE')).rows[0].due;
  }

  async function drop(viewers,botId) {
    return transaction(async client => {
      const acquired = (await client.query('SELECT pg_try_advisory_xact_lock(670036) AS acquired')).rows[0].acquired;
      if (!acquired) return { skipped: 'busy' };
      const config = await loadConfig(client);
      const d = config.settings.drops;
      if (!d.enabled) return { skipped: 'disabled' };
      const clock = await client.query('SELECT next_drop_at<=NOW() AS due FROM brew_drop_clock WHERE id=TRUE FOR UPDATE');
      if (!clock.rowCount || !clock.rows[0].due) return { skipped: 'not_due' };
      await client.query("UPDATE brew_drop_clock SET interval_seconds=$1,next_drop_at=NOW()+$1::integer*INTERVAL '1 second' WHERE id=TRUE",[d.intervalSeconds]);
      const itemIds = Object.keys(d.itemWeights);
      const itemId = itemIds[sample(itemIds.map(id => d.itemWeights[id]),random)];
      const rarity = sample(d.rarityWeights,random);
      const unique = new Map();
      for (const viewer of viewers) {
        if (!/^\d+$/.test(viewer.id || '') || !/^[a-z0-9_]{1,25}$/i.test(viewer.login || '') || viewer.id === botId || d.excludedLogins.includes(viewer.login?.toLowerCase())) continue;
        unique.set(viewer.id,{ ...viewer, login: viewer.login.toLowerCase() });
      }
      const activity = await client.query("SELECT a.user_id,a.last_chat_at>=NOW()-$1::integer*INTERVAL '1 second' AS active FROM brew_chat_activity a WHERE a.user_id=ANY($2::text[])",[d.activeWindowSeconds,[...unique.keys()]]);
      const active = new Set(activity.rows.filter(row => row.active).map(row => row.user_id));
      const marked = await client.query('SELECT user_id FROM brew_players WHERE is_bot=TRUE AND user_id=ANY($1::text[])',[[...unique.keys()]]);
      for (const row of marked.rows) unique.delete(row.user_id);
      const candidates = [...unique.values()];
      while (candidates.length) {
        const index = sample(candidates.map(viewer => active.has(viewer.id)?d.activeWeight:1),random);
        const [identity] = candidates.splice(index,1);
        const row = await player(client,identity,config.settings);
        if (row.is_bot) continue;
        const slots = await loadSlots(client,identity.id);
        let next;
        try { next = addItem(slots,itemId,rarity,1,config.settings.inventory); }
        catch (err) {
          if (!(err instanceof BrewError) || err.status !== 409) throw err;
          await event(client,identity.id,'drop_rerolled',{ itemId,rarity,reason:'inventory_full' });
          continue;
        }
        await saveSlots(client,identity.id,next);
        await event(client,identity.id,'drop',{ itemId,rarity,configVersion: config.version });
        return { userId: identity.id,itemId,rarity };
      }
      await event(client,null,'drop_unawarded',{ itemId,rarity,reason:'no_eligible_capacity' });
      return { skipped: 'no_eligible_capacity' };
    });
  }

  return { inventory, preview, craft, move, trackChat, due, drop };
}

module.exports = { createBrewService };
