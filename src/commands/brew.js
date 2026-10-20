'use strict';

const { randomUUID } = require('node:crypto');
const { getService } = require('../lib/brew');
const { BrewError } = require('../lib/brew/inventory');

module.exports = {
  name:'brew',
  description:'Inspect inventory, preview odds, or craft from one-based inventory slots.',
  async execute({ client,channel,userstate,args,audit }) {
    if (process.env.BREW_ENABLED !== 'true') {
      await client.say(channel,'Brew is not enabled in this channel.');
      return;
    }
    const [action,...values]=args;
    const url=process.env.BREW_PUBLIC_URL || 'https://brew.lobby34.eu';
    if (!action || action === 'help') {
      await client.say(channel,'Brew: !brew inventory | !brew odds <5 core slots> [extra slots] | !brew craft <slots>. Inventory: '+url);
      return;
    }
    const identity={ id:userstate['user-id'],login:userstate.username,displayName:userstate['display-name'] };
    const service=getService();
    try {
      if (action === 'inventory') {
        const inventory=await service.inventory(identity);
        const summary=inventory.slots.slice(0,10).map(slot => (slot.slot+1)+': '+slot.quantity+' '+inventory.rarities[slot.rarity].name+' '+slot.name).join(' | ');
        audit?.set({ inventory_version:inventory.version });
        await client.say(channel,(summary || 'Inventory empty')+' | '+url);
        return;
      }
      if (!['odds','craft'].includes(action)) throw new BrewError('Use !brew inventory, !brew odds <slots>, or !brew craft <slots>');
      if (values.some(value => !/^[1-9]\d*$/.test(value))) throw new BrewError('Slots must be positive whole numbers');
      const slots=values.map(value => Number(value)-1);
      if (action === 'odds') {
        const preview=await service.preview(identity,slots);
        audit?.set(preview);
        const names=['Common','Uncommon','Rare','Epic','Legendary','Unique'];
        await client.say(channel,preview.probabilities.map((p,i) => p?names[i]+' '+p+'%':null).filter(Boolean).join(' | '));
      } else {
        const result=await service.craft(identity,slots,'twitch:'+(userstate['message-id'] || randomUUID()));
        audit?.set({ ...result.result,replayed:result.replayed,slots });
        await client.say(channel,'@'+userstate['display-name']+' brewed '+result.result.rarityName+' Coffee! '+url);
      }
    } catch (err) {
      audit?.error(err);
      if (!(err instanceof BrewError)) throw err;
      await client.say(channel,err.message);
    }
  },
};
