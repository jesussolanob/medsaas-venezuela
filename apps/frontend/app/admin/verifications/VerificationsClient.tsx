'use client';

/**
 * VerificationsClient.tsx
 *
 * Panel admin de verificaciones de médicos.
 * Lista doctores por status (pending / verified / rejected).
 * Permite:
 *  - Verificar/Rechazar manualmente (verificación MANUAL).
 *  - Disparar y consultar el estado de verificación automática de MPPS vía SACS.
 */

import { useState, useTransition, useCallback, useEffect, useRef } from 'react';
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
  Zap,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Ban,
  ShieldOff,
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
  /**
   * Estado de acceso a la cuenta (ban duro).
   * El listado GET /api/admin/doctor-verifications NO incluye este campo —
   * se inicializa en undefined y se actualiza localmente tras cada acción de acceso.
   * undefined = estado desconocido (se muestran ambas opciones al admin).
   */
  isActive?: boolean;
}

type MppsStatus = 'pending' | 'verified' | 'not_found' | 'mismatch' | 'error';

interface CredentialRecord {
  credentialType: string;
  status: MppsStatus;
  declaredValue: string | null;
  evidence: unknown | null;
  checkedAt: string | null;
  attempts: number;
  lastError: string | null;
}

interface MppsState {
  status: MppsStatus;
  checkedAt: string | null;
  attempts: number;
  lastError: string | null;
}

// Map doctorId → MppsState (loaded on demand)
type MppsMap = Record<string, MppsState | 'loading' | 'idle'>;

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

/**
 * Badge visual for each MPPS auto-verification result.
 */
const MPPS_BADGE: Record<
  MppsStatus,
  { label: string; bg: string; text: string; borderColor: string; icon: React.ReactNode }
> = {
  verified: {
    label: 'MPPS verificado',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    icon: <CheckCircle2 className="w-3 h-3" aria-hidden="true" />,
  },
  mismatch: {
    label: 'MPPS no coincide',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    borderColor: 'border-amber-200',
    icon: <AlertCircle className="w-3 h-3" aria-hidden="true" />,
  },
  not_found: {
    label: 'No encontrado en SACS',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    borderColor: 'border-slate-200',
    icon: <HelpCircle className="w-3 h-3" aria-hidden="true" />,
  },
  pending: {
    label: 'Sin verificar',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    borderColor: 'border-slate-200',
    icon: <Clock className="w-3 h-3" aria-hidden="true" />,
  },
  error: {
    label: 'Error de portal',
    bg: 'bg-red-50',
    text: 'text-red-600',
    borderColor: 'border-red-200',
    icon: <XCircle className="w-3 h-3" aria-hidden="true" />,
  },
};

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function extractMppsFromCredentials(records: CredentialRecord[]): MppsState | null {
  const mppsRecord = records.find((r) => r.credentialType === 'mpps');
  if (!mppsRecord) return null;
  return {
    status: mppsRecord.status,
    checkedAt: mppsRecord.checkedAt,
    attempts: mppsRecord.attempts,
    lastError: mppsRecord.lastError,
  };
}

// ---------------------------------------------------------------------------
// Sub-component: MppsBadge
// ---------------------------------------------------------------------------

interface MppsBadgeProps {
  mppsNumber: string | null;
  mppsState: MppsState | 'loading' | 'idle' | undefined;
  onVerify: (force?: boolean) => void;
  verifying: boolean;
}

function MppsBadge({ mppsNumber, mppsState, onVerify, verifying }: MppsBadgeProps) {
  if (!mppsNumber) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 italic">
        Sin MPPS
      </span>
    );
  }

  const isLoading = mppsState === 'loading' || verifying;
  const hasResult = mppsState !== undefined && mppsState !== 'idle' && mppsState !== 'loading';
  const state = hasResult ? (mppsState as MppsState) : null;
  const badge = state ? MPPS_BADGE[state.status] : MPPS_BADGE['pending'];
  const isVerified = state?.status === 'verified';
  const hasChecked = state !== null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* MPPS number row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono" style={{ color: 'var(--dh-gray-600)' }}>
          MPPS: {mppsNumber}
        </span>

        {/* Auto-verification badge */}
        {(hasChecked || mppsState === 'idle') && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.borderColor}`}
            title={
              state?.checkedAt
                ? `Verificado el ${formatDateTime(state.checkedAt)}`
                : 'Sin verificación previa'
            }
          >
            {badge.icon}
            {badge.label}
          </span>
        )}

        {/* Loading spinner when fetching credentials */}
        {mppsState === 'loading' && !verifying && (
          <Loader2
            className="w-3.5 h-3.5 animate-spin text-slate-400"
            aria-label="Cargando estado de verificación"
          />
        )}
      </div>

      {/* Error detail */}
      {state?.lastError && (state.status === 'mismatch' || state.status === 'error') && (
        <p className="text-[11px] text-red-500 leading-snug pl-0.5">{state.lastError}</p>
      )}

      {/* Verify / Re-verify button */}
      <button
        onClick={() => onVerify(hasChecked && !isVerified)}
        disabled={isLoading}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-50 hover:border-teal-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ color: 'var(--dh-gray-600)' }}
        aria-label={
          hasChecked && !isVerified
            ? `Re-verificar MPPS de este médico`
            : `Verificar MPPS de este médico contra SACS`
        }
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        ) : hasChecked && !isVerified ? (
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
        ) : (
          <Zap className="w-3 h-3" aria-hidden="true" />
        )}
        {isLoading
          ? 'Verificando…'
          : hasChecked && !isVerified
            ? 'Re-verificar MPPS'
            : 'Verificar MPPS'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function VerificationsClient({ initialItems }: Props) {
  const [items, setItems] = useState<VerificationItem[]>(initialItems);
  const [activeTab, setActiveTab] = useState<VerificationStatus>('pending');
  const [updating, startUpdating] = useTransition();
  const [pendingDoctorId, setPendingDoctorId] = useState<string | null>(null);
  const [loadingRefresh, startRefresh] = useTransition();
  const [accessPendingId, setAccessPendingId] = useState<string | null>(null);

  // Map doctorId → mpps state
  const [mppsMap, setMppsMap] = useState<MppsMap>({});
  // Track which doctorId is currently running the verify-mpps POST
  const [verifyingMppsId, setVerifyingMppsId] = useState<string | null>(null);

  const filteredItems = items.filter((item) => item.verificationStatus === activeTab);
  const pendingCount = items.filter((i) => i.verificationStatus === 'pending').length;

  // Track which doctorIds have had their credentials fetched, to avoid re-fetch on re-render
  const fetchedRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Load credential state for all visible doctors on mount / tab change
  // ---------------------------------------------------------------------------

  const loadCredentials = useCallback(async (doctorId: string) => {
    if (fetchedRef.current.has(doctorId)) return;
    fetchedRef.current.add(doctorId);

    setMppsMap((prev) => ({ ...prev, [doctorId]: 'loading' }));

    try {
      const res = await fetch(`/api/admin/doctor-verifications/${doctorId}/credentials`);
      const json = (await res.json()) as { success?: boolean; data?: CredentialRecord[] };

      if (res.ok && json.success && Array.isArray(json.data)) {
        const mppsState = extractMppsFromCredentials(json.data);
        setMppsMap((prev) => ({
          ...prev,
          [doctorId]: mppsState ?? 'idle',
        }));
      } else {
        setMppsMap((prev) => ({ ...prev, [doctorId]: 'idle' }));
      }
    } catch {
      setMppsMap((prev) => ({ ...prev, [doctorId]: 'idle' }));
    }
  }, []);

  useEffect(() => {
    // Load credentials for all currently visible doctors that have an MPPS number
    const visibleWithMpps = filteredItems.filter((item) => item.mppsNumber);
    visibleWithMpps.forEach((item) => {
      void loadCredentials(item.doctorId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items]);

  // ---------------------------------------------------------------------------
  // Verify MPPS automatically
  // ---------------------------------------------------------------------------

  const handleVerifyMpps = useCallback(async (doctorId: string, force = false) => {
    setVerifyingMppsId(doctorId);

    try {
      const url = `/api/admin/doctor-verifications/${doctorId}/verify-mpps${force ? '?force=true' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          doctorId: string;
          credentialType: string;
          status: MppsStatus;
          attempts: number;
          checkedAt: string | null;
        };
        error?: string;
      };

      if (!res.ok || !json.success || !json.data) {
        showToast({
          type: 'error',
          message: json.error ?? 'No se pudo completar la verificación de MPPS.',
        });
        return;
      }

      const { status, attempts, checkedAt } = json.data;

      // Re-fetch the full credentials record to get lastError detail
      let lastError: string | null = null;
      try {
        const credRes = await fetch(`/api/admin/doctor-verifications/${doctorId}/credentials`);
        const credJson = (await credRes.json()) as {
          success?: boolean;
          data?: CredentialRecord[];
        };
        if (credRes.ok && credJson.success && Array.isArray(credJson.data)) {
          const mppsRec = credJson.data.find((r) => r.credentialType === 'mpps');
          lastError = mppsRec?.lastError ?? null;
        }
      } catch {
        // lastError stays null — not critical
      }

      setMppsMap((prev) => ({
        ...prev,
        [doctorId]: { status, attempts, checkedAt, lastError },
      }));

      const statusMessages: Record<MppsStatus, string> = {
        verified: 'MPPS verificado correctamente en el portal SACS.',
        not_found: 'El número MPPS no fue encontrado en el portal SACS.',
        mismatch: `El número MPPS no coincide con los registros de SACS.${lastError ? ` Detalle: ${lastError}` : ''}`,
        error: `Error al consultar el portal SACS.${lastError ? ` Detalle: ${lastError}` : ''}`,
        pending: 'La verificación quedó en estado pendiente.',
      };

      showToast({
        type: status === 'verified' ? 'success' : status === 'error' ? 'error' : 'info',
        message: statusMessages[status],
      });
    } catch {
      showToast({
        type: 'error',
        message: 'Error de conexión al intentar verificar el MPPS. Intenta nuevamente.',
      });
    } finally {
      setVerifyingMppsId(null);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Update manual verification status
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
              status === 'verified'
                ? 'Especialista verificado correctamente.'
                : 'Especialista rechazado.',
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
  // Toggle account access (hard ban)
  // ---------------------------------------------------------------------------

  async function handleToggleAccess(doctorId: string, targetActive: boolean, fullName: string) {
    const action = targetActive ? 'desbloquear' : 'bloquear';
    const confirmed = window.confirm(
      targetActive
        ? `¿Confirmas que deseas DESBLOQUEAR el acceso de ${fullName}? El especialista podrá usar la plataforma nuevamente.`
        : `¿Confirmas que deseas BLOQUEAR el acceso de ${fullName}? El especialista recibirá un error 403 en cualquier operación.`,
    );
    if (!confirmed) return;

    setAccessPendingId(doctorId);

    try {
      const res = await fetch(`/api/admin/doctors/${doctorId}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: targetActive }),
      });

      const json = (await res.json()) as {
        success?: boolean;
        data?: { id: string; isActive: boolean };
        error?: string;
        code?: string;
      };

      if (!res.ok || !json.success) {
        const knownErrors: Record<string, string> = {
          DOCTOR_NOT_FOUND: 'Especialista no encontrado.',
          CANNOT_BLOCK_SUPER_ADMIN: 'No se puede bloquear a un super administrador.',
          CANNOT_BLOCK_SELF: 'No puedes bloquearte a ti mismo.',
        };
        const message =
          (json.code ? knownErrors[json.code] : undefined) ??
          json.error ??
          'Error al actualizar el acceso. Intenta nuevamente.';
        showToast({ type: 'error', message });
        return;
      }

      // Optimistic local update — backend confirmed the change.
      setItems((prev) =>
        prev.map((item) =>
          item.doctorId === doctorId
            ? { ...item, isActive: json.data?.isActive ?? targetActive }
            : item,
        ),
      );

      showToast({
        type: 'success',
        message: targetActive
          ? `Acceso de ${fullName} desbloqueado correctamente.`
          : `Acceso de ${fullName} bloqueado correctamente.`,
      });
    } catch {
      showToast({ type: 'error', message: 'Error de conexión al actualizar el acceso.' });
    } finally {
      setAccessPendingId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Refresh full list
  // ---------------------------------------------------------------------------

  function handleRefresh() {
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/admin/doctor-verifications?limit=200`);
        const json = (await res.json()) as { success?: boolean; data?: VerificationItem[] };
        if (res.ok && json.success && Array.isArray(json.data)) {
          setItems(json.data);
          // Reset credential cache so they reload for new items
          fetchedRef.current.clear();
          setMppsMap({});
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
            Verificaciones de especialistas
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--dh-gray-500)' }}>
            Revisa y aprueba los registros profesionales enviados por los especialistas
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
            Hay <strong>{pendingCount}</strong> especialista{pendingCount !== 1 ? 's' : ''}{' '}
            pendiente
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
            const mppsState = mppsMap[item.doctorId];
            const isVerifyingThisDoctor = verifyingMppsId === item.doctorId;
            const isAccessPending = accessPendingId === item.doctorId;
            // isActive: true = cuenta activa, false = bloqueada, undefined = desconocido
            const isActive = item.isActive;

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
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {/* Email */}
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

                      {/* Cédula */}
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

                      {/* MPPS — with auto-verification badge and button */}
                      <div className="flex items-start gap-1.5 sm:col-span-2">
                        <Building
                          className="w-3.5 h-3.5 shrink-0 mt-0.5"
                          style={{ color: 'var(--dh-gray-400)' }}
                        />
                        <dt className="sr-only">MPPS</dt>
                        <dd className="flex-1 min-w-0">
                          <MppsBadge
                            mppsNumber={item.mppsNumber}
                            mppsState={mppsState}
                            onVerify={(force) => void handleVerifyMpps(item.doctorId, force)}
                            verifying={isVerifyingThisDoctor}
                          />
                        </dd>
                      </div>

                      {/* Colegiado */}
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

                  {/* Right: action buttons */}
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    {/* Verification buttons — only for pending status */}
                    {item.verificationStatus === 'pending' && (
                      <>
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
                      </>
                    )}

                    {/* Account access toggle — visible for all tabs */}
                    <div className="sm:mt-1">
                      {/* Badge when account is known-blocked */}
                      {isActive === false && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full mb-1.5 w-fit">
                          <ShieldOff className="w-3 h-3" aria-hidden="true" />
                          Acceso bloqueado
                        </span>
                      )}

                      {isActive === false ? (
                        <button
                          onClick={() =>
                            void handleToggleAccess(item.doctorId, true, item.fullName)
                          }
                          disabled={isAccessPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all disabled:opacity-50"
                          style={{
                            borderColor: '#D1FAE5',
                            color: '#065F46',
                            background: '#ECFDF5',
                          }}
                          aria-label={`Desbloquear acceso de ${item.fullName}`}
                        >
                          {isAccessPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          {isAccessPending ? 'Actualizando…' : 'Desbloquear acceso'}
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            void handleToggleAccess(item.doctorId, false, item.fullName)
                          }
                          disabled={isAccessPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 transition-all disabled:opacity-50"
                          style={{ color: 'var(--dh-gray-500)' }}
                          onMouseEnter={(e) => {
                            if (!isAccessPending) {
                              e.currentTarget.style.borderColor = '#FCA5A5';
                              e.currentTarget.style.color = '#DC2626';
                              e.currentTarget.style.background = '#FEF2F2';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '';
                            e.currentTarget.style.color = 'var(--dh-gray-500)';
                            e.currentTarget.style.background = '';
                          }}
                          aria-label={`Bloquear acceso de ${item.fullName}`}
                        >
                          {isAccessPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Ban className="w-3.5 h-3.5" />
                          )}
                          {isAccessPending ? 'Actualizando…' : 'Bloquear acceso'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
