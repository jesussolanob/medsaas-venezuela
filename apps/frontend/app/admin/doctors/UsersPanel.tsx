'use client';

/**
 * /admin/doctors — Especialistas
 * 2026-05-02: rediseño según handoff Delta Health Tech.
 * 2026-06-23: export PDF tabular + badge de vencimiento.
 */

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Search,
  MoreHorizontal,
  Download,
  Clock,
  Users,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { reportError } from '@/lib/report-error';
import NewDoctorModal from './NewDoctorModal';
import DoctorDetailDrawer from './DoctorDetailDrawer';
import { PageHead, Btn, StatCard, Card, StatusPill } from '@/components/dh';
import { clsx } from 'clsx';

// SpecialistsPdfButton importa estáticamente PdfDownloadButton + SpecialistsReportPdf
// (componentes react-pdf reales). El dynamic ssr:false aquí excluye TODO el código de
// @react-pdf/renderer del bundle SSR. Nunca pasar un next/dynamic como `document` a
// react-pdf — su reconciler no resuelve lazy/Suspense.
const SpecialistsPdfButton = dynamic(
  () => import('./SpecialistsPdfButton').then((m) => ({ default: m.SpecialistsPdfButton })),
  { ssr: false, loading: () => null },
);

interface Doctor {
  id: string;
  full_name: string;
  email: string;
  specialty?: string;
  is_active: boolean;
  created_at?: string;
  /** Real last login timestamp from the backend (null until Auth0 Fase 4). */
  last_sign_in_at?: string | null;
  /** Doctor identity document in canonical form (e.g. "V-12345678"). PII. */
  cedula?: string | null;
  plan?: string;
  subscription_status?: string;
  subscription_expires_at?: string;
}

/**
 * Returns days since the given date.
 * Returns null when dateStr is null/undefined (no activity data available).
 */
function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Returns the effective activity days for a doctor.
 * Uses last_sign_in_at first; falls back to created_at.
 * Returns null when neither field is available (never logged in + no created_at).
 */
function effectiveDaysSince(d: {
  last_sign_in_at?: string | null;
  created_at?: string | null;
}): number | null {
  return daysSince(d.last_sign_in_at ?? d.created_at);
}

/**
 * Calcula los días hasta el vencimiento de la suscripción.
 * Negativo = ya venció. null = sin fecha.
 */
function daysUntilExpiry(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

interface ExpiryBadgeProps {
  expiresAt?: string | null;
  dateText: string;
}

function ExpiryBadge({ expiresAt, dateText }: ExpiryBadgeProps) {
  const days = daysUntilExpiry(expiresAt);

  if (days === null) {
    return <span style={{ color: 'var(--dh-gray-400)' }}>—</span>;
  }

  // Vencido o vence en ≤7 días → rojo
  // Vence en ≤30 días → amarillo/ámbar
  // Más de 30 días → gris normal
  const isExpired = days <= 0;
  const isUrgent = days > 0 && days <= 7;
  const isWarning = days > 7 && days <= 30;

  if (!isExpired && !isUrgent && !isWarning) {
    return (
      <span style={{ fontFamily: 'var(--dh-font-mono)', color: 'var(--dh-gray-600)' }}>
        {dateText}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5" style={{ fontFamily: 'var(--dh-font-mono)' }}>
      <span style={{ color: isExpired || isUrgent ? '#b91c1c' : '#92400e' }}>{dateText}</span>
      <span
        className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
        style={{
          background: isExpired || isUrgent ? '#fee2e2' : '#fef3c7',
          color: isExpired || isUrgent ? '#b91c1c' : '#92400e',
        }}
      >
        {isExpired ? `Venció hace ${Math.abs(days)}d` : `Vence en ${days}d`}
      </span>
    </span>
  );
}

// Colores avatar deterministicos (hash sobre id)
const AVATAR_COLORS = [
  'var(--dh-turquoise)',
  'var(--dh-coral)',
  'var(--dh-ink)',
  'var(--dh-turquoise-700)',
];
function avatarColorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initialsOf(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || '')
    .join('');
}

// The "Plan / Estado" pill reflects SUBSCRIPTION status (the source of truth shown in
// /admin/subscriptions), not session activity. Activity is shown separately in the
// "Actividad" column. Note: is_active here means "recently active" (derived from
// activityStatus, always inactive until Auth0 tracks last_sign_in) — it must NOT gate
// the subscription pill, otherwise every doctor renders as "Suspendido".
// Default 'active': a doctor without a subscription row is treated as active (beta privada).
function subscriptionPillStatus(
  subscriptionStatus?: string,
): 'past_due' | 'suspended' | 'trial' | 'active' {
  switch (subscriptionStatus) {
    case 'past_due':
      return 'past_due';
    case 'suspended':
      return 'suspended';
    case 'trial':
      return 'trial';
    default:
      return 'active';
  }
}

// Filtros disponibles sobre la lista de especialistas.
// 'all'         → sin filtro adicional
// 'active'      → is_active === true
// 'inactive_7d' → sin actividad ≥7 días (y is_active)
// 'new_month'   → registrado en el mes actual
type ActiveFilter = 'all' | 'active' | 'inactive_7d' | 'new_month';

export default function UsersPanel() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');

  const loadDoctors = async () => {
    try {
      const res = await fetch('/api/admin/doctors');
      if (!res.ok) throw new Error('Failed to load doctors');
      const data = await res.json();
      setDoctors(data || []);
    } catch (err) {
      reportError('UsersPanel', 'loadDoctors', err);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadDoctors();
      setLoading(false);
    };
    load();
  }, []);

  // Descarga el CSV de especialistas. La ruta devuelve Content-Disposition:
  // attachment, así que un click en un <a> dispara la descarga sin navegar.
  const exportDoctors = () => {
    const a = document.createElement('a');
    a.href = '/api/admin/doctors/export';
    a.download = 'especialistas.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const activeDoctors = doctors.filter((d) => d.is_active).length;
  const inactiveDays7 = doctors.filter((d) => {
    const days = effectiveDaysSince(d);
    // Doctors with no activity data (days === null) are NOT counted as inactive —
    // they are new accounts that have never signed in. Only count those with real data.
    return days !== null && days >= 7 && d.is_active;
  }).length;
  const newThisMonth = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return doctors.filter((d) => d.created_at && new Date(d.created_at).getTime() >= startMonth)
      .length;
  }, [doctors]);

  // Aplica primero el filtro de chip y luego el de búsqueda de texto. El orden
  // importa porque la exportación de CSV/PDF usa `filteredDoctors`, así el export
  // siempre refleja lo que el usuario está viendo en pantalla.
  const filteredDoctors = useMemo(() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let result = doctors;

    if (activeFilter === 'active') {
      result = result.filter((d) => d.is_active);
    } else if (activeFilter === 'inactive_7d') {
      result = result.filter((d) => {
        const days = effectiveDaysSince(d);
        return days !== null && days >= 7 && d.is_active;
      });
    } else if (activeFilter === 'new_month') {
      result = result.filter((d) => d.created_at && new Date(d.created_at).getTime() >= startMonth);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.full_name?.toLowerCase().includes(q) ||
          d.email?.toLowerCase().includes(q) ||
          d.specialty?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [doctors, activeFilter, searchQuery]);

  return (
    <>
      <PageHead
        title="Especialistas"
        subtitle={`${doctors.length} profesionales registrados · ${activeDoctors} activos en la plataforma`}
        actions={
          <>
            <Btn
              variant="secondary"
              icon={<Download className="w-4 h-4" />}
              onClick={exportDoctors}
            >
              CSV
            </Btn>
            {/*
             * PDF export: exporta filteredDoctors — la lista que el usuario está
             * viendo (filtrada por búsqueda activa en la UI). Sin filtro activo
             * coincide con la lista completa. Para exportar todo, borrar el filtro.
             * SpecialistsPdfButton importa react-pdf estáticamente; el dynamic
             * ssr:false arriba garantiza que no llega al bundle del servidor.
             */}
            <SpecialistsPdfButton
              rows={filteredDoctors}
              fileName={`especialistas-${new Date().toISOString().split('T')[0]}.pdf`}
            />
            <NewDoctorModal />
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard
          label="Total registrados"
          value={doctors.length.toLocaleString('es-VE')}
          icon={<Users size={16} />}
          delta={newThisMonth > 0 ? `+${newThisMonth} este mes` : 'Sin nuevos'}
          deltaColor={newThisMonth > 0 ? 'success' : 'neutral'}
        />
        <StatCard
          label="Activos"
          value={activeDoctors.toLocaleString('es-VE')}
          icon={<UserCheck size={16} />}
          delta={`${doctors.length > 0 ? Math.round((activeDoctors / doctors.length) * 100) : 0}% del total`}
          deltaColor="success"
        />
        <StatCard
          label="+7d sin actividad"
          value={inactiveDays7.toLocaleString('es-VE')}
          icon={<AlertTriangle size={16} />}
          delta={inactiveDays7 > 0 ? 'Posible churn' : 'Todos activos'}
          deltaColor={inactiveDays7 > 0 ? 'error' : 'success'}
        />
        <StatCard
          label="Nuevos este mes"
          value={newThisMonth.toLocaleString('es-VE')}
          icon={<Clock size={16} />}
          delta="Registros recientes"
          deltaColor="turquoise"
        />
      </div>

      {/* Search + filtros */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <div
          className="flex items-center gap-2.5 bg-white rounded-full px-4 py-2.5 flex-1 min-w-[260px] max-w-md"
          style={{ border: '1.5px solid var(--dh-gray-100)' }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--dh-gray-400)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, cédula, email o especialidad..."
            className="flex-1 outline-none text-[13px] bg-transparent"
            style={{ color: 'var(--dh-ink)' }}
          />
        </div>

        {/* Chips de filtro. Al hacer clic se aplica el filtro a filteredDoctors
            (también afecta la exportación CSV/PDF que usa filteredDoctors).  */}
        {(
          [
            { key: 'all', label: 'Todos', count: doctors.length },
            { key: 'active', label: 'Activos', count: activeDoctors },
            { key: 'inactive_7d', label: '+7d sin actividad', count: inactiveDays7 },
            { key: 'new_month', label: 'Nuevos este mes', count: newThisMonth },
          ] as { key: ActiveFilter; label: string; count: number }[]
        ).map(({ key, label, count }) => {
          const isSelected = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors cursor-pointer',
                isSelected ? 'text-white' : 'bg-white',
              )}
              style={
                isSelected
                  ? { background: 'var(--dh-turquoise)', border: '1.5px solid var(--dh-turquoise)' }
                  : { border: '1.5px solid var(--dh-gray-100)', color: 'var(--dh-gray-800)' }
              }
            >
              {label}
              <span
                className={clsx(
                  'text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none',
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100',
                )}
                style={isSelected ? {} : { color: 'var(--dh-gray-600)' }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tabla — desktop */}
      <Card padding={0}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--dh-gray-50)' }}>
                {[
                  'Especialista',
                  'Especialidad',
                  'Plan / Estado',
                  'Vencimiento',
                  'Actividad',
                  '',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left"
                    style={{
                      padding: '14px 20px',
                      fontSize: 11,
                      fontFamily: 'var(--dh-font-mono)',
                      color: 'var(--dh-gray-600)',
                      textTransform: 'uppercase',
                      letterSpacing: '.08em',
                      fontWeight: 500,
                      borderBottom: '1px solid var(--dh-gray-100)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-12"
                    style={{ color: 'var(--dh-gray-400)' }}
                  >
                    Cargando especialistas…
                  </td>
                </tr>
              ) : filteredDoctors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--dh-gray-50)' }}
                      >
                        <UserCheck className="w-6 h-6" style={{ color: 'var(--dh-gray-400)' }} />
                      </div>
                      <p className="text-sm" style={{ color: 'var(--dh-gray-400)' }}>
                        {searchQuery ? 'Sin resultados' : 'Aún no hay especialistas registrados'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDoctors.map((d, i) => {
                  const days = effectiveDaysSince(d);
                  const status = subscriptionPillStatus(d.subscription_status);
                  const venceText = d.subscription_expires_at
                    ? new Date(d.subscription_expires_at).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  return (
                    <tr
                      key={d.id}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom:
                          i < filteredDoctors.length - 1 ? '1px solid var(--dh-gray-100)' : 'none',
                      }}
                      onClick={() => setSelectedDoctor(d)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--dh-gray-50)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                            style={{
                              background: avatarColorFor(d.id),
                              fontFamily: 'var(--dh-font-display)',
                            }}
                          >
                            {initialsOf(d.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="font-semibold truncate"
                              style={{ color: 'var(--dh-ink)' }}
                            >
                              {d.full_name}
                            </div>
                            <div
                              className="text-[11px] truncate"
                              style={{ color: 'var(--dh-gray-400)', marginTop: 2 }}
                            >
                              {d.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--dh-gray-800)' }}>
                        {d.specialty ?? '—'}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div className="flex flex-col gap-1.5 items-start">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                            style={{
                              background: 'var(--dh-turquoise-50)',
                              color: 'var(--dh-turquoise-700)',
                            }}
                          >
                            {d.plan || 'trial'}
                          </span>
                          <StatusPill status={status} size="sm" />
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <ExpiryBadge expiresAt={d.subscription_expires_at} dateText={venceText} />
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        {days === null ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: '#F1F5F9', color: '#94A3B8' }}
                          >
                            <Clock className="w-3 h-3" />
                            Sin actividad
                          </span>
                        ) : (
                          <span
                            className={clsx(
                              'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold',
                            )}
                            style={{
                              background:
                                days >= 14 ? '#FEE2E2' : days >= 7 ? '#FEF3C7' : '#D1FAE5',
                              color: days >= 14 ? '#B91C1C' : days >= 7 ? '#92400E' : '#047857',
                            }}
                          >
                            <Clock className="w-3 h-3" />
                            {days === 0 ? 'Hoy' : `${days}d`}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDoctor(d);
                          }}
                          style={{
                            color: 'var(--dh-gray-400)',
                            cursor: 'pointer',
                            padding: 6,
                            border: 'none',
                            background: 'transparent',
                          }}
                          title="Ver detalle"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination footer */}
          {!loading && filteredDoctors.length > 0 && (
            <div
              className="flex items-center justify-between text-xs"
              style={{
                padding: '14px 20px',
                color: 'var(--dh-gray-600)',
                borderTop: '1px solid var(--dh-gray-100)',
              }}
            >
              <span>
                Mostrando {filteredDoctors.length} de {doctors.length}
              </span>
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--dh-gray-100)' }}>
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--dh-gray-400)' }}>
              Cargando especialistas…
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm" style={{ color: 'var(--dh-gray-400)' }}>
                {searchQuery ? 'Sin resultados' : 'Aún no hay especialistas'}
              </p>
            </div>
          ) : (
            filteredDoctors.map((d) => {
              const status = subscriptionPillStatus(d.subscription_status);
              const venceText = d.subscription_expires_at
                ? new Date(d.subscription_expires_at).toLocaleDateString('es-VE', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDoctor(d)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-[var(--dh-gray-50)]"
                  style={{ borderColor: 'var(--dh-gray-100)' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                    style={{
                      background: avatarColorFor(d.id),
                      fontFamily: 'var(--dh-font-display)',
                    }}
                  >
                    {initialsOf(d.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-semibold truncate text-sm"
                      style={{ color: 'var(--dh-ink)' }}
                    >
                      {d.full_name}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--dh-gray-400)' }}>
                      {d.specialty ?? d.email}
                    </div>
                    {/* Badge de vencimiento en mobile */}
                    <div className="mt-1">
                      <ExpiryBadge expiresAt={d.subscription_expires_at} dateText={venceText} />
                    </div>
                  </div>
                  <StatusPill status={status} size="sm" />
                </button>
              );
            })
          )}
        </div>
      </Card>

      <DoctorDetailDrawer
        doctor={selectedDoctor}
        isOpen={selectedDoctor !== null}
        onClose={() => setSelectedDoctor(null)}
        onDoctorUpdated={loadDoctors}
      />
    </>
  );
}
