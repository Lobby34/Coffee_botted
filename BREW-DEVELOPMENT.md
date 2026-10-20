# Brew development

Development worktree: `/home/srvub24/Coffee_botted-dev`, branch `dev`.
Changes remain uncommitted. Production uses a separate checkout and database.

## Services

```bash
docker compose --env-file .env.dev -f compose.dev.yml --profile bot up -d --build
docker compose --env-file .env.dev -f compose.dev.yml --profile bot ps
```

The Node web service listens on port 8080, published at localhost:8092 and
proxied over HTTPS at https://brew.lobby34.eu. Its PostgreSQL service publishes
no host port. Development database and bot data use dedicated volumes.
The development bot runs all commands in Lobbymante34.

## Authorization

Register `https://brew.lobby34.eu/auth/twitch/callback` in the shared Twitch app.
Player sign-in creates a browser session and starter inventory. Stream controls
are restricted to configured administrator Twitch IDs.

To enable drops, an administrator clicks **Authorize coffee_botted for viewer drops**
and approves Twitch consent while signed into **coffee_botted**. This grants
`moderator:read:chatters` along with the bot's chat and moderation scopes.
The bot must remain a moderator in the development channel. The callback verifies
both the administrator initiating setup and the authorized bot account ID.

New bot credentials are stored privately in the development data volume; the web
service refreshes them and the development bot reads them. Until authorized, it
reads the production-managed token volume read-only and never refreshes that pair.
Do not commit `.env.dev` or token files.

## Inventory

Craft results appear in a dismissible modal. Recipe slots reserve their height.
Drag a stack onto another slot to move it or swap occupied slots. Touch users can
choose **Move items**, then source and destination. Moves run in a PostgreSQL
transaction with a player lock and expected inventory version. They preserve
stack quantities and are logged as `move` events.

Database integration tests use temporary schemas and remove them in `finally`.
Temporary test containers use `--rm`; development services remain running.
Nginx baseline and rollback: `/home/srvub24/Nginx/BREW-ROLLBACK.md`.
