# OAuth token storage

The bot validates its user token on startup and every 15 minutes. Expired or
near-expiry tokens are refreshed; the rotated pair is saved atomically with
mode 0600 in /app/data/twitch-tokens.json. Docker Compose preserves this file
in the twitch-tokens volume across container recreation. Saved tokens take
precedence over the initial TWITCH_ACCESS_TOKEN and TWITCH_REFRESH_TOKEN
values in .env. Keep this volume when updating the bot.

For a fresh authorization, stop the bot and replace the saved token pair with
the newly authorized pair, or remove only that token file and update both
.env values before recreating the bot. Never commit credentials or print them.
TWITCH_TOKEN_FILE can override the path for non-Docker installations.

Run isolated OAuth regression tests with:

    node --test test/oauth.test.js

The Docker health check measures process liveness. Confirm the log reports
"Successfully connected and subscribed to chat!" to verify Twitch connectivity.
