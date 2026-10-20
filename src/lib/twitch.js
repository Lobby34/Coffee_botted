'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');


class TwitchClient extends EventEmitter {
  constructor() {
    super();
    this.appToken = null;
    this.broadcaster = null;
    this.botUser = null;
    this.ws = null;
    this.tokenCheck = null;
  }

  async connect() {
    try {
      // Validate and refresh the access token if needed
      await this.validateAndRefreshToken();
      if (!this.tokenTimer) {
        this.tokenTimer = setInterval(() => {
          this.validateAndRefreshToken().catch(err => {
            logger.error('OAuth maintenance failed', { err: err.message });
            if (this.ws) this.ws.close();
            this.reconnect();
          });
        }, 15 * 60 * 1000);
        this.tokenTimer.unref();
      }

      // Get App Access Token
      this.appToken = await this.getAppToken();

      // Resolve usernames to Twitch User
      const users = await this.getUsers([config.twitch.channelName, config.twitch.botUsername]);
      this.broadcaster = users.find(u => u.login === config.twitch.channelName.toLowerCase());
      this.botUser = users.find(u => u.login === config.twitch.botUsername.toLowerCase());

      if (!this.broadcaster || !this.botUser) {
        throw new Error('Could not resolve channel or bot user IDs');
      }

      this.openSocket();
      if (!this.subscriptionTimer) {
        this.subscriptionTimer = setInterval(() => {
          this.checkSubscription().catch(err => {
            logger.error('Chat subscription check failed', { err: err.message });
          });
        }, 60 * 1000);
        this.subscriptionTimer.unref();
      }

    } catch (err) {
      logger.error('Failed to connect EventSub client', { err: err.message });
      this.reconnect();
    }
  }

  disposeSocket(socket) {
    if (!socket) return;
    clearTimeout(socket.watchdog);
    socket.removeAllListeners();
    // terminate() can emit an error while a connection is still opening.
    socket.on('error', () => {});
    socket.terminate();
  }

  openSocket(url = 'wss://eventsub.wss.twitch.tv/ws', previous = null) {
    if (!previous) this.disposeSocket(this.ws);
    const socket = new WebSocket(url);
    this.ws = socket;
    const armWatchdog = () => {
      clearTimeout(socket.watchdog);
      socket.watchdog = setTimeout(() => {
        if (this.ws !== socket) return;
        logger.warn('EventSub welcome or keepalive timed out; reconnecting');
        this.reconnect();
      }, socket.keepaliveMs || 15000);
    };
    armWatchdog();
    socket.on('message', async data => {
      if (this.ws !== socket && this.ws?.previous !== socket) return;
      try {
        const message = JSON.parse(data);
        const type = message.metadata.message_type;
        if (type === 'session_welcome') {
          socket.sessionId = message.payload.session.id;
          socket.keepaliveMs = (message.payload.session.keepalive_timeout_seconds || 10) * 1000 + 2000;
          armWatchdog();
          if (!previous) await this.subscribeToChat(socket.sessionId);
          if (this.ws !== socket) return;
          socket.subscribed = true;
          this.disposeSocket(previous);
          this.emit('connected', 'eventsub', 443);
          logger.info('Successfully connected and subscribed to chat!');
        } else if (type === 'session_keepalive' || type === 'notification') {
          if (this.ws === socket) armWatchdog();
          if (type === 'notification' && message.metadata.subscription_type === 'channel.chat.message') {
            this.handleIncomingMessage(message.payload.event);
          }
        } else if (type === 'session_reconnect' && this.ws === socket) {
          logger.warn('Twitch requested a session reconnect; migrating connection');
          clearTimeout(socket.watchdog);
          this.openSocket(message.payload.session.reconnect_url, socket);
        } else if (type === 'revocation') {
          logger.error('Twitch revoked a subscription', {
            type: message.payload.subscription.type,
            status: message.payload.subscription.status,
          });
          this.reconnect();
        }
      } catch (err) {
        logger.error('EventSub message handling failed', { err: err.message });
        if (this.ws === socket) this.reconnect();
      }
    });
    socket.on('close', (code, reason) => {
      clearTimeout(socket.watchdog);
      if (this.ws !== socket) return;
      this.disposeSocket(previous);
      logger.warn('Disconnected from Twitch EventSub; reconnecting', { code, reason: String(reason) });
      this.reconnect();
    });
    socket.on('error', err => {
      logger.error('WebSocket error', { err: err.message });
      if (this.ws === socket) this.reconnect();
    });
    // Also dispose the old connection if migration fails before welcome.
    socket.previous = previous;
  }

  reconnect() {
    if (this.reconnectTimer) return;
    if (this.ws) this.disposeSocket(this.ws.previous);
    this.disposeSocket(this.ws);
    this.ws = null;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  async checkSubscription() {
    const socket = this.ws;
    if (!socket?.subscribed || this.subscriptionCheck) return;
    this.subscriptionCheck = true;
    try {
      let cursor;
      do {
        const query = cursor ? `?after=${encodeURIComponent(cursor)}` : '';
        const res = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions${query}`, {
          headers: { 'Client-Id': config.twitch.clientId, 'Authorization': `Bearer ${config.twitch.accessToken}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Subscription check failed (HTTP ${res.status})`);
        const data = await res.json();
        if (data.data.some(subscription => subscription.type === 'channel.chat.message' &&
            subscription.status === 'enabled' && subscription.transport.session_id === socket.sessionId &&
            subscription.condition.broadcaster_user_id === this.broadcaster.id &&
            subscription.condition.user_id === this.botUser.id)) return;
        cursor = data.pagination?.cursor;
      } while (cursor);
      if (this.ws === socket) {
        logger.warn('Chat subscription is missing; reconnecting and resubscribing');
        this.reconnect();
      }
    } finally {
      this.subscriptionCheck = false;
    }
  }

  async getAppToken() {
    const params = new URLSearchParams({
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
      grant_type: 'client_credentials'
    });
    const res = await fetch(`https://id.twitch.tv/oauth2/token`, { method: 'POST', body: params, signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      throw new Error(`App token request failed (HTTP ${res.status})`);
    }

    return data.access_token;
  }

  async validateAndRefreshToken() {
    if (!this.tokenCheck) {
      this.tokenCheck = this.checkToken().finally(() => { this.tokenCheck = null; });
    }
    return this.tokenCheck;
  }

  async checkToken() {
    // 1. Check if the current token is still valid
    const res = await fetch('https://id.twitch.tv/oauth2/validate', {
      signal: AbortSignal.timeout(10000),
      headers: { 'Authorization': `OAuth ${config.twitch.accessToken}` }
    });

    if (res.status === 401) {
      logger.warn('Token expired or invalid. Attempting to refresh...');
      await this.performTokenRefresh();
    } else if (!res.ok) {
      throw new Error(`Token validation failed (HTTP ${res.status})`);
    } else {
      const data = await res.json();
      logger.info(`Token is valid. Expires in ${Math.floor(data.expires_in / 60)} minutes.`);

      // If it expires in less than 30 minutes, refresh it anyway just to be safe
      if (data.expires_in < 1800) {
        await this.performTokenRefresh();
      }
    }
  }

  async performTokenRefresh() {
    const params = new URLSearchParams({
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: config.twitch.refreshToken
    });

    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      body: params
    });

    if (!res.ok) {
      throw new Error(`Failed to refresh token (HTTP ${res.status}); Twitch authorization may need to be renewed`);
    }

    const data = await res.json();

    if (!data.access_token || !data.refresh_token) {
      throw new Error('Token refresh response is missing credentials');
    }
    // Persist the rotated pair atomically on the mounted volume.
    const tokenPath = config.twitch.tokenFile;
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${tokenPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }), { mode: 0o600 });
    fs.renameSync(temporaryPath, tokenPath);
    config.twitch.accessToken = data.access_token;
    config.twitch.refreshToken = data.refresh_token;
    logger.info('Successfully refreshed and persisted Twitch tokens');
  }

  async getUsers(logins) {
    const query = logins.map(login => `login=${login}`).join('&');
    const res = await fetch(`https://api.twitch.tv/helix/users?${query}`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'Client-Id': config.twitch.clientId,
        'Authorization': `Bearer ${this.appToken}`
      }
    });
    const data = await res.json();

    return data.data || [];
  }

  async subscribeToChat(sessionId) {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Client-Id': config.twitch.clientId,
        'Authorization': `Bearer ${config.twitch.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'channel.chat.message',
        version: '1',
        condition: {
          broadcaster_user_id: this.broadcaster.id,
          user_id: this.botUser.id
        },
        transport: { method: 'websocket', session_id: sessionId }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("\n TWITCH SUBSCRIPTION REJECTED:", errText, "\n");
      throw new Error("Subscription failed");
    }
  }

  handleIncomingMessage(event) {
    const userstate = {
      username: event.chatter_user_login,
      'display-name': event.chatter_user_name,
      mod: event.badges?.some(b => b.set_id === 'moderator') || false,
      badges: event.badges?.reduce((acc, b) => { acc[b.set_id] = b.id; return acc; }, {}) || {}
    };

    const message = event.message.text;
    const self = event.chatter_user_id === this.botUser.id;
    this.emit('message', config.twitch.channelName, userstate, message, self);
  }

  async say(channel, text) {
    const started = performance.now();
    const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Client-Id': config.twitch.clientId,
        'Authorization': `Bearer ${this.appToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        broadcaster_id: this.broadcaster.id,
        sender_id: this.botUser.id,
        message: text
      })
    });

    const data = await res.json();
    const durationMs = Math.round(performance.now() - started);
    if (!res.ok) {
      throw new Error(`Failed to send message via Helix (HTTP ${res.status}): ${data.message || 'Unknown error'}`);
    }
    const result = data.data?.[0];
    if (!result?.is_sent) {
      throw new Error(`Twitch dropped chat message: ${result?.drop_reason?.message || 'Unknown reason'}`);
    }
    logger.info('Chat reply sent', { durationMs });
  }

  // Timeout module
  async timeout(channel, username, duration, reason) {
    const users = await this.getUsers([username]);
    if (!users.length) throw new Error(`User ${username} not found`);
    const targetId = users[0].id;
    const res = await fetch(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${this.broadcaster.id}&moderator_id=${this.botUser.id}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Client-Id': config.twitch.clientId,
        'Authorization': `Bearer ${config.twitch.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          user_id: targetId,
          duration: duration,
          reason: reason
        }
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Helix timeout failed');
    }
  }
}

function createClient() {
  return new TwitchClient();
}

module.exports = { createClient };