# Backend (NestJS) — built from the monorepo root as context.
#   docker build -f apps/backend/Dockerfile .

# ---- build stage: install workspace, build the pruned app ----
FROM node:22-alpine AS build
RUN corepack enable
# Toolchain for any dependency that compiles native bindings via node-gyp.
RUN apk add --no-cache python3 make g++ git
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm nx build backend

# ---- runtime stage: only the pruned app + prod deps ----
FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# NX emits main.js + a pruned package.json/pnpm-lock.yaml here.
COPY --from=build /repo/dist/apps/backend ./
# Install the externalized prod deps. The pruned manifest omits packages that are
# only required dynamically (sequelize's pg driver) or transitively (tslib, the
# TS import helper) — add them explicitly so the bundle resolves at runtime.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts \
 && pnpm add --prod pg@8.21.0 pg-hstore@2.3.4 tslib@2.8.1
EXPOSE 8080
CMD ["node", "main.js"]
