'use strict';

const { items, rarities } = require('./catalog');
const { BrewError } = require('./inventory');

const defaults = {
  inventory: { rows: 10, columns: 10, stackSize: 128 },
  starterItems: Object.fromEntries(items.filter(item => item.category !== 'coffee').map(item => [item.id, 5])),
  recipe: { categories: ['beans','filter','grinder','mug','liquid'], maxExtras: 3, cooldownSeconds: 0 },
  probabilities: {
    base: [[75,20,4,0.9,0.1,0],[0,75,20,4,1,0],[0,0,75,20,5,0],[0,0,0,75,25,0],[0,0,0,0,100,0]],
    allLegendaryUniquePercent: 10,
    extraPercentagePoints: 10,
    extraReference: 'most_likely',
  },
  drops: {
    enabled: true, intervalSeconds: 300, activeWindowSeconds: 1800, activeWeight: 1.25,
    itemWeights: Object.fromEntries(items.filter(item => item.category !== 'coffee').map(item => [item.id,1])),
    rarityWeights: [35,30,20,10,5],
    excludedLogins: ['coffee_botted','nightbot','streamelements','streamlabs','moobot','fossabot','wizebot'],
  },
  rarities,
};

function validateConfig(config) {
  const integer = (value,min,max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const fail = () => { throw new BrewError('Invalid Brew configuration', 503); };
  if (!config || !config.inventory || !config.recipe || !config.probabilities || !config.drops) fail();
  const i = config.inventory, p = config.probabilities, d = config.drops;
  if (!integer(i.rows,1,50) || !integer(i.columns,1,50) || !integer(i.stackSize,1,10000)) fail();
  if (JSON.stringify(config.recipe.categories) !== JSON.stringify(defaults.recipe.categories) ||
      !integer(config.recipe.maxExtras,0,3) || config.recipe.cooldownSeconds !== 0) fail();
  if (!Array.isArray(p.base) || p.base.length !== 5) fail();
  for (const row of p.base) {
    if (!Array.isArray(row) || row.length !== 6 || row.some(n => !Number.isFinite(n) || n < 0 || n > 100) ||
        Math.abs(row.reduce((a,b) => a+b,0)-100)>1e-7 || row[5] !== 0) fail();
  }
  if (p.base[2][2] !== 75 || p.base[2][0] || p.base[2][1] || Math.abs(p.base[2][3]+p.base[2][4]-25)>1e-7) fail();
  if (!Number.isFinite(p.allLegendaryUniquePercent) || p.allLegendaryUniquePercent < 0 || p.allLegendaryUniquePercent > 100 ||
      !Number.isFinite(p.extraPercentagePoints) || p.extraPercentagePoints < 0 || p.extraPercentagePoints > 100 ||
      p.extraReference !== 'most_likely') fail();
  if (typeof d.enabled !== 'boolean' || !integer(d.intervalSeconds,5,86400) || !integer(d.activeWindowSeconds,1,86400) ||
      !Number.isFinite(d.activeWeight) || d.activeWeight < 1 || d.activeWeight > 100) fail();
  if (!Array.isArray(d.rarityWeights) || d.rarityWeights.length !== 5 ||
      d.rarityWeights.some(n => !Number.isFinite(n) || n < 0) || !d.rarityWeights.some(n => n > 0)) fail();
  const ingredientIds = new Set(items.filter(item => item.category !== 'coffee').map(item => item.id));
  for (const [key,n] of Object.entries(d.itemWeights || {})) if (!ingredientIds.has(key) || !Number.isFinite(n) || n < 0) fail();
  if (!Object.values(d.itemWeights || {}).some(n => n > 0)) fail();
  if (!Array.isArray(d.excludedLogins) || d.excludedLogins.some(name => typeof name !== 'string' || !/^[a-z0-9_]+$/.test(name))) fail();
  if (!config.starterItems || typeof config.starterItems !== 'object' || Array.isArray(config.starterItems)) fail();
  let starterSlots = 0;
  for (const [key,n] of Object.entries(config.starterItems || {})) {
    if (!ingredientIds.has(key) || !integer(n,0,10000)) fail();
    starterSlots += Math.ceil(n/i.stackSize);
  }
  if (starterSlots > i.rows*i.columns) fail();
  if (!Array.isArray(config.rarities) || config.rarities.length !== 6 ||
      config.rarities.some((r,index) => r.id !== index || typeof r.name !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(r.color))) fail();
  return config;
}

async function loadConfig(client) {
  const result = await client.query('SELECT version,settings FROM brew_config WHERE id=TRUE FOR SHARE');
  if (!result.rowCount) throw new BrewError('Brew configuration is not initialized',503);
  return { version: result.rows[0].version, settings: validateConfig(result.rows[0].settings) };
}

module.exports = { defaults, validateConfig, loadConfig };
