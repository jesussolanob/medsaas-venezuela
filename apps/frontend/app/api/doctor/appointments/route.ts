/**
 * app/api/doctor/appointments/route.ts
 *
 * GET  — returns booked time slots for a given date.
 *        Query: ?date=YYYY-MM-DD
 *        Response: { success: true, data: { bookedAt: string[] } }
 *        Used by the NewAppointmentFlow wizard to grey out already-taken slots.
 *
 * DELETE — proxies to the backend `DELETE /api/appointments/:id`, which deletes
 *          the appointment and cascades to its linked consultation. Ownership is
 *          enforced server-side (anti-IDOR); the backend returns 403/404 for a
 *          non-owned id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendDelete, backendGet, backendPost } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackendAppointment {
  id: string;
  scheduledAt: string;
  status: string;
}

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — booked slots for a date
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Parámetro date inválido. Formato esperado: YYYY-MM-DD', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // Límites del día en hora de Caracas (UTC-4, sin DST). Con límites UTC, las
  // citas nocturnas (20:00–23:59 VE) caían fuera del rango y sus slots
  // aparecían libres aunque estuvieran ocupados.
  const dateFrom = encodeURIComponent(`${date}T00:00:00-04:00`);
  const dateTo = encodeURIComponent(`${date}T23:59:59-04:00`);
  const qs = `date_from=${dateFrom}&date_to=${dateTo}&page=1&limit=100`;

  // El backend GET /api/appointments devuelve el envelope { success, data: [...], meta };
  // backendGet ya desempaqueta `data`, así que result.value ES el array de citas.
  const result = await backendGet<BackendAppointment[]>(`/api/appointments?${qs}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  const appointments = Array.isArray(result.value) ? result.value : [];
  const bookedAt = appointments.filter((a) => a.status !== 'cancelled').map((a) => a.scheduledAt);

  return NextResponse.json({ success: true, data: { bookedAt } });
}

// ---------------------------------------------------------------------------
// DELETE — cancel / delete an appointment
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'Falta el parámetro id', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendDelete<unknown>(`/api/appointments/${id}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST — create appointment from the doctor's internal flow (authenticated)
// ---------------------------------------------------------------------------

/**
 * POST /api/doctor/appointments
 *
 * Thin BFF proxy for the authenticated doctor-initiated booking flow.
 * Transforms the camelCase payload from NewAppointmentFlow into the
 * snake_case CreateBookingDto expected by the backend, injects the
 * internal Turnstile stub token, and forwards to the authenticated
 * backend endpoint POST /api/doctor/appointments.
 *
 * The backend endpoint:
 *   - Requires AppAuthGuard (auth headers forwarded by backendPost).
 *   - Overrides doctor_id with user.sub (anti-IDOR).
 *   - Skips the booking-feature gate so Free-plan doctors can still book.
 *
 * Response shape mirrors POST /api/book so useAppointmentFlow needs no changes.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as {
    doctorId?: string;
    patientId?: string;
    patientName?: string;
    patientEmail?: string;
    patientCedula?: string;
    patientPhone?: string;
    scheduledAt?: string;
    chiefComplaint?: string;
    planName?: string;
    planPrice?: number;
    paymentMethod?: string;
    paymentReference?: string;
    appointmentMode?: string;
    packageId?: string;
    officeId?: string;
    receiptUrl?: string | null;
  };

  const {
    doctorId,
    patientId,
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
    officeId,
    receiptUrl,
  } = body;

  if (!doctorId || !scheduledAt) {
    return NextResponse.json(
      { error: 'Faltan campos requeridos', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  if (!patientId && !patientName) {
    return NextResponse.json(
      {
        error: 'Selecciona un paciente o ingresa su nombre para agendar la cita',
        code: 'BAD_REQUEST',
      },
      { status: 400 },
    );
  }

  // Build the CreateBookingDto payload.
  // cf_turnstile_token is required by the schema; the backend's Turnstile stub
  // accepts any non-empty string. Authentication replaces Turnstile here.
  const backendPayload: Record<string, unknown> = {
    cf_turnstile_token: 'internal-doctor-auth',
    doctor_id: doctorId,
    // Omit patient_id entirely when absent — the schema uses z.string().uuid().optional()
    // and does NOT accept null.
    ...(patientId ? { patient_id: patientId } : {}),
    patient_name: patientName ?? null,
    patient_email: patientEmail || null,
    patient_cedula: patientCedula ?? null,
    patient_phone: patientPhone ?? null,
    scheduled_at: scheduledAt,
    appointment_mode: appointmentMode || 'presencial',
    plan_name: planName || 'Consulta General',
    plan_price: typeof planPrice === 'number' ? planPrice : 20,
    chief_complaint: chiefComplaint || null,
    payment_method: paymentMethod || null,
    payment_reference: paymentReference || null,
    package_id: packageId || null,
    office_id: officeId || null,
    ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
  };

  const result = await backendPost<{
    appointmentId: string;
    appointmentCode: string;
    scheduledAt: string;
    meetLink: string | null;
  }>('/api/doctor/appointments', backendPayload);

  if (!result.ok) {
    // Map backend 409 (slot taken) to the client-expected shape
    if (result.error.status === 409) {
      return NextResponse.json(
        {
          error:
            result.error.message || 'Este horario ya no está disponible, por favor elige otro.',
          code: 'slot_taken',
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  // Normalize to the same shape as POST /api/book so useAppointmentFlow
  // requires no changes to its response parsing.
  return NextResponse.json({
    success: true,
    appointmentId: result.value.appointmentId ?? null,
    appointmentCode: result.value.appointmentCode ?? null,
    packageUsed: !!packageId,
    packageRemaining: null,
    meetLink: result.value.meetLink ?? null,
  });
}
