/**
 * app/api/doctor/appointments/[id]/route.ts
 *
 * GET — returns the full detail of a single appointment (authenticated, owner-scoped).
 *
 * The backend endpoint returns the patient's phone number UNMASKED, unlike the
 * list endpoint which masks PII. This detail is only shown when the doctor
 * explicitly opens the appointment detail modal.
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     id, patientId, patientName, patientPhone, patientEmail, patientCedula,
 *     scheduledAt, durationMinutes, status, appointmentCode, consultationId,
 *     consultationCode, officeId, officeName, modality, meetLink,
 *     planName, planPrice, reason, notes, paymentStatus
 *   }
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export interface AppointmentDetailData {
  id: string;
  patientId: string | null;
  patientName: string | null;
  patientPhone: string | null;
  patientEmail: string | null;
  patientCedula: string | null;
  scheduledAt: string;
  durationMinutes: number | null;
  status: string;
  appointmentCode: string | null;
  consultationId: string | null;
  consultationCode: string | null;
  officeId: string | null;
  officeName: string | null;
  modality: string | null;
  meetLink: string | null;
  planName: string | null;
  planPrice: number | null;
  reason: string | null;
  notes: string | null;
  paymentStatus: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Next 16: route handler params are async and must be awaited. Destructuring
  // them synchronously leaves `id` undefined and trips the guard below with a 400.
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: 'Falta el id de la cita', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendGet<AppointmentDetailData>(`/api/appointments/${id}`);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
