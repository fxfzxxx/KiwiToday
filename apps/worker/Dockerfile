# Plain Dockerfile on purpose: this image runs unchanged on Fly, on Cloudflare
# Containers, on ECS, or on a VPS. Portability is the point — the platform
# decision should stay reversible.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json   packages/db/
COPY apps/worker/package.json   apps/worker/
RUN pnpm install --frozen-lockfile --filter @kiwi/worker...

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# tsx runs the TypeScript directly. One less build step to break, and the
# worker is not latency-sensitive enough for the startup cost to matter.
EXPOSE 8080
CMD ["node", "--import", "tsx", "apps/worker/src/index.ts"]
