'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, FileText, ArrowRight, Zap } from 'lucide-react';
import { getPatientDashboard, getPatientProfile } from './actions';

const styles = `
  .card-hover {
    transition: box-shadow 200ms, transform 200ms;
  }
  .card-hover:hover {
    box-shadow: var(--dh-shadow-md);
    transform: translateY(-2px);
  }
  .gradient-hero {
    background: linear-gradient(135deg, var(--dh-turquoise-700) 0%, var(--dh-turquoise) 50%, var(--dh-turquoise-500) 100%);
  }
  .gradient-progress {
    background: linear-gradient(90deg, #a78bfa 0%, #8b5cf6 100%);
  }
`;

interface Appointment {
  id: string;
  scheduled_at: string;
  plan_name: string;
  status: string;
}

interface Patient {
  id: string;
  full_name: string;
}

interface PatientPackage {
  id: string;
  plan_name: string;
  total_sessions: number;
  used_sessions: number;
  doctor_id: string;
  doctor_name?: string;
  doctor_specialty?: string;
}

export default function PatientHome() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [packages, setPackages] = useState<PatientPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // ETAPA 1: dashboard + perfil via backend (BFF). El scope lo deriva el
        // backend de auth_user_id; el saludo usa el primer perfil del paciente.
        const [dashboard, profiles] = await Promise.all([
          getPatientDashboard(),
          getPatientProfile(),
        ]);

        const profile = profiles.length > 0 ? profiles[0] : null;
        if (!profile) {
          router.push('/login');
          return;
        }

        setUser({ email: profile.email ?? '' });
        setPatient({ id: profile.id, full_name: profile.fullName });

        if (dashboard.nextAppointment) {
          setNextAppointment({
            id: dashboard.nextAppointment.id,
            scheduled_at: dashboard.nextAppointment.scheduledAt,
            plan_name: dashboard.nextAppointment.planName ?? '',
            status: dashboard.nextAppointment.status,
          });
        }

        setTotalAppointments(dashboard.totalAppointments);

        // TODO Fase 5: endpoint de informes/reports del paciente (exposicion de
        // datos clinicos, decision de producto). Por ahora el contador queda en 0.
        setUnreadMessages(0);

        const enriched: PatientPackage[] = dashboard.activePackages.map((pkg) => ({
          id: pkg.id,
          plan_name: pkg.planName,
          total_sessions: pkg.totalSessions,
          used_sessions: pkg.usedSessions,
          doctor_id: pkg.doctorId,
          doctor_name: pkg.doctorName ?? undefined,
          doctor_specialty: undefined,
        }));
        setPackages(enriched);

        setLoading(false);
      } catch (err) {
        console.error('Error loading data:', err);
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse" />
          <p className="text-slate-500 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  const firstName = patient?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Paciente';

  return (
    <>
      <style>{styles}</style>
      <div className="space-y-6 sm:space-y-8">
        {/* Gradient Hero Banner */}
        <div
          className="gradient-hero p-6 sm:p-8 lg:p-10 relative overflow-hidden"
          style={{ borderRadius: 'var(--dh-r-xl)' }}
        >
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-white opacity-5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <p
              className="text-[11px] tracking-[0.12em] uppercase opacity-80 mb-2 text-white"
              style={{ fontFamily: 'var(--dh-font-mono)' }}
            >
              Tu portal de salud
            </p>
            <h2
              className="font-semibold tracking-tight text-white mb-2"
              style={{
                fontFamily: 'var(--dh-font-display)',
                fontSize: 'clamp(28px, 4vw, 38px)',
                letterSpacing: '-0.025em',
              }}
            >
              Hola, {firstName}
            </h2>
            <p className="text-sm sm:text-base text-white/85 mb-6 max-w-md leading-relaxed">
              Encuentra a tu especialista, agenda consultas y mantén tu salud en un solo lugar.
            </p>

            {!nextAppointment && (
              <Link href="/patient/appointments">
                <button
                  className="inline-flex items-center gap-2 bg-white font-semibold text-[13px] px-5 py-2.5 rounded-full transition-all hover:-translate-y-px"
                  style={{ color: 'var(--dh-turquoise-700)' }}
                >
                  <Calendar className="w-4 h-4" />
                  Agendar cita
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Next appointment */}
          <Link href="/patient/appointments">
            <div
              className="card-hover bg-white p-5 sm:p-6 space-y-4 cursor-pointer h-full"
              style={{
                border: '1px solid var(--dh-gray-100)',
                borderRadius: 'var(--dh-r-lg)',
              }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1 min-w-0">
                  <p
                    className="text-[11px] uppercase font-semibold tracking-wider"
                    style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
                  >
                    Próxima cita
                  </p>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--dh-ink)' }}>
                    {nextAppointment ? nextAppointment.plan_name : 'Sin citas agendadas'}
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--dh-turquoise-50)', color: 'var(--dh-turquoise-700)' }}
                >
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              {nextAppointment && (
                <div className="pt-2" style={{ borderTop: '1px solid var(--dh-gray-100)' }}>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--dh-gray-600)', fontFamily: 'var(--dh-font-mono)' }}
                  >
                    {new Date(nextAppointment.scheduled_at).toLocaleDateString('es-VE', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )}
              <div
                className="flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: 'var(--dh-turquoise-700)' }}
              >
                Ver todas <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>

          {/* Total appointments */}
          <Link href="/patient/appointments">
            <div
              className="card-hover bg-white p-5 sm:p-6 space-y-4 cursor-pointer h-full"
              style={{ border: '1px solid var(--dh-gray-100)', borderRadius: 'var(--dh-r-lg)' }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p
                    className="text-[11px] uppercase font-semibold tracking-wider"
                    style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
                  >
                    Total de citas
                  </p>
                  <p
                    className="font-semibold leading-none"
                    style={{
                      color: 'var(--dh-ink)',
                      fontFamily: 'var(--dh-font-display)',
                      fontSize: 32,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {totalAppointments}
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#D1FAE5', color: '#047857' }}
                >
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div
                className="flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: 'var(--dh-turquoise-700)' }}
              >
                Ver historial <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>

          {/* Reports */}
          <Link href="/patient/reports">
            <div
              className="card-hover bg-white p-5 sm:p-6 space-y-4 cursor-pointer h-full"
              style={{ border: '1px solid var(--dh-gray-100)', borderRadius: 'var(--dh-r-lg)' }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p
                    className="text-[11px] uppercase font-semibold tracking-wider"
                    style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
                  >
                    Informes
                  </p>
                  <p
                    className="font-semibold leading-none"
                    style={{
                      color: 'var(--dh-ink)',
                      fontFamily: 'var(--dh-font-display)',
                      fontSize: 32,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {unreadMessages}
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--dh-coral-100)', color: 'var(--dh-coral-600)' }}
                >
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div
                className="flex items-center gap-1.5 text-sm font-semibold"
                style={{ color: 'var(--dh-turquoise-700)' }}
              >
                Ver informes <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>
        </div>

        {/* Active Packages */}
        {packages.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-500" />
              Paquetes activos
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
              {packages.map((pkg) => {
                const remaining = pkg.total_sessions - pkg.used_sessions;
                const percentage = (pkg.used_sessions / pkg.total_sessions) * 100;
                return (
                  <div
                    key={pkg.id}
                    className="card-hover bg-white rounded-2xl border border-slate-200 border-l-4 border-l-violet-400 p-4 sm:p-6 space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase">
                          {pkg.plan_name}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          Te quedan {remaining} {remaining === 1 ? 'cita' : 'citas'}
                        </p>
                        {pkg.doctor_name && (
                          <p className="text-xs text-slate-500">
                            Dr. {pkg.doctor_name}
                            {pkg.doctor_specialty && (
                              <span className="text-slate-400"> · {pkg.doctor_specialty}</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="px-3 py-1 rounded-full bg-violet-50 text-xs font-bold text-violet-600">
                        {pkg.used_sessions}/{pkg.total_sessions}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="gradient-progress h-2 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-slate-500">
                        {pkg.used_sessions} de {pkg.total_sessions} usadas
                      </p>
                    </div>
                    {remaining > 0 && pkg.doctor_id && (
                      <Link
                        href={`/book/${pkg.doctor_id}`}
                        className="flex items-center justify-center gap-2 w-full py-2 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-lg text-xs font-semibold transition-colors border border-teal-200"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Agendar siguiente cita
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          <Link href="/patient/reports">
            <div className="card-hover bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-3 cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-50">
                  <FileText className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Mis Informes</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Revisa tus informes médicos y resultados
                  </p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/patient/profile">
            <div className="card-hover bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-3 cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-50">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Mi Perfil</p>
                  <p className="text-sm text-slate-500 mt-1">Actualiza tu información personal</p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
