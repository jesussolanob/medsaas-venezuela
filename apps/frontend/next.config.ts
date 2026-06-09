import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// AUDIT FIX 2026-04-28 (TS-1): la prop `eslint` ya no existe en NextConfig de
// Next 16 — los flags de ESLint ahora se manejan vía CLI o `.eslintrc`. Se
// remueve para que el typecheck pase. Si hace falta saltar lint en build,
// usar `next build --no-lint` o configurar eslint-config-next directamente.
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },

  // Expose SENTRY_ENABLED to client-side code under the SAME name used by the
  // backend. Next.js normally requires the NEXT_PUBLIC_ prefix for browser vars;
  // this `env` mapping inlines the non-prefixed name at build time so the whole
  // stack uses a single env var: SENTRY_ENABLED.
  env: {
    SENTRY_ENABLED: process.env.SENTRY_ENABLED ?? "false",
  },

  // Required by @sentry/nextjs for App Router pageload tracing (Next 15+).
  experimental: {
    clientTraceMetadata: ["sentry-trace", "baggage"],
  },

  // 2026-05-02: la landing page es HTML estático que actualizamos seguido.
  // Sin estos headers Vercel/CDN cachea agresivamente y los users ven
  // versiones viejas durante horas.
  async headers() {
    return [
      {
        source: "/landing.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

// withSentryConfig wraps the webpack config (source maps, bundle analysis).
// With Turbopack the webpack key is ignored, so this is safe.
//
// Source maps upload: enabled when SENTRY_AUTH_TOKEN is present (local dev + CI).
// If the build ever breaks because of this (Turbopack incompatibility), set
// SENTRY_SOURCEMAPS_DISABLE=true in the environment and it falls back to disabled.
const sourcemapsDisabled = process.env.SENTRY_SOURCEMAPS_DISABLE === 'true';

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    disable: sourcemapsDisabled,
  },
});
