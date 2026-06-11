'use client';

/**
 * VerificationsClient.tsx
 *
 * Panel admin de verificaciones de médicos.
 * Lista doctores por status (pending / verified / rejected).
 * Permite marcar como verificado o rechazar con feedback optimista + toast.
 */

import { useState, useTransition } from 'react';
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  User,
  Hash,
  Mail,
  Building,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface VerificationItem {
  doctorId: string;
  fullName: string;
  email: string;
  cedula: string | null;
  mppsNumber: string | null;
  colegiadoNumber: string | null;
  verificationStatus: string;
  createdAt: string;
}

interface Props {
  initialItems: VerificationItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pendientes',
  verified: 'Verificados',
  rejected: 'Rechazados',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: {
    bg: 'bg-amber-50 border border-amber-200',
    text: 'text-amber-700',
    label: 'Pendiente',
  },
  verified: {
    bg: 'bg-emerald-50 border border-emerald-200',
    text: 'text-emerald-700',
    label: 'Verificado',
  },
  rejected: {
    bg: 'bg-red-50 border border-red-200',
    text: 'text-red-700',
    label: 'Rechazado',
  },
};

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VerificationsClient({ initialItems }: Props) {
  const [items, setItems] = useState<VerificationItem[]>(initialItems);
  const [activeTab, setActiveTab] = useState<VerificationStatus>('pending');
  const [updating, startUpdating] = useTransition();
  const [pendingDoctorId, setPendingDoctorId] = useState<string | null>(null);
  const [loadingRefresh, startRefresh] = useTransition();

  const filteredItems = items.filter((item) => item.verificationStatus === activeTab);

  const pendingCount = items.filter((i) => i.verificationStatus === 'pending').length;

  // ---------------------------------------------------------------------------
  // Update verification status
  // ---------------------------------------------------------------------------

  function handleUpdateStatus(doctorId: string, status: 'verified' | 'rejected') {
    setPendingDoctorId(doctorId);

    startUpdating(async () => {
      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.doctorId === doctorId ? { ...item, verificationStatus: status } : item,
        ),
      );

      try {
        const res = await fetch(`/api/admin/doctor-verifications/${doctorId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        const json = (await res.json()) as { success?: boolean; error?: string };

        if (!res.ok || !json.success) {
          // Rollback optimistic update
          setItems((prev) =>
            prev.map((item) =>
              item.doctorId === doctorId ? { ...item, verificationStatus: 'pending' } : item,
            ),
          );
          showToast({
            type: 'error',
            message: json.error ?? 'Error al actualizar el estado. Intenta nuevamente.',
          });
        } else {
          showToast({
            type: 'success',
            message:
              status === 'verified' ? 'Médico verificado correctamente.' : 'Médico rechazado.',
          });
        }
      } catch {
        // Rollback on network error
        setItems((prev) =>
          prev.map((item) =>
            item.doctorId === doctorId ? { ...item, verificationStatus: 'pending' } : item,
          ),
        );
        showToast({ type: 'error', message: 'Error de conexión. Intenta nuevamente.' });
      } finally {
        setPendingDoctorId(null);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Refresh
  // ---------------------------------------------------------------------------

  function handleRefresh() {
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/admin/doctor-verifications?limit=200`);
        const json = (await res.json()) as { success?: boolean; data?: VerificationItem[] };
        if (res.ok && json.success && Array.isArray(json.data)) {
          setItems(json.data);
          showToast({ type: 'info', message: 'Lista actualizada.' });
        }
      } catch {
        showToast({ type: 'error', message: 'No se pudo actualizar la lista.' });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1
            className="font-bold text-xl tracking-tight"
            style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-display)' }}
          >
            Verificaciones de médicos
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dh-gray-500)' }}>
            Revisa y aprueba los registros profesionales enviados por los médicos
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loadingRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
          style={{ color: 'var(--dh-gray-600)' }}
          aria-label="Actualizar lista"
        >
          <RefreshCw className={`w-4 h-4 ${loadingRefresh ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'var(--dh-gray-50)', border: '1px solid var(--dh-gray-100)' }}
        role="tablist"
        aria-label="Filtrar por estado de verificación"
      >
        {(Object.keys(TAB_LABELS) as VerificationStatus[]).map((tab) => {
          const isActive = activeTab === tab;
          const count = items.filter((i) => i.verificationStatus === tab).length;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={
                isActive
                  ? {
                      background: 'white',
                      color: 'var(--dh-ink)',
                      boxShadow: 'var(--dh-shadow-sm, 0 1px 3px rgba(0,0,0,.08))',
                    }
                  : { color: 'var(--dh-gray-500)' }
              }
            >
              {tab === 'pending' && <Clock className="w-3.5 h-3.5" />}
              {tab === 'verified' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {tab === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
              {TAB_LABELS[tab]}
              {count > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                  style={
                    tab === 'pending' && count > 0
                      ? { background: 'var(--dh-turquoise)', color: 'white' }
                      : {
                          background: 'var(--dh-gray-100)',
                          color: 'var(--dh-gray-500)',
                        }
                  }
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pending alert banner */}
      {activeTab === 'pending' && pendingCount > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{
            background: 'var(--dh-turquoise-50)',
            border: '1px solid var(--dh-turquoise-100)',
          }}
          role="status"
        >
          <ShieldAlert
            className="w-4 h-4 mt-0.5 shrink-0"
            style={{ color: 'var(--dh-turquoise)' }}
          />
          <p className="text-sm" style={{ color: 'var(--dh-turquoise-700)' }}>
            Hay <strong>{pendingCount}</strong> médico{pendingCount !== 1 ? 's' : ''} pendiente
            {pendingCount !== 1 ? 's' : ''} de verificación.
          </p>
        </div>
      )}

      {/* Empty state */}
      {filteredItems.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ border: '2px dashed var(--dh-gray-100)' }}
        >
          {activeTab === 'pending' && (
            <Clock className="w-10 h-10 mb-3" style={{ color: 'var(--dh-gray-300)' }} />
          )}
          {activeTab === 'verified' && (
            <ShieldCheck className="w-10 h-10 mb-3" style={{ color: 'var(--dh-gray-300)' }} />
          )}
          {activeTab === 'rejected' && (
            <ShieldX className="w-10 h-10 mb-3" style={{ color: 'var(--dh-gray-300)' }} />
          )}
          <p className="font-semibold text-sm" style={{ color: 'var(--dh-gray-400)' }}>
            No hay médicos{' '}
            {activeTab === 'pending'
              ? 'pendientes de verificación'
              : activeTab === 'verified'
                ? 'verificados'
                : 'rechazados'}{' '}
            por el momento.
          </p>
        </div>
      )}

      {/* Cards list */}
      {filteredItems.length > 0 && (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const style = STATUS_STYLES[item.verificationStatus] ?? STATUS_STYLES['pending'];
            const isBusy = updating && pendingDoctorId === item.doctorId;

            return (
              <article
                key={item.doctorId}
                className="bg-white border border-slate-200 rounded-xl p-5 transition-shadow hover:shadow-sm"
                aria-label={`Registro de ${item.fullName}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Name + status */}
                    <div className="flex items-start gap-2.5 flex-wrap">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'var(--dh-gray-50)' }}
                        aria-hidden="true"
                      >
                        <User className="w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                      </div>
                      <div className="min-w-0">
                        <p
                          className="font-bold text-sm leading-tight"
                          style={{ color: 'var(--dh-ink)' }}
                        >
                          {item.fullName}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
                          Registrado el {formatDate(item.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${style.bg} ${style.text} ml-auto sm:ml-0`}
                      >
                        {style.label}
                      </span>
                    </div>

                    {/* Fields grid */}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      <div className="flex items-center gap-1.5">
                        <Mail
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: 'var(--dh-gray-400)' }}
                        />
                        <dt className="sr-only">Email</dt>
                        <dd className="text-xs truncate" style={{ color: 'var(--dh-gray-600)' }}>
                          {item.email}
                        </dd>
                      </div>

                      {item.cedula && (
                        <div className="flex items-center gap-1.5">
                          <Hash
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: 'var(--dh-gray-400)' }}
                          />
                          <dt className="sr-only">Cédula</dt>
                          <dd className="text-xs font-mono" style={{ color: 'var(--dh-gray-600)' }}>
                            {item.cedula}
                          </dd>
                        </div>
                      )}

                      {item.mppsNumber && (
                        <div className="flex items-center gap-1.5">
                          <Building
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: 'var(--dh-gray-400)' }}
                          />
                          <dt className="sr-only">MPPS</dt>
                          <dd className="text-xs font-mono" style={{ color: 'var(--dh-gray-600)' }}>
                            MPPS: {item.mppsNumber}
                          </dd>
                        </div>
                      )}

                      {item.colegiadoNumber && (
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: 'var(--dh-gray-400)' }}
                          />
                          <dt className="sr-only">Colegiado</dt>
                          <dd className="text-xs font-mono" style={{ color: 'var(--dh-gray-600)' }}>
                            Colegiado: {item.colegiadoNumber}
                          </dd>
                        </div>
                      )}

                      {!item.mppsNumber && !item.colegiadoNumber && (
                        <div className="col-span-2">
                          <p className="text-xs italic" style={{ color: 'var(--dh-gray-300)' }}>
                            Sin datos de MPPS ni colegiado
                          </p>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Right: action buttons (only for pending) */}
                  {item.verificationStatus === 'pending' && (
                    <div className="flex sm:flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleUpdateStatus(item.doctorId, 'verified')}
                        disabled={isBusy || updating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                        style={{
                          background: 'var(--dh-turquoise)',
                          color: 'white',
                        }}
                        onMouseEnter={(e) => {
                          if (!isBusy) e.currentTarget.style.opacity = '0.88';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        aria-label={`Marcar a ${item.fullName} como verificado`}
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        Verificar
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(item.doctorId, 'rejected')}
                        disabled={isBusy || updating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 transition-colors disabled:opacity-50"
                        style={{ color: 'var(--dh-gray-600)' }}
                        onMouseEnter={(e) => {
                          if (!isBusy) {
                            e.currentTarget.style.borderColor = '#FCA5A5';
                            e.currentTarget.style.color = '#DC2626';
                            e.currentTarget.style.background = '#FEF2F2';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '';
                          e.currentTarget.style.color = 'var(--dh-gray-600)';
                          e.currentTarget.style.background = '';
                        }}
                        aria-label={`Rechazar a ${item.fullName}`}
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShieldX className="w-4 h-4" />
                        )}
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
