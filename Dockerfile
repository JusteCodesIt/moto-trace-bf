# syntax=docker/dockerfile:1.7
#
# Dev/build environment for the AutoTrack web app (TanStack Start + Vite,
# Bun package manager, deployed to Cloudflare Workers via wrangler).
#
# Usage: see docker-compose.yml (primary entry point). To use this Dockerfile
# directly:
#   docker build --target dev -t autotrack-app:dev .
#   docker run --rm -it -p 3000:3000 -v "$(pwd)":/app -v /app/node_modules autotrack-app:dev

# ---------------------------------------------------------------------------
# base: shared Bun runtime
# ---------------------------------------------------------------------------
FROM oven/bun:1.2-slim AS base
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install dependencies from the committed lockfile (cached layer,
# only rebuilt when package.json / bun.lock change)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# dev: hot-reloading dev server. Source is bind-mounted by docker-compose so
# host edits are picked up immediately by Vite.
# ---------------------------------------------------------------------------
FROM deps AS dev
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# ---------------------------------------------------------------------------
# build: production bundle (validates `bun run build` / type-checking and
# produces the Cloudflare Worker output)
# ---------------------------------------------------------------------------
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN bun run build
