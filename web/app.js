'use strict';

const express = require('express');
const helmet = require('helmet');
const path = require('node:path');
const { nonce } = require('../src/lib/brew/auth');
const { validateConfig,loadConfig } = require('../src/lib/brew/config');
const { BrewError } = require('../src/lib/brew/inventory');

function createApp({ pool,service,auth,publicUrl }) {
  const app = express();
  const origin = new URL(publicUrl).origin;
  const cookieOptions = { httpOnly:true,secure:true,sameSite:'lax',path:'/' };
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  app.use(helmet());
  app.use(express.json({ limit:'16kb' }));
  app.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  const cookie = (req,name) => {
    const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(name+'='));
    if (!value) return undefined;
    try { return decodeURIComponent(value.slice(name.length+1)); } catch { return undefined; }
  };
  app.get('/healthz',async (req,res) => { await pool.query('SELECT 1'); res.json({ ok:true }); });
  app.get('/auth/twitch/start',async (req,res) => {
    const browser = nonce();
    const url = await auth.begin(browser);
    res.cookie('__Host-brew_oauth',browser,{ ...cookieOptions,maxAge:600000 });
    res.redirect(url);
  });
  app.get('/auth/twitch/callback',async (req,res) => {
    const result = await auth.finish(req.query.state,cookie(req,'__Host-brew_oauth'),req.query.code);
    res.clearCookie('__Host-brew_oauth',cookieOptions);
    if (result.session) res.cookie('__Host-brew_session',result.session,{ ...cookieOptions,maxAge:604800000 });
    res.redirect(result.botConnected?'/?bot=connected':'/');
  });
  app.use('/api',async (req,res,next) => {
    req.session = await auth.session(cookie(req,'__Host-brew_session'));
    if (!req.session) throw new BrewError('Sign in with Twitch first',401);
    if (!['GET','HEAD'].includes(req.method)) {
      if (req.headers.origin !== origin || req.get('X-CSRF-Token') !== req.session.csrf) throw new BrewError('Invalid request origin or CSRF token',403);
    }
    next();
  });
  app.get('/api/session',(req,res) => res.json({ user:req.session.identity,csrf:req.session.csrf,isAdmin:req.session.isAdmin,bot:auth.botStatus() }));
  app.get('/api/inventory',async (req,res) => res.json(await service.inventory(req.session.identity)));
  app.post('/api/inventory/move',async (req,res) => res.json(await service.move(req.session.identity,req.body.from,req.body.to,req.body.inventoryVersion)));
  app.post('/api/preview',async (req,res) => res.json(await service.preview(req.session.identity,req.body.slots)));
  app.post('/api/craft',async (req,res) => {
    if (!Number.isSafeInteger(req.body.configVersion) || !Number.isSafeInteger(req.body.inventoryVersion)) throw new BrewError('Preview this recipe before crafting');
    res.json(await service.craft(req.session.identity,req.body.slots,req.body.requestId,{ configVersion:req.body.configVersion,inventoryVersion:req.body.inventoryVersion }));
  });
  app.post('/api/logout',async (req,res) => {
    await auth.logout(cookie(req,'__Host-brew_session'));
    res.clearCookie('__Host-brew_session',cookieOptions);
    res.json({ ok:true });
  });
  app.use('/api/admin',(req,res,next) => {
    if (!req.session.isAdmin) throw new BrewError('Administrator access required',403);
    next();
  });
  app.post('/api/admin/authorize-bot',async (req,res) => {
    const browser = nonce();
    const url = await auth.begin(browser,'bot',req.session.identity.id);
    res.cookie('__Host-brew_oauth',browser,{ ...cookieOptions,maxAge:600000 });
    res.json({ url });
  });
  app.get('/api/admin/config',async (req,res) => res.json(await loadConfig(pool)));
  app.post('/api/admin/config',async (req,res) => {
    const settings = validateConfig(req.body.settings);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT version FROM brew_config WHERE id=TRUE FOR UPDATE');
      const current = await client.query('SELECT max(slot) AS slot,max(quantity) AS quantity FROM brew_inventory');
      if ((current.rows[0].slot !== null && current.rows[0].slot >= settings.inventory.rows*settings.inventory.columns) ||
          (current.rows[0].quantity !== null && current.rows[0].quantity > settings.inventory.stackSize)) throw new BrewError('Existing inventories do not fit those limits',409);
      const updated = await client.query('UPDATE brew_config SET settings=$1::jsonb,version=version+1,updated_at=NOW() WHERE id=TRUE AND version=$2 RETURNING version',[JSON.stringify(settings),req.body.version]);
      if (!updated.rowCount) throw new BrewError('Configuration changed; reload it first',409);
      await client.query('COMMIT');
      res.json({ version:updated.rows[0].version });
    } catch(err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  });
  app.post('/api/admin/bots',async (req,res) => {
    if (!/^\d+$/.test(req.body.userId || '') || typeof req.body.isBot !== 'boolean') throw new BrewError('Invalid bot flag');
    const result = await pool.query('UPDATE brew_players SET is_bot=$2 WHERE user_id=$1 RETURNING user_id',[req.body.userId,req.body.isBot]);
    if (!result.rowCount) throw new BrewError('Player not found; exclude unknown bot logins in drop settings',404);
    res.json({ ok:true });
  });
  app.use(express.static(path.join(__dirname,'public'),{ index:'index.html',dotfiles:'deny' }));
  app.use((req,res) => res.status(404).json({ error:'Not found' }));
  app.use((err,req,res,next) => {
    if (res.headersSent) return next(err);
    console.error('Brew request failed:',err.message);
    res.status(err.status || 500).json({ error:err instanceof BrewError?err.message:'Brew is temporarily unavailable' });
  });
  return app;
}

module.exports = { createApp };
