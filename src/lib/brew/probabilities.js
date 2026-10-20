'use strict';

const { BrewError } = require('./inventory');

function probabilities(core, extras, config) {
  if (core.length !== 5) throw new BrewError('Select exactly five core ingredients');
  if ([...core,...extras].some(item => !Number.isInteger(item.rarity) || item.rarity < 0 || item.rarity > 4)) throw new BrewError('Invalid ingredient rarity');
  const allLegendary = core.every(item => item.rarity === 4);
  const result = Array(6).fill(0);
  for (const item of core) config.probabilities.base[item.rarity].forEach((chance,tier) => { result[tier] += chance/5; });
  if (allLegendary) {
    result.fill(0);
    result[4] = 100-config.probabilities.allLegendaryUniquePercent;
    result[5] = config.probabilities.allLegendaryUniquePercent;
  }
  const reference = result.indexOf(Math.max(...result));
  for (const extra of [...extras].sort((a,b) => a.item_id.localeCompare(b.item_id))) {
    const destination = reference + (extra.rarity >= reference ? 1 : -1);
    if (destination < 0 || destination > 5 || (destination === 5 && !allLegendary)) continue;
    const change = Math.min(result[reference],config.probabilities.extraPercentagePoints);
    result[reference] -= change;
    result[destination] += change;
  }
  return result.map(n => Math.max(0,Number(n.toFixed(8))));
}

function sample(weights, random) {
  const total = weights.reduce((a,b) => a+b,0);
  const value = random();
  if (!(value >= 0 && value < 1) || total <= 0) throw new BrewError('Invalid random selection',500);
  let cursor = value*total;
  for (let index=0; index<weights.length; index++) {
    cursor -= weights[index];
    if (cursor < 0) return index;
  }
  return weights.findLastIndex(n => n > 0);
}

module.exports = { probabilities, sample };
