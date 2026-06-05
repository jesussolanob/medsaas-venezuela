/**
 * /admin/patients — Pacientes (vista global, SOLO estadísticas).
 *
 * ETAPA 1 — lee agregados del módulo NestJS `admin` (`GET /api/admin/patients`) vía el BFF
 * server-only. Sin Supabase. RBAC (super_admin) de /admin lo aplica `proxy.ts` + el backend.
 *
 * DECISIÓN DE PRODUCTO: el admin ve SOLO estadísticas agregadas. El detalle/PII de pacientes
 * es CONFIDENCIAL por médico — el admin nunca lista ni ve datos individuales de pacientes.
 */
import { backendGet } from '@/lib/api-client.server';
import { Users, Heart, Calendar, ClipboardList } from 'lucide-react';
import { PageHead, StatCard } from '@/components/dh';

export const revalidate = 30;

interface AdminPatientStats {
  totalPatients: number;
  totalConsultations: number;
  totalAppointments: number;
  activePatientsLast30Days: number;
  avgAge: number;
}

export default async function AdminPatientsPage() {
  const result = await backendGet<AdminPatientStats>('/api/admin/patients');
  const stats = result.ok ? result.value : null;

  const totalPatients = stats?.totalPatients ?? 0;
  const totalConsultations = stats?.totalConsultations ?? 0;
  const totalAppointments = stats?.totalAppointments ?? 0;
  const activosMes = stats?.activePatientsLast30Days ?? 0;
  const avgAge = stats?.avgAge ?? 0;

  const activosPct = totalPatients > 0 ? Math.round((activosMes / totalPatients) * 100) : 0;

  return (
    <div>
      <PageHead
        title="Pacientes"
        subtitle={`${totalPatients.toLocaleString('es-VE')} pacientes registrados · ${activosMes.toLocaleString('es-VE')} activos este mes`}
      />

      {/* KPIs (solo agregados — sin detalle de pacientes) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard
          label="Pacientes totales"
          value={totalPatients.toLocaleString('es-VE')}
          icon={<Users size={16} />}
          delta={totalPatients > 0 ? 'En la plataforma' : 'Sin datos'}
          deltaColor="success"
        />
        <StatCard
          label="Activos · 30 días"
          value={activosMes.toLocaleString('es-VE')}
          icon={<Heart size={16} />}
          delta={`${activosPct}% del total`}
          deltaColor="turquoise"
        />
        <StatCard
          label="Edad promedio"
          value={avgAge > 0 ? `${avgAge}` : '—'}
          icon={<ClipboardList size={16} />}
          delta={avgAge > 0 ? 'Años' : 'Sin fechas registradas'}
          deltaColor="neutral"
        />
        <StatCard
          label="Citas totales"
          value={totalAppointments.toLocaleString('es-VE')}
          icon={<Calendar size={16} />}
          delta={`${totalConsultations.toLocaleString('es-VE')} consultas registradas`}
          deltaColor="success"
        />
      </div>

      {/* Nota de confidencialidad */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500">
        El detalle de los pacientes es confidencial de cada médico. La administración solo visualiza
        estadísticas agregadas.
      </div>
    </div>
  );
}
