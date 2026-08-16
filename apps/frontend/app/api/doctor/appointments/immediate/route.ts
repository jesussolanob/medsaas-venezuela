/**
 * POST /api/doctor/appointments/immediate
 *
 * Thin-proxy a `POST /api/doctor/appointments/immediate` del backend, que crea
 * la cita del paciente que llegó SIN CITA y su consulta.
 *
 * Reglas que resuelve el backend, no este proxy:
 *   - La hora es la del SERVIDOR. Acá no se manda `scheduled_at` a propósito:
 *     si el cliente pudiera elegirla, "inmediata" seria un atajo para crear
 *     citas a cualquier hora salteando validaciones.
 *   - La duracion se recalcula al guardar: `min(servicio, hasta la próxima
 *     cita)`. Entre que se abre el modal y se confirma puede entrar otra cita.
 *   - `force` solo lo manda el modal cuando el especialista vio el aviso de
 *     que no queda espacio y decidió igual.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface ImmediateResult {
  appointmentId: string;
  appointmentCode: string;
  scheduledAt: string;
  effectiveDuration: number;
  meetLink: string | null;
  /** La consulta que se crea junto con la cita — el modal la abre al terminar. */
  consultationId: string | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as {
    patientId?: string;
    officeId?: string | null;
    appointmentMode?: string;
    planName?: string;
    planPrice?: number;
    durationMinutes?: number;
    chiefComplaint?: string | null;
    force?: boolean;
    /** Sesión ya pagada de un combo que se consume con esta consulta. */
    pendingConsultationId?: string | null;
  };

  if (!body.patientId || !body.durationMinutes) {
    return NextResponse.json(
      { error: 'Falta el paciente o la duración de la consulta', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // El DTO del backend es snake_case (CreateImmediateAppointmentDtoSchema).
  const payload: Record<string, unknown> = {
    patient_id: body.patientId,
    appointment_mode: body.appointmentMode || 'presencial',
    plan_name: body.planName || 'Consulta General',
    plan_price: typeof body.planPrice === 'number' ? body.planPrice : 0,
    duration_minutes: body.durationMinutes,
    ...(body.officeId ? { office_id: body.officeId } : {}),
    ...(body.chiefComplaint ? { chief_complaint: body.chiefComplaint } : {}),
    ...(body.force ? { force: true } : {}),
    ...(body.pendingConsultationId ? { pending_consultation_id: body.pendingConsultationId } : {}),
  };

  const result = await backendPost<ImmediateResult>('/api/doctor/appointments/immediate', payload);

  if (!result.ok) {
    // 409 = no queda espacio antes de la próxima cita (NoImmediateSlotError).
    // El modal lo usa para ofrecer "registrar igual".
    if (result.error.status === 409) {
      return NextResponse.json(
        {
          error: result.error.message || 'No queda espacio antes de tu próxima cita.',
          code: 'no_immediate_slot',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
