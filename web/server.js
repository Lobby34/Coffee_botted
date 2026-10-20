'use strict';

require('dotenv').config();
const { getPool,close } = require('../src/lib/database');
const { createBrewService } = require('../src/lib/brew/service');
const { createAuthService } = require('../src/lib/brew/auth');
const { createApp } = require('./app');

for (const key of ['BREW_PUBLIC_URL','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET']) {
  if (!process.env[key]) throw new Error('Missing '+key);
}
const pool = getPool();
const auth = createAuthService(pool,createBrewService(pool),{
  publicUrl:process.env.BREW_PUBLIC_URL,
  clientId:process.env.TWITCH_CLIENT_ID,clientSecret:process.env.TWITCH_CLIENT_SECRET,
  adminIds:(process.env.BREW_ADMIN_USER_IDS || '').split(',').filter(Boolean),
  botUserId:process.env.BREW_BOT_USER_ID,
  botTokenFile:process.env.BREW_BOT_TOKEN_FILE || '/app/data/brew-bot-tokens.json',
});
const app = createApp({ pool,service:createBrewService(pool),auth,publicUrl:process.env.BREW_PUBLIC_URL });
const server = app.listen(Number(process.env.PORT || 8080),'0.0.0.0',() => console.log('Brew web listening'));
const timer = setInterval(() => auth.refreshBot().catch(err => console.error('Bot token maintenance failed:',err.message)),60000);
timer.unref();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const deadline = setTimeout(() => process.exit(1),8000);
  server.close(async () => {
    await close();
    clearTimeout(deadline);
    process.exit(0);
  });
}
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
