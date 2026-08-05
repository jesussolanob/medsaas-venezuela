'use client';

/**
 * /admin/aprobaciones — Cola de aprobaciones del admin
 * 2026-05-02: nueva ruta del design Delta Health Tech.
 *
 * Foco: comprobantes de pago pendientes de revisión.
 * Pattern: tabla compacta con acciones inline (aprobar/rechazar) tipo
 * "Approvals queue" del design admin-tabs.jsx.
 *
 * WP-F (2026-08): comprobante se abre en pestaña nueva via signed URL on-demand.
 * Campos añadidos al tipo: bcv_rate, period, bank_code, bank_name, receipt_path.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  AlertTriangle,
  Calendar,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { PageHead, Btn, StatCard, Card, StatusPill } from '@/components/dh';
import { showToast } from '@/components/ui/Toaster';

type PaymentRow = {
  id: string;
  doctor_id: string;
  amount_usd: number;
  amount_bs: number | null;
  bcv_rate_used: number | null;
  /** WP-F: alias for bcv_rate_used from new payment model. */
  bcv_rate?: number | null;
  duration_months: number;
  /** WP-F: billing period key (monthly|quarterly|semiannual|annual). */
  period?: string | null;
  method: string;
  bank_code?: string | null;
  bank_name?: string | null;
  reference_number: string | null;
  /** Old field — may be absent in new payment model. */
  receipt_url?: string | null;
  /** WP-F: GCS object path — fetch signed URL on-demand. */
  receipt_path?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  profiles: { full_name: string; email: string; specialty: string | null } | null;
};

const AVATAR_COLORS = [
  'var(--dh-turquoise)',
  'var(--dh-coral)',
  'var(--dh-ink)',
  'var(--dh-turquoise-700)',
];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || '')
    .join('');
}

export default function AprobacionesPage() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [fetchingReceiptId, setFetchingReceiptId] = useState<string | null>(null);

  // Counts (para los tabs)
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/payments?status=${tab}`);
      const j = await r.json();
      if (r.ok) setPayments(j.payments || []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const loadCounts = useCallback(async () => {
    try {
      const [p, a, r] = await Promise.all([
        fetch('/api/admin/payments?status=pending').then((x) => x.json()),
        fetch('/api/admin/payments?status=approved').then((x) => x.json()),
        fetch('/api/admin/payments?status=rejected').then((x) => x.json()),
      ]);
      setCounts({
        pending: (p.payments || []).length,
        approved: (a.payments || []).length,
        rejected: (r.payments || []).length,
      });
    } catch {
      // counts are best-effort; failures are silent
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    load();
  }, [load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  /**
   * Fetch a short-lived signed URL for the receipt and open it in a new tab.
   * Never embeds the URL in the DOM — requested on-demand only.
   */
  async function openReceipt(id: string) {
    setFetchingReceiptId(id);
    try {
      const r = await fetch(`/api/admin/subscription-payments/${id}/receipt-url`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo obtener el comprobante');
      window.open(j.url as string, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      showToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Error al abrir el comprobante',
      });
    } finally {
      setFetchingReceiptId(null);
    }
  }

  async function approve(id: string, doctorName: string, months: number) {
    if (
      !confirm(
        `Aprobar pago de ${doctorName}?${months > 0 ? `\nSe extenderá la suscripción por ${months} mes${months > 1 ? 'es' : ''}.` : ''}`,
      )
    )
      return;
    setActioning(id);
    try {
      const r = await fetch('/api/admin/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      showToast({ type: 'success', message: 'Pago aprobado' });
      load();
      loadCounts();
    } catch (e: unknown) {
      showToast({
        type: 'error',
        message: e instanceof Error ? `Error: ${e.message}` : 'Error desconocido',
      });
    } finally {
      setActioning(null);
    }
  }

  async function reject(id: string) {
    const reason = prompt('Razón del rechazo:');
    if (!reason) return;
    setActioning(id);
    try {
      const r = await fetch('/api/admin/payments/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: id, reason }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast({ type: 'success', message: 'Comprobante rechazado' });
      load();
      loadCounts();
    } catch (e: unknown) {
      showToast({
        type: 'error',
        message: e instanceof Error ? `Error: ${e.message}` : 'Error desconocido',
      });
    } finally {
      setActioning(null);
    }
  }

  // Tiempo promedio de respuesta
  const avgResponseDays = (() => {
    if (counts.approved === 0 && counts.rejected === 0) return null;
    return '1.4d'; // mock por ahora — calcular real desde reviewed_at - created_at
  })();

  return (
    <div>
      <PageHead
        title="Aprobaciones"
        subtitle="Cola de comprobantes de pago pendientes de revisión"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard
          label="Pendientes"
          value={counts.pending.toLocaleString('es-VE')}
          icon={<ClipboardCheck size={16} />}
          delta={counts.pending > 0 ? 'Por revisar' : 'Todo al día'}
          deltaColor={counts.pending > 0 ? 'error' : 'success'}
        />
        <StatCard
          label="Aprobados"
          value={counts.approved.toLocaleString('es-VE')}
          icon={<CheckCircle2 size={16} />}
          delta="Histórico total"
          deltaColor="success"
        />
        <StatCard
          label="Rechazados"
          value={counts.rejected.toLocaleString('es-VE')}
          icon={<XCircle size={16} />}
          delta="Histórico total"
          deltaColor="neutral"
        />
        <StatCard
          label="Tiempo promedio"
          value={avgResponseDays || '—'}
          icon={<Calendar size={16} />}
          delta="Desde envío a decisión"
          deltaColor="neutral"
        />
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 overflow-x-auto scrollbar-thin mb-4"
        style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
      >
        {(
          [
            { key: 'pending', label: 'Pendientes', count: counts.pending },
            { key: 'approved', label: 'Aprobados', count: counts.approved },
            { key: 'rejected', label: 'Rechazados', count: counts.rejected },
          ] as const
        ).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors"
              style={{
                borderBottom: active ? '2px solid var(--dh-turquoise)' : '2px solid transparent',
                color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                marginBottom: -1,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: active ? 'var(--dh-turquoise-50)' : 'var(--dh-gray-100)',
                    color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                    fontFamily: 'var(--dh-font-mono)',
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Cola de aprobación */}
      <Card padding={0}>
        <div
          className="flex items-center justify-between flex-wrap gap-2"
          style={{ padding: '18px 24px', borderBottom: '1px solid var(--dh-gray-100)' }}
        >
          <div className="text-[15px] font-bold" style={{ color: 'var(--dh-ink)' }}>
            {tab === 'pending'
              ? 'Cola de aprobación'
              : tab === 'approved'
                ? 'Aprobados'
                : 'Rechazados'}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 px-3.5 py-2 bg-white rounded-full text-xs font-medium cursor-pointer"
              style={{ border: '1.5px solid var(--dh-gray-100)', color: 'var(--dh-gray-800)' }}
            >
              <Filter className="w-3 h-3" />
              Más recientes
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--dh-gray-400)' }} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2
              className="w-6 h-6 animate-spin mx-auto"
              style={{ color: 'var(--dh-gray-300)' }}
            />
          </div>
        ) : payments.length === 0 ? (
          <div className="p-16 text-center">
            <CheckCircle2
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: 'var(--dh-gray-200)' }}
            />
            <p className="text-sm" style={{ color: 'var(--dh-gray-400)' }}>
              {tab === 'pending'
                ? 'No hay pagos pendientes — ¡todo al día!'
                : `Sin ${tab === 'approved' ? 'aprobados' : 'rechazados'} aún.`}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--dh-gray-100)' }}>
            {payments.map((p) => {
              const fullName = p.profiles?.full_name || 'Doctor/a';
              const specialty = p.profiles?.specialty || '—';
              const submittedDate = new Intl.DateTimeFormat('es-VE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }).format(new Date(p.created_at));
              return (
                <div
                  key={p.id}
                  className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] gap-4 sm:gap-5 items-center"
                  style={{ padding: '18px 24px', borderColor: 'var(--dh-gray-100)' }}
                >
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{
                      background: avatarColor(p.doctor_id),
                      fontFamily: 'var(--dh-font-display)',
                    }}
                  >
                    {initials(fullName)}
                  </div>

                  {/* Info principal */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-semibold text-[14px]"
                        style={{ color: 'var(--dh-ink)' }}
                      >
                        {fullName}
                      </span>
                      {p.amount_bs && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            background: '#FEF3C7',
                            color: '#92400E',
                            fontFamily: 'var(--dh-font-mono)',
                          }}
                        >
                          Bs.{' '}
                          {p.amount_bs.toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      )}
                    </div>
                    <div
                      className="text-[12px] mt-1 flex items-center gap-2 flex-wrap"
                      style={{ color: 'var(--dh-gray-600)' }}
                    >
                      <span>{specialty}</span>
                      <span style={{ color: 'var(--dh-gray-300)' }}>·</span>
                      <span style={{ fontFamily: 'var(--dh-font-mono)' }}>${p.amount_usd} USD</span>
                      {(p.bcv_rate ?? p.bcv_rate_used) && (
                        <>
                          <span style={{ color: 'var(--dh-gray-300)' }}>·</span>
                          <span style={{ fontFamily: 'var(--dh-font-mono)' }}>
                            BCV {(p.bcv_rate ?? p.bcv_rate_used)?.toFixed(2)}
                          </span>
                        </>
                      )}
                      {p.bank_name ? (
                        <>
                          <span style={{ color: 'var(--dh-gray-300)' }}>·</span>
                          <span>{p.bank_name}</span>
                        </>
                      ) : p.method ? (
                        <>
                          <span style={{ color: 'var(--dh-gray-300)' }}>·</span>
                          <span className="capitalize">{p.method.replace('_', ' ')}</span>
                        </>
                      ) : null}
                      {p.reference_number && (
                        <>
                          <span style={{ color: 'var(--dh-gray-300)' }}>·</span>
                          <span style={{ fontFamily: 'var(--dh-font-mono)' }}>
                            #{p.reference_number}
                          </span>
                        </>
                      )}
                    </div>
                    {p.notes && (
                      <div
                        className="text-[11px] italic mt-1"
                        style={{ color: 'var(--dh-gray-600)' }}
                      >
                        &ldquo;{p.notes}&rdquo;
                      </div>
                    )}
                    {p.rejection_reason && (
                      <div
                        className="text-[11px] mt-1 flex items-center gap-1"
                        style={{ color: '#B91C1C' }}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {p.rejection_reason}
                      </div>
                    )}
                  </div>

                  {/* Fecha */}
                  <div
                    className="text-right text-[12px] shrink-0 hidden sm:block"
                    style={{ color: 'var(--dh-gray-600)', fontFamily: 'var(--dh-font-mono)' }}
                  >
                    {submittedDate}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    {(p.receipt_path ?? p.receipt_url) && (
                      <button
                        onClick={() => openReceipt(p.id)}
                        disabled={fetchingReceiptId === p.id}
                        className="p-2 rounded-md transition-colors disabled:opacity-50"
                        style={{ color: 'var(--dh-gray-400)' }}
                        title="Ver comprobante"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--dh-gray-50)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {fetchingReceiptId === p.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {tab === 'pending' && (
                      <>
                        <Btn
                          variant="danger"
                          size="sm"
                          onClick={() => reject(p.id)}
                          disabled={actioning === p.id}
                        >
                          Rechazar
                        </Btn>
                        <Btn
                          variant="turquoise"
                          size="sm"
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => approve(p.id, fullName, p.duration_months ?? 0)}
                          disabled={actioning === p.id}
                        >
                          Aprobar
                        </Btn>
                      </>
                    )}
                    {tab !== 'pending' && <StatusPill status={p.status} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Comprobante se abre en pestaña nueva via GET /api/admin/subscription-payments/:id/receipt-url */}
    </div>
  );
}
