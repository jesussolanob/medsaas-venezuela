# deltasalud-webhooks — public Zernio webhook relay.
# Build from the monorepo root:
#   docker build -f apps/webhooks/Dockerfile .

# ---- build stage: compile the app via NX webpack ----
FROM node:22-slim AS build
RUN corepack enable
# node-gyp build tooling (required by some transitive deps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm nx build webhooks

# ---- runtime stage: only the pruned app + prod deps ----
FROM node:22-slim AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# NX webpack emits main.js + a pruned package.json/pnpm-lock.yaml.
COPY --from=build /repo/dist/apps/webhooks ./
# Install only the externalized prod deps (e.g. @sentry/node).
# --ignore-scripts prevents post-install build steps for native addons.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
    && chown -R node:node /app
EXPOSE 8080
# Run as the non-root 'node' user that ships with the official image.
USER node
CMD ["node", "main.js"]
