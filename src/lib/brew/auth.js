'use strict';

const { randomBytes,createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { BrewError } = require('./inventory');

const hash = value => createHash('sha256').update(value).digest('hex');
const nonce = () => randomBytes(32).toString('hex');

function createAuthService(pool,service,options) {
  const request = options.fetch || fetch;
  const callback = new URL('/auth/twitch/callback',options.publicUrl).href;
  let refreshing;
  async function json(url,init) {
    const response = await request(url,{ ...init,signal:AbortSignal.timeout(10000) });
    if (!response.ok) throw new BrewError('Twitch authorization failed (HTTP '+response.status+')',502);
    return response.json();
  }
  function writeCredentials(tokens) {
    fs.mkdirSync(path.dirname(options.botTokenFile),{ recursive:true,mode:0o700 });
    fs.writeFileSync(options.botTokenFile+'.tmp',JSON.stringify(tokens),{ mode:0o600 });
    fs.renameSync(options.botTokenFile+'.tmp',options.botTokenFile);
  }
  function credentialData(data) {
    if (!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new BrewError('Invalid Twitch token response',502);
    return { accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+data.expires_in*1000,scopes:data.scope || [] };
  }
  async function begin(browserNonce,intent='login',adminUserId=null) {
    const state = nonce();
    await pool.query("DELETE FROM brew_oauth_states WHERE expires_at<NOW()");
    await pool.query("INSERT INTO brew_oauth_states (state_hash,browser_hash,intent,admin_user_id,expires_at) VALUES ($1,$2,$3,$4,NOW()+INTERVAL '10 minutes')",[hash(state),hash(browserNonce),intent,adminUserId]);
    const query = new URLSearchParams({ client_id:options.clientId,redirect_uri:callback,response_type:'code',state });
    if (intent === 'bot') {
      query.set('scope','user:read:chat user:write:chat user:bot moderator:manage:banned_users moderator:read:chatters');
      query.set('force_verify','true');
    }
    return 'https://id.twitch.tv/oauth2/authorize?'+query;
  }
  async function finish(state,browserNonce,code) {
    if (typeof state !== 'string' || typeof browserNonce !== 'string' || typeof code !== 'string' || !state || !browserNonce || !code) throw new BrewError('Invalid authorization callback',400);
    const valid = await pool.query('DELETE FROM brew_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>NOW() RETURNING intent,admin_user_id',[hash(state),hash(browserNonce)]);
    if (!valid.rowCount) throw new BrewError('Authorization state expired or did not match this browser',400);
    const data = await json('https://id.twitch.tv/oauth2/token',{ method:'POST',body:new URLSearchParams({ client_id:options.clientId,client_secret:options.clientSecret,code,grant_type:'authorization_code',redirect_uri:callback }) });
    const validation = await json('https://id.twitch.tv/oauth2/validate',{ headers:{ Authorization:'OAuth '+data.access_token } });
    if (validation.client_id !== options.clientId || !validation.user_id) throw new BrewError('Twitch token belongs to another application',403);
    if (valid.rows[0].intent === 'bot') {
      if (!options.adminIds.includes(valid.rows[0].admin_user_id) || validation.user_id !== options.botUserId) throw new BrewError('Authorize the coffee_botted account for bot setup',403);
      const scopes = validation.scopes || [];
      for (const scope of ['user:read:chat','user:write:chat','moderator:manage:banned_users','moderator:read:chatters']) {
        if (!scopes.includes(scope)) throw new BrewError('Bot authorization is missing '+scope,403);
      }
      writeCredentials({ ...credentialData(data),scopes });
      return { botConnected:true };
    }
    const users = await json('https://api.twitch.tv/helix/users',{ headers:{ 'Client-Id':options.clientId,Authorization:'Bearer '+data.access_token } });
    const user = users.data?.[0];
    if (!user || user.id !== validation.user_id) throw new BrewError('Invalid Twitch user',403);
    const identity = { id:user.id,login:user.login,displayName:user.display_name };
    await service.inventory(identity);
    const session = nonce(), csrf = nonce();
    await pool.query("DELETE FROM brew_sessions WHERE expires_at<NOW()");
    await pool.query("INSERT INTO brew_sessions (session_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '7 days')",[hash(session),identity.id,csrf]);
    return { session,identity };
  }
  async function session(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const result = await pool.query('SELECT s.csrf_token,p.user_id,p.username,p.display_name FROM brew_sessions s JOIN brew_players p ON p.user_id=s.user_id WHERE s.session_hash=$1 AND s.expires_at>NOW()',[hash(token)]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return { identity:{ id:row.user_id,login:row.username,displayName:row.display_name },csrf:row.csrf_token,isAdmin:options.adminIds.includes(row.user_id) };
  }
  async function logout(token) {
    if (typeof token === 'string') await pool.query('DELETE FROM brew_sessions WHERE session_hash=$1',[hash(token)]);
  }
  async function refreshBot() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      if (!options.botTokenFile || !fs.existsSync(options.botTokenFile)) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lock = (await client.query('SELECT pg_try_advisory_xact_lock(670037) AS acquired')).rows[0].acquired;
        if (!lock) { await client.query('COMMIT'); return; }
        const current = JSON.parse(fs.readFileSync(options.botTokenFile,'utf8'));
        if (current.expiresAt < Date.now()+1800000) {
          const data = await json('https://id.twitch.tv/oauth2/token',{ method:'POST',body:new URLSearchParams({ client_id:options.clientId,client_secret:options.clientSecret,refresh_token:current.refreshToken,grant_type:'refresh_token' }) });
          writeCredentials({ ...credentialData(data),scopes:data.scope || current.scopes });
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally { client.release(); }
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  function botStatus() {
    if (!options.botTokenFile || !fs.existsSync(options.botTokenFile)) return { authorized:false,requiredScope:'moderator:read:chatters' };
    const current = JSON.parse(fs.readFileSync(options.botTokenFile,'utf8'));
    return { authorized:current.scopes?.includes('moderator:read:chatters') && current.expiresAt>Date.now() };
  }
  return { begin,finish,session,logout,refreshBot,botStatus };
}

module.exports = { createAuthService,hash,nonce };
