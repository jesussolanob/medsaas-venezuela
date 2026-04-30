/**
 * GET /api/cron/subscription-expiry
 *
 * Endpoint que corre 1× al día (vía Vercel Cron o cron externo).
 * - Busca doctores cuya suscripción vence en exactamente N días (donde N
 *   está en app_settings.expiration_warning_days, default [7,3,1]).
 * - Envía email de aviso por cada uno.
 *
 * Setup en vercel.json:
 *   {
 *     "crons": [
 *       { "path": "/api/cron/subscription-expiry", "schedule": "0 9 * * *" }
 *     ]
 *   }
 *
 * Protegido con CRON_SECRET (header `Authorization: Bearer <secret>`).
 * Vercel Cron lo manda automáticamente si CRON_SECRET está set en env.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppSettings } from '@/lib/subscription'
import { sendSubscriptionExpiringEmail } from '@/lib/email'

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron manda Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const settings = await getAppSettings()
  const warningDays = settings.expiration_warning_days || [7, 3, 1]

  let totalSent = 0
  const results: Array<{ days: number; sent: number; failed: number }> = []

  for (const daysAhead of warningDays) {
    // Calcular ventana del día objetivo (00:00 a 23:59:59 del día +N)
    const start = new Date()
    start.setDate(start.getDate() + daysAhead)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)

    const { data: doctors, error } = await admin
      .from('profiles')
      .select('id, email, full_name, subscription_expires_at, subscription_status')
      .eq('role', 'doctor')
      .neq('subscription_status', 'cancelled')
      .gte('subscription_expires_at', start.toISOString())
      .lte('subscription_expires_at', end.toISOString())

    if (error) {
      console.error('[cron/subscription-expiry] query error:', error)
      results.push({ days: daysAhead, sent: 0, failed: 0 })
      continue
    }

    let sent = 0
    let failed = 0
    for (const d of doctors || []) {
      if (!d.email || !d.subscription_expires_at) continue
      const r = await sendSubscriptionExpiringEmail({
        to: d.email,
        doctor_name: d.full_name || 'Doctor/a',
        days_remaining: daysAhead,
        expires_at: d.subscription_expires_at,
      })
      if (r.ok) sent++
      else failed++
    }
    totalSent += sent
    results.push({ days: daysAhead, sent, failed })
  }

  return NextResponse.json({
    success: true,
    total_emails_sent: totalSent,
    by_window: results,
    timestamp: new Date().toISOString(),
  })
}
