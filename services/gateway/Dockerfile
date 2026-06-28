FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY shared/package.json ./shared/
COPY services/gateway/package.json ./services/gateway/
RUN npm install --workspaces
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY services/gateway/ ./services/gateway/
RUN npm run build -w @sentinelai/shared
RUN npm run build -w @sentinelai/gateway

# Build the React SPA in its own stage
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
COPY packages/cli/data/models.json ./src/data/oi-models.json
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/gateway/dist ./dist
COPY --from=builder /app/services/gateway/migrate.js ./migrate.js
COPY --from=builder /app/services/gateway/migrations ./migrations
COPY --from=builder /app/shared ./shared
# Bring in the built SPA; app.ts serves ./web when index.html is present.
COPY --from=web /web/dist ./web
ENV NODE_ENV=production
# Apply pending SQL migrations before accepting traffic (idempotent).
CMD ["sh", "-c", "node migrate.js && exec node dist/index.js"]
