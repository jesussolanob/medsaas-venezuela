import 'server-only';

/**
 * lib/reviewer-token.server.ts
 *
 * Server-only helper that reads the reviewer_token httpOnly cookie for the
 * current request. Used by instrumentation.ts to forward the token to the
 * backend as x-reviewer-token.
 *
 * Memoized per request via React.cache() so multiple backend calls in the
 * same render tree read the cookie store only once.
 */

import { cache } from 'react';
import { cookies } from 'next/headers';

export const getReviewerToken = cache(async (): Promise<string | null> => {
  try {
    const store = await cookies();
    return store.get('reviewer_token')?.value ?? null;
  } catch {
    // No request context (e.g. static generation) — no reviewer token.
    return null;
  }
});
