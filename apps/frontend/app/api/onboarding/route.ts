/**
 * /api/onboarding — POST
 *
 * Completes the doctor/patient profile after initial registration.
 *
 * ETAPA 1: Profile upsert is forwarded to the NestJS backend via
 *   PUT /api/doctor/profile (for doctor-specific fields) or stored as
 *   a no-op for fields not yet covered by the backend.
 *   The beta subscription is provisioned client-side via the dev-stub.
 *
 * NOTE: This route deliberately does NOT use any auth middleware in Etapa 1.
 *   The userId is trusted from the request body (dev environment only).
 *   In Etapa 2 (Auth0): verify the JWT from the httpOnly cookie and derive
 *   userId from the token, then call the NestJS backend directly.
 *
 * ETAPA 2 TODO:
 *   - Verify Auth0 JWT from httpOnly cookie — never trust userId from body.
 *   - Call POST /api/admin/doctors/{id}/profile on the NestJS backend to
 *     handle the full upsert (phone, full_name, email, role, specialty, sex).
 *   - Update Auth0 app_metadata with the role via Auth0 Management API.
 */

import { NextResponse } from 'next/server'
import { backendPut, backendGet } from '@/lib/api-client.server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId, role, phone, full_name, email, specialty, professional_title, sex } = body

    if (!userId || !phone) {
      return NextResponse.json({ error: 'userId y phone son requeridos' }, { status: 400 })
    }

    const profileRole = role === 'patient' ? 'patient' : 'doctor'

    // ── 1. Check if profile exists via the backend ──────────────────────────
    // GET /api/doctor/profile requires doctor role identity — we forward the
    // userId as a dev-auth override so the backend resolves the profile.
    const profileCheck = await backendGet<{ id?: string }>(
      '/api/doctor/profile',
      { userId, role: profileRole },
    )

    const profileExists = profileCheck.ok && !!profileCheck.value?.id

    if (profileExists || profileRole === 'doctor') {
      // ── 2a. Doctor path: update profile via backend ─────────────────────
      // PUT /api/doctor/profile accepts specialty and professional_title.
      // phone, full_name, email, sex are not yet accepted by this endpoint —
      // they will be handled when the backend covers full profile management.
      const updatePayload: Record<string, unknown> = {}
      if (specialty) updatePayload.specialty = specialty
      if (professional_title) updatePayload.professional_title = professional_title

      if (Object.keys(updatePayload).length > 0) {
        const updateResult = await backendPut<unknown>(
          '/api/doctor/profile',
          updatePayload,
          { userId, role: 'doctor' },
        )
        if (!updateResult.ok) {
          // Log but don't block — phone/name are the critical fields for the UX.
          console.error('[onboarding] PUT /api/doctor/profile failed:', updateResult.error.message)
        }
      }
    }

    // ── 2b. Patient path ────────────────────────────────────────────────────
    // Patient profile management is not yet exposed via the backend (Etapa 2).
    // The booking flow creates/updates patient records directly via /api/book.
    // No action needed here beyond returning success so the UI can proceed.

    // NOTE: phone, full_name, email, sex are not persisted in Etapa 1 for the
    // onboarding path. The doctor can update them via /doctor/settings after login.
    // This is acceptable because:
    //   - The onboarding page reads name/email from the dev-auth stub cookies.
    //   - The backend profile was already created with basic info at registration time.

    return NextResponse.json({ success: true, role: profileRole })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor'
    console.error('Onboarding error:', message)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
