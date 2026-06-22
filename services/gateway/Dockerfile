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
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/gateway/dist ./dist
COPY --from=builder /app/shared ./shared
# Bring in the built SPA; app.ts serves ./web when index.html is present.
COPY --from=web /web/dist ./web
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
