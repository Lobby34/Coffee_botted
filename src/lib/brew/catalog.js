'use strict';

const rarities = [
  { id: 0, name: 'Common', color: '#9ca3af' },
  { id: 1, name: 'Uncommon', color: '#4ade80' },
  { id: 2, name: 'Rare', color: '#60a5fa' },
  { id: 3, name: 'Epic', color: '#c084fc' },
  { id: 4, name: 'Legendary', color: '#facc15' },
  { id: 5, name: 'Unique', color: '#fb923c' },
];

const items = [
  { id: 'beans', category: 'beans', name: 'Coffee Beans', emoji: '🫘' },
  { id: 'filter', category: 'filter', name: 'Filter', emoji: '📄' },
  { id: 'grinder', category: 'grinder', name: 'Grinder', emoji: '⚙️' },
  { id: 'mug', category: 'mug', name: 'Mug', emoji: '☕' },
  { id: 'water', category: 'liquid', name: 'Water', emoji: '💧' },
  { id: 'milk', category: 'liquid', name: 'Milk', emoji: '🥛' },
  { id: 'sugar', category: 'extra', name: 'Sugar', emoji: '🧊' },
  { id: 'syrup', category: 'extra', name: 'Syrup', emoji: '🍯' },
  { id: 'vanilla', category: 'extra', name: 'Vanilla', emoji: '🌼' },
  { id: 'coffee', category: 'coffee', name: 'Coffee', emoji: '☕' },
];

module.exports = { items, rarities };
