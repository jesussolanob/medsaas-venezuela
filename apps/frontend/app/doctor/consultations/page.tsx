/**
 * app/doctor/consultations/page.tsx — SERVER COMPONENT
 *
 * Punto de entrada de la ruta /doctor/consultations.
 *
 * Responsabilidad única: obtener la primera página de consultas en el servidor
 * y pasarla al componente cliente para que la primera pintura ya tenga las filas
 * (sin el spinner "Cargando…" post-hidratación).
 *
 * El componente cliente (ConsultationsClient) sigue manejando toda la interactividad:
 * filtros, paginación, ordenamiento, editor de consulta, IA, récipe, etc.
 *
 * Cuando el usuario llega con ?open=<id> el Server Component NO intenta cargar
 * las 100.000 filas — ese caso requiere conocer la URL en el cliente, así que
 * ConsultationsClient detecta openId y hace su propio fetch ampliado.
 */

import { listConsultationsPaged } from './actions';
import ConsultationsClient from './ConsultationsClient';

/**
 * Mapea el estado del appointment a estado de la consulta tal como lo hace el cliente.
 * Duplicado aquí para pre-procesar los datos antes de serializarlos como props.
 */
function mapAppointmentStatusToConsulta(
  apptStatus: string | null | undefined,
): 'pending' | 'in_progress' | 'completed' | 'no_show' {
  if (apptStatus === 'completed') return 'completed';
  if (apptStatus === 'no_show') return 'no_show';
  return 'pending';
}

export default async function ConsultationsPage() {
  // Fetch server-side — cero round-trips desde el navegador en la primera carga.
  // Usamos el límite estándar (15 filas) para mantener TTFBs bajos.
  // Nota: los errores se capturan silenciosamente; el cliente hace su propio
  // fetch como fallback si initialConsultations llega undefined.
  let initialConsultations: Parameters<typeof ConsultationsClient>[0]['initialConsultations'];
  let initialTotal: number | undefined;

  try {
    const pagedResult = await listConsultationsPaged({
      page: 1,
      limit: 15,
      sort: 'consultation_date',
    });

    initialConsultations = pagedResult.items.map((c) => ({
      id: c.id,
      consultation_code: c.consultation_code,
      consultation_date: c.consultation_date,
      created_at: c.created_at,
      chief_complaint: c.chief_complaint,
      notes: c.notes,
      diagnosis: c.diagnosis,
      treatment: c.treatment,
      status: mapAppointmentStatusToConsulta(c.appointment_status),
      appointment_status: c.appointment_status ?? null,
      payment_status: c.payment_status,
      appointment_id: c.appointment_id,
      patient_id: c.patient_id,
      patient_name: c.patient_name || 'Paciente',
      patient_phone: null,
      started_at: c.started_at,
      ended_at: c.ended_at,
      duration_minutes: c.duration_minutes,
      amount: (c as Record<string, unknown>).amount as number | null | undefined,
      version: null,
    }));
    initialTotal = pagedResult.total;
  } catch {
    // Si el backend no está disponible, el cliente cargará los datos por su cuenta.
    // No bloqueamos la navegación por un error de fetch.
  }

  // ConsultationsClient ya incluye su propio <Suspense> interno (necesario para
  // useSearchParams en App Router). No hace falta envolver aquí.
  return (
    <ConsultationsClient initialConsultations={initialConsultations} initialTotal={initialTotal} />
  );
}
