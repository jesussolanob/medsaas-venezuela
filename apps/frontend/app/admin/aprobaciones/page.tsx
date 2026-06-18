'use client';

/**
 * /admin/aprobaciones — Cola de aprobaciones del admin
 * 2026-05-02: nueva ruta del design Delta Health Tech.
 *
 * Foco: comprobantes de pago pendientes de revisión.
 * Pattern: tabla compacta con acciones inline (aprobar/rechazar) tipo
 * "Approvals queue" del design admin-tabs.jsx.
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
  DollarSign,
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
  duration_months: number;
  method: string;
  reference_number: string | null;
  receipt_url: string | null;
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
  const [previewId, setPreviewId] = useState<string | null>(null);

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
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  async function approve(id: string, doctorName: string, months: number) {
    if (
      !confirm(
        `Aprobar pago de ${doctorName}?\nSe extenderá la suscripción por ${months} mes${months > 1 ? 'es' : ''}.`,
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
      load();
      loadCounts();
    } catch (e: any) {
      showToast({ type: 'error', message: `Error: ${e.message}` });
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
      load();
      loadCounts();
    } catch (e: any) {
      showToast({ type: 'error', message: `Error: ${e.message}` });
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
              const submittedDate = new Date(p.created_at).toLocaleDateString('es-VE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
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
                      <span style={{ color: 'var(--dh-gray-300)' }}>·</span>
                      <span>
                        {p.duration_months} mes{p.duration_months > 1 ? 'es' : ''}
                      </span>
                      <span style={{ color: 'var(--dh-gray-300)' }}>·</span>
                      <span className="capitalize">{p.method.replace('_', ' ')}</span>
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
                        "{p.notes}"
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
                    {p.receipt_url && (
                      <button
                        onClick={() => setPreviewId(p.id)}
                        className="p-2 rounded-md transition-colors"
                        style={{ color: 'var(--dh-gray-400)' }}
                        title="Ver comprobante"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--dh-gray-50)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Eye className="w-4 h-4" />
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
                          onClick={() => approve(p.id, fullName, p.duration_months)}
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

      {/* Modal preview comprobante */}
      {previewId && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="bg-white shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            style={{ borderRadius: 'var(--dh-r-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="p-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
            >
              <h3 className="font-bold" style={{ color: 'var(--dh-ink)' }}>
                Comprobante de pago
              </h3>
              <button
                onClick={() => setPreviewId(null)}
                className="p-1.5 rounded-md hover:bg-[var(--dh-gray-50)]"
                style={{ color: 'var(--dh-gray-400)' }}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div
              className="flex-1 overflow-auto flex items-center justify-center p-4"
              style={{ background: 'var(--dh-gray-50)' }}
            >
              <iframe
                src={`/api/doctor/subscription/receipt/${previewId}`}
                title="Comprobante"
                className="w-full h-[70vh] bg-white"
                style={{ borderRadius: 'var(--dh-r-md)' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
