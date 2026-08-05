/**
 * POST /api/doctor/onboarding/complete
 *
 * BFF thin-proxy to the NestJS endpoint of the same path.
 * The backend validates that the authenticated doctor has ≥1 active office
 * and ≥1 active service, then sets `onboardingCompleted = true` on the profile.
 * Returns 422 with a Spanish message if the conditions are not met.
 *
 * Called by `completeOnboarding()` in onboarding/actions.ts (WP-F).
 */

import { NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST() {
  const result = await backendPost<{ success: boolean }>('/api/doctor/onboarding/complete', {});

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true });
}
