/**
 * POST /api/book
 *
 * Thin proxy to the NestJS backend booking endpoint (POST /api/booking).
 *
 * Mapping from the legacy BookingClient payload to the backend CreateBookingDto:
 *   doctorId            → doctor_id
 *   patientName         → patient_name
 *   patientEmail        → patient_email
 *   patientCedula       → patient_cedula
 *   patientPhone        → patient_phone
 *   scheduledAt         → scheduled_at
 *   appointmentMode     → appointment_mode
 *   planName            → plan_name
 *   planPrice           → plan_price
 *   chiefComplaint      → chief_complaint
 *   paymentMethod       → payment_method
 *   paymentReference    → payment_reference
 *   receiptUrl          → omitted (storage upload handled separately)
 *   packageId           → package_id
 *   accessToken         → omitted (Etapa 1: auth not required by backend)
 *   patientClinical     → omitted (not in backend DTO — Etapa 2)
 *   bcvRate             → bcv_rate (fetched server-side)
 *
 * Notes:
 *   - The backend requires cf_turnstile_token but uses a stub in Etapa 1.
 *     We send a fixed placeholder token that the backend's Turnstile stub accepts.
 *   - receipt_url is not part of CreateBookingDto. File storage is handled via
 *     /api/storage/upload (already Supabase-free) and the URL is currently not
 *     forwarded to the backend appointment record. This is a known gap for Etapa 2.
 *   - patientClinical (extended registration data) is not in CreateBookingDto.
 *     Etapa 2 TODO: add an optional clinical_data field to the schema and backend.
 *   - The backend deduplication and package handling replace the old complex
 *     Supabase logic in this file.
 */

import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/report-error'

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001'

// Turnstile stub token accepted by the backend in Etapa 1.
const ETAPA1_TURNSTILE_TOKEN = 'etapa1-dev-stub-token'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      doctorId,
      patientName,
      patientEmail,
      patientCedula,
      patientPhone,
      scheduledAt,
      chiefComplaint,
      planName,
      planPrice,
      paymentMethod,
      paymentReference,
      appointmentMode,
      packageId,
    } = body

    // Basic required field validation
    if (!doctorId || !scheduledAt) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Guest mode: require patientName and patientEmail
    if (!patientName || !patientEmail) {
      return NextResponse.json(
        { error: 'Se requiere nombre y email del paciente para agendar la cita' },
        { status: 400 },
      )
    }

    // Fetch BCV rate for Bs calculation (best-effort, non-blocking)
    let bcvRate: number | null = null
    try {
      const bcvRes = await fetch(new URL('/api/admin/bcv-rate', req.url).toString())
      if (bcvRes.ok) {
        const bcvData = await bcvRes.json() as { rate?: number }
        if (bcvData.rate && bcvData.rate > 0) bcvRate = bcvData.rate
      }
    } catch {
      /* best-effort — booking proceeds without BCV rate */
    }

    // Build the CreateBookingDto payload for the backend
    const bookingPayload: Record<string, unknown> = {
      cf_turnstile_token: ETAPA1_TURNSTILE_TOKEN,
      doctor_id: doctorId,
      patient_name: patientName,
      patient_email: patientEmail,
      patient_cedula: patientCedula ?? null,
      patient_phone: patientPhone ?? null,
      scheduled_at: scheduledAt,
      appointment_mode: appointmentMode || 'presencial',
      plan_name: planName || 'Consulta General',
      plan_price: typeof planPrice === 'number' ? planPrice : 20,
      chief_complaint: chiefComplaint || null,
      payment_method: paymentMethod || null,
      payment_reference: paymentReference || null,
      bcv_rate: bcvRate,
      package_id: packageId || null,
    }

    // Forward to the backend booking endpoint (no auth headers — it's public)
    const backendRes = await fetch(`${BACKEND_URL}/api/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingPayload),
    })

    let backendJson: unknown
    try {
      backendJson = await backendRes.json()
    } catch {
      return NextResponse.json(
        { error: 'Respuesta inválida del servidor de citas' },
        { status: 502 },
      )
    }

    if (!backendRes.ok) {
      const errBody = backendJson as { success?: false; code?: string; message?: string; error?: string } | null

      // Map backend 409 (slot taken) to the client-expected shape
      if (backendRes.status === 409) {
        return NextResponse.json(
          {
            error: errBody?.message || 'Este horario ya no está disponible, por favor elige otro.',
            code: 'slot_taken',
          },
          { status: 409 },
        )
      }

      return NextResponse.json(
        { error: errBody?.message || `Error al agendar cita (${backendRes.status})` },
        { status: backendRes.status },
      )
    }

    // Success — normalize backend envelope to the legacy client shape
    const successBody = backendJson as {
      success: true
      data: {
        appointmentCode?: string
        appointmentId?: string
        scheduledAt?: string
      }
    }
    const data = successBody.data ?? {}

    return NextResponse.json({
      success: true,
      appointmentId: data.appointmentId ?? null,
      appointmentCode: data.appointmentCode ?? null,
      packageUsed: !!packageId,
      packageRemaining: null, // Etapa 2: read from backend response when available
      meetLink: null,         // Etapa 2: backend will return meet_link when GCal is wired
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    reportError('api/book', 'POST', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
