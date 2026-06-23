import 'server-only';

/**
 * lib/auth0.ts
 *
 * Auth0Client singleton for Etapa 2 (AUTH_MODE=auth0).
 *
 * @auth0/nextjs-auth0 v4 reads most config from the environment automatically:
 *   AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET,
 *   AUTH0_BASE_URL / APP_BASE_URL.
 * We also forward AUTH0_ISSUER_BASE_URL so the SDK can discover OIDC metadata
 * even if domain alone isn't enough.
 *
 * GUARD: This module should only be imported when AUTH_MODE === 'auth0'.
 * In dev mode the import is never reached; a startup assertion enforces that.
 */

import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Validate required env vars at module load time so the error surfaces early.
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `[auth0] Missing required environment variable: ${name}. ` +
        'Set it in apps/frontend/.env or your deployment environment.',
    );
  }
  return val;
}

// Validate all required vars up front.
const domain = requireEnv('AUTH0_DOMAIN');
const clientId = requireEnv('AUTH0_CLIENT_ID');
const clientSecret = requireEnv('AUTH0_CLIENT_SECRET');
const secret = requireEnv('AUTH0_SECRET');
// AUTH0_BASE_URL takes precedence; fall back to APP_BASE_URL for flexibility.
const appBaseUrl =
  process.env.AUTH0_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://localhost:3000';

/** Session lifetime: 8 hours absolute, after which the user must log in again. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export const auth0 = new Auth0Client({
  domain,
  clientId,
  clientSecret,
  secret,
  appBaseUrl,
  authorizationParameters: {
    scope: 'openid profile email',
  },
  // Cap the session at 8h (absolute). rolling=false → it does not extend on activity.
  session: {
    rolling: false,
    absoluteDuration: SESSION_MAX_AGE_SECONDS,
  },
});
