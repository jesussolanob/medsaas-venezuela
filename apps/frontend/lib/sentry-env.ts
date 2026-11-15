/**
 * Which Sentry environment this process is running in.
 *
 * NODE_ENV is "production" in every build — staging included — and the same
 * cloudbuild.yaml builds both, so staging was reporting to Sentry tagged as
 * production. The environment is derived from the host instead: the app's
 * base URL on the server, the page's hostname in the browser.
 */
export type SentryEnvironment = 'production' | 'staging' | 'development';

function fromHost(host: string): SentryEnvironment {
  if (!host || host === 'localhost' || host === '127.0.0.1') return 'development';
  return host.startsWith('staging.') ? 'staging' : 'production';
}

export function sentryEnvironment(): SentryEnvironment {
  if (typeof window !== 'undefined') return fromHost(window.location.hostname);
  const baseUrl = process.env.APP_BASE_URL ?? process.env.AUTH0_BASE_URL ?? '';
  try {
    return fromHost(new URL(baseUrl).hostname);
  } catch {
    return 'development';
  }
}

/** Sentry only reports from production; staging keeps it off (decided with the owner). */
export function isSentryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true' && sentryEnvironment() === 'production';
}
