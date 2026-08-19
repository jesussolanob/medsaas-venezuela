/**
 * /api/admin/doctor-details — detalle de un médico para el drawer admin.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (`GET /api/admin/doctors/:id`, super_admin).
 * El backend devuelve un shape plano camelCase; aquí lo re-mapeamos al shape anidado
 * `{ profile, subscription, patientCount, consultationCount, monthlyRevenue }` que espera
 * `DoctorDetailDrawer`. Sin Supabase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

interface BackendDoctorDetail {
  id: string;
  fullName: string;
  email: string;
  specialty: string | null;
  phone: string | null;
  cedula: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean | null;
  createdAt: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
  patientCount: number;
  consultationCount: number;
  monthlyRevenue: number;
}

export async function GET(req: NextRequest) {
  const doctorId = req.nextUrl.searchParams.get('id');
  if (!doctorId) {
    return NextResponse.json({ error: 'Falta el id del especialista' }, { status: 400 });
  }
  // Validate UUID before interpolating into the backend path (anti path-traversal).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(doctorId)) {
    return NextResponse.json({ error: 'ID de médico inválido' }, { status: 400 });
  }

  const result = await backendGet<BackendDoctorDetail>(`/api/admin/doctors/${doctorId}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const d = result.value;
  if (!d) {
    return NextResponse.json({ error: 'Médico no encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    profile: {
      id: d.id,
      full_name: d.fullName,
      email: d.email,
      specialty: d.specialty,
      phone: d.phone,
      cedula: d.cedula,
      city: d.city,
      state: d.state,
      is_active: d.isActive,
      created_at: d.createdAt,
    },
    subscription: {
      plan: d.subscriptionPlan ?? 'trial',
      status: d.subscriptionStatus ?? 'active',
      current_period_end: d.subscriptionExpiresAt,
      trial_ends_at: d.subscriptionPlan === 'trial' ? d.subscriptionExpiresAt : null,
    },
    patientCount: d.patientCount,
    consultationCount: d.consultationCount,
    monthlyRevenue: d.monthlyRevenue,
  });
}
