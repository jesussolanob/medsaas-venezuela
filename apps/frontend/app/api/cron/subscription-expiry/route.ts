/**
 * GET /api/cron/subscription-expiry
 *
 * ETAPA 1 STUB — returns 501 Not Implemented.
 * Cron jobs (subscription expiry emails) are an Etapa 2 / cloud feature.
 * The Vercel Cron will receive a 501 and stop retrying until this is wired
 * to the NestJS backend email service.
 *
 * ETAPA 2 TODO: call POST /api/admin/cron/subscription-expiry on the NestJS
 * backend once the email service is provisioned and the endpoint exists.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Etapa 1: cron not implemented — no email service available yet.
  return NextResponse.json(
    {
      success: false,
      message: 'Subscription expiry cron is not implemented in Etapa 1. Wire to NestJS email service in Etapa 2.',
    },
    { status: 501 },
  )
}
