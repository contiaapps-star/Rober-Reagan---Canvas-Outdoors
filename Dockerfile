# syntax=docker/dockerfile:1.7
# ---------- base ----------
FROM node:20-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=development \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# ---------- build toolchain (native modules: better-sqlite3) ----------
FROM base AS toolchain
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# ---------- deps (all deps incl. dev) ----------
FROM toolchain AS deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- prod-deps (only production deps) ----------
FROM toolchain AS prod-deps
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

# ---------- builder (compile TS + Tailwind) ----------
FROM deps AS builder
COPY tsconfig.json tailwind.config.ts postcss.config.js drizzle.config.ts ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build

# ---------- dev (hot-reload target used by docker-compose.yml) ----------
FROM deps AS dev
ENV NODE_ENV=development
COPY tsconfig.json tailwind.config.ts postcss.config.js drizzle.config.ts vitest.config.ts ./
COPY src ./src
COPY public ./public
COPY tests ./tests
COPY scripts ./scripts
RUN mkdir -p /data \
 && chown -R node:node /data /app
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["tini","--"]
CMD ["npm","run","dev"]

# ---------- runner (production image used by docker-compose.prod.yml) ----------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# Cron-trigger services run scripts/trigger-cron.sh against this same image.
COPY scripts ./scripts
COPY package.json ./
RUN mkdir -p /data \
 && chown -R node:node /data /app
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["tini","--"]
CMD ["node","dist/index.js"]
