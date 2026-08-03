FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV WRANGLER_WRITE_LOGS=false
ENV WRANGLER_LOG_PATH=/app/.wrangler/logs
ENV MINIFLARE_REGISTRY_PATH=/app/.wrangler/registry
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
