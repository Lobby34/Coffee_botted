FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && addgroup -S botgroup && adduser -S botuser -G botgroup
COPY src/ ./src/
COPY web/ ./web/
RUN mkdir -p /app/data && chown botuser:botgroup /app/data
USER botuser
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","node src/DB/Initialization/index.js && exec node web/server.js"]
