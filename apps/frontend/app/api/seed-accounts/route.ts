/**
 * /api/seed-accounts — DEPRECATED
 *
 * This endpoint previously created Supabase Auth test accounts (ivana@gmail.com
 * / ivana2@gmail.com) for local development.
 *
 * ETAPA 1: Supabase Auth is removed. The dev-stub identity is provided via
 *   cookies (dev_user_id / dev_user_role) set by the login page. Seed data
 *   should be inserted directly into the Postgres DB.
 *
 * ETAPA 2 (Auth0): if a seed endpoint is needed again, implement it using
 *   the Auth0 Management API to create test users.
 *
 * Returns 410 Gone for all methods.
 */

import { NextResponse } from 'next/server'

function gone(): NextResponse {
  return NextResponse.json(
    {
      error: 'Este endpoint fue deprecado en la migración Etapa 1 (eliminación de Supabase Auth). ' +
        'Usa el seed directo en la BD o el login dev-stub con cookies dev_user_id/dev_user_role.',
    },
    { status: 410 },
  )
}

export function GET(): NextResponse {
  return gone()
}

export function POST(): NextResponse {
  return gone()
}
