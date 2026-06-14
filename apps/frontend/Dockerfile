# Frontend (Next.js standalone) — built from the monorepo root as context.
#   docker build -f apps/frontend/Dockerfile .

# ---- build stage ----
FROM node:22-alpine AS build
RUN corepack enable
RUN apk add --no-cache python3 make g++ git
WORKDIR /repo
# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time, so they must
# be present here (not at Cloud Run runtime). Passed via --build-arg.
ARG NEXT_PUBLIC_AUTH_MODE=auth0
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_URL=
ARG NEXT_PUBLIC_SENTRY_ENABLED=false
ENV NEXT_PUBLIC_AUTH_MODE=$NEXT_PUBLIC_AUTH_MODE \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_URL=$NEXT_PUBLIC_URL \
    NEXT_PUBLIC_SENTRY_ENABLED=$NEXT_PUBLIC_SENTRY_ENABLED
# Skip Sentry source-map upload during the image build (no auth token present).
ENV SENTRY_SOURCEMAPS_DISABLE=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm nx build frontend

# ---- runtime stage: Next standalone bundles its own node_modules ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /repo/apps/frontend/.next/standalone ./
COPY --from=build /repo/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /repo/apps/frontend/public ./apps/frontend/public
EXPOSE 8080
CMD ["node", "apps/frontend/server.js"]
