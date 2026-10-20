# Pull requests

Run `npm ci` and `COUNTER_TEST_DB=1 npm run test:ci` against a disposable PostgreSQL 15 database. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and the placeholder Twitch variables shown in `workflows/ci.yml`. CI never needs real Twitch credentials.

New commands belong in `src/commands/`. Add a behavior case keyed by the exported command name in `.github/checks/commandCases.js`; discovery fails when a command has no case. Assert expected replies and database or moderation effects, and add regression tests for branches and failure cases. These checks reduce manual work but cannot infer the intended behavior of new code.

GitHub runs database, startup, command and regression tests, then builds the production Docker image on pull requests (including forks) and pushes to `main`. The startup test replaces Twitch transport; it cannot verify real Twitch credentials, permissions, availability or delivery latency.

Make `Bot checks` a required status check for `main` in GitHub repository settings → Rules → Rulesets after the first successful run. Without this rule, a failed workflow does not prevent merging. First-time fork contributors may need a maintainer to approve their workflow run.

Use short Odoo-style commit titles, for example `[FIX] twitch-bot: handle missing chat subscription`. Bump both package versions: patch for fixes or tooling, minor for compatible features, major for breaking changes. Run `npm version patch|minor|major --no-git-tag-version`.

`test/` contains ignored local checks. Shared CI checks live under `.github/checks/` and must be committed so GitHub can run them.

Command handlers receive an optional `audit` context. Invocation details, `client.say()` responses, errors, and `client.timeout()` results are captured automatically. Use `audit?.set({ roll, chambers_remaining })` for command-specific variables, `audit?.cooldown()` for suppressed invocations, and `audit?.error(err)` when handling an error locally. Audit writes happen after replies; shutdown drains active handlers before closing PostgreSQL.
