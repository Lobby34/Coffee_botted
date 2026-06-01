# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# RUNTIME STAGE
FROM node:20-alpine AS runtime
RUN addgroup -S botgroup && adduser -S botuser -G botgroup

WORKDIR /app

# COPY DEPENDENCIES
COPY --from=deps /app/node_modules ./node_modules

# COPY SOURCE
COPY src/ ./src/
COPY package.json ./

USER botuser

# HEALTHCHECK TO ENSURE THE BOT IS RUNNING
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "node src/bot.js" || exit 1

CMD ["node", "src/bot.js"]
