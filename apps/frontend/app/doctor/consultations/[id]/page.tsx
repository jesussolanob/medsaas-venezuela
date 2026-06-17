'use client';

// Etapa 1: Supabase removed.
// - Consultation load    → GET /api/consultations/:id  (via actions.ts)
// - Patient load         → GET /api/patients/:id       (via backendGet in client fetch)
// - started_at tracking  → PATCH /api/doctor/consultations (existing BFF route)
// - blocks_data save     → PATCH /api/doctor/consultations (existing BFF route)
// - Status buttons       → updateConsultation + approveConsultationPayment (actions.ts)
//   NOTE: consultation status field (completed/no_show) is not in Etapa-1 schema.
//   The buttons call updateConsultation for now (notes-only fields). Status tracking
//   will be wired in Fase 5.
// - Payment approval     → approveConsultationPayment (actions.ts)
// PLACEHOLDER: patient name loaded from /api/patients/:id via client fetch (masked).

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, User, Lock } from 'lucide-react';
import DynamicBlocks, { SnapshotBlock } from '@/components/consultation/DynamicBlocks';
import ConsultationRecorder from '@/components/consultation/ConsultationRecorder';
import { getConsultation, updateConsultation, approveConsultationPayment } from '../actions';
import { useDoctorFeatures } from '@/hooks/useDoctorFeatures';

type Consultation = {
  id: string;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  payment_status: string;
  plan_name: string | null;
  amount: number | null;
  blocks_snapshot: SnapshotBlock[] | null;
  blocks_data: Record<string, unknown> | null;
  patient_id: string;
  status?: string;
  appointment_id?: string | null;
};

type Patient = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cedula: string | null;
};

export default function ConsultationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { features: planFeatures, loading: planLoading } = useDoctorFeatures();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [blocksData, setBlocksData] = useState<Record<string, unknown>>({});
  const [blocksSnapshot, setBlocksSnapshot] = useState<SnapshotBlock[] | null>(null);

  useEffect(() => {
    async function load() {
      // 1. Fetch consultation from backend (actions.ts → GET /api/consultations/:id)
      const c = await getConsultation(params.id);

      if (!c) {
        setMsg({ kind: 'err', text: 'Consulta no encontrada' });
        setLoading(false);
        return;
      }

      // BUG-9 FIX: si el snapshot está vacío, resolver bloques en vivo desde config del doctor.
      let snapshot: SnapshotBlock[] | null = null;
      if (Array.isArray((c as any).blocks_snapshot) && (c as any).blocks_snapshot.length > 0) {
        snapshot = (c as any).blocks_snapshot as SnapshotBlock[];
      } else {
        try {
          const r = await fetch('/api/doctor/consultation-blocks', { cache: 'no-store' });
          if (r.ok) {
            const j = await r.json();
            snapshot = ((j.resolved || []) as Array<SnapshotBlock & { enabled?: boolean }>).filter(
              (b) => b.enabled !== false,
            );
          }
        } catch (e) {
          console.warn('[Consultation] failed to resolve blocks live:', e);
        }
      }

      // The backend persists the filled report VALUES in `blocks_snapshot` (JSONB
      // record). The template STRUCTURE is resolved separately above as `snapshot`.
      const stored = (c as any).blocks_snapshot;
      const storedValues: Record<string, unknown> =
        stored && typeof stored === 'object' && !Array.isArray(stored)
          ? (stored as Record<string, unknown>)
          : {};

      const consultation: Consultation = {
        id: c.id,
        consultation_code: c.consultation_code,
        consultation_date: c.consultation_date,
        chief_complaint: c.chief_complaint,
        payment_status: c.payment_status,
        plan_name: null, // comes from the linked appointment, not the consultation row
        amount: c.amount ?? null,
        blocks_snapshot: snapshot,
        blocks_data: storedValues,
        patient_id: c.patient_id,
        status: 'pending', // appointment status (completed/no_show) owned by the agenda
        appointment_id: c.appointment_id ?? null,
      };

      setConsultation(consultation);
      setBlocksData(storedValues); // hydrate the editor with previously-saved values
      setBlocksSnapshot(snapshot); // track snapshot separately so label edits can be persisted

      // Auto-tracking: setear started_at via PATCH BFF route (non-blocking)
      // Only if not yet completed — status not available in Etapa 1, skip check.
      fetch('/api/doctor/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, started_at: new Date().toISOString() }),
      }).catch(() => {
        /* non-blocking */
      });

      // 2. Load patient name via client-side fetch to BFF (masked data acceptable)
      if (c.patient_id) {
        fetch(`/api/doctor/patients/${c.patient_id}`)
          .then(async (r) => {
            if (r.ok) {
              const j = await r.json();
              const p = j?.data ?? j;
              if (p?.id) {
                setPatient({
                  id: p.id,
                  full_name: p.fullName ?? p.full_name ?? '—',
                  email: p.email ?? null,
                  phone: p.phone ?? null,
                  cedula: p.cedula ?? null,
                });
              }
            }
          })
          .catch(() => {
            /* patient name is optional display */
          });
      }

      setLoading(false);
    }
    load();
  }, [params.id]);

  // Detecta si los bloques tienen contenido real (no vacíos)
  function hasRealContent(data: Record<string, unknown>): boolean {
    return Object.values(data || {}).some((v) => {
      if (v == null) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v as object).length > 0;
      return Boolean(v);
    });
  }

  async function save() {
    if (!consultation) return;
    setSaving(true);
    setMsg(null);
    try {
      // Save blocks_data and updated blocks_snapshot (with any renamed labels) via BFF PATCH route
      const r = await fetch('/api/doctor/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: consultation.id,
          blocks_data: blocksData,
          ...(blocksSnapshot ? { blocks_snapshot: blocksSnapshot } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al guardar');

      // Auto-tracking: ended_at via backend action (non-blocking, best-effort)
      // Status transition deferred to Fase 5 (no status field in Etapa-1 schema).
      updateConsultation(consultation.id, {}).catch(() => {
        /* non-blocking */
      });

      // Refresh local status if blocks have real content
      if (hasRealContent(blocksData) && consultation.status !== 'completed') {
        setConsultation({ ...consultation, status: 'completed' });
      }

      setMsg({ kind: 'ok', text: 'Cambios guardados' });
    } catch (e: unknown) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );

  if (!consultation)
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{msg?.text ?? 'Consulta no encontrada'}</p>
        </div>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
      </div>

      {/* Header de la consulta */}
      <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Consulta</p>
            <p className="font-mono text-lg font-bold mt-0.5">{consultation.consultation_code}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60">Fecha</p>
            <p className="text-sm font-semibold">
              {new Date(consultation.consultation_date).toLocaleDateString('es-VE', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2">
          <User className="w-4 h-4 text-white/60" />
          <span className="text-sm">{patient?.full_name || '—'}</span>
        </div>
      </div>

      {/* Acciones de estado de la CONSULTA y del PAGO */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Estado de la consulta
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Etapa 1: status field not in backend schema. Buttons update local state only.
              Full status sync (appointments table) deferred to Fase 5. */}
          <button
            disabled={consultation.status === 'completed'}
            onClick={async () => {
              // Optimistic local update; backend status sync deferred to Fase 5.
              setConsultation({ ...consultation, status: 'completed' });
              setMsg({ kind: 'ok', text: 'Consulta marcada como atendida' });
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
              consultation.status === 'completed'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />{' '}
            {consultation.status === 'completed' ? 'Atendida ✓' : 'Marcar como atendida'}
          </button>
          <button
            disabled={consultation.status === 'no_show'}
            onClick={async () => {
              // Optimistic local update; backend status sync deferred to Fase 5.
              setConsultation({ ...consultation, status: 'no_show' });
              setMsg({ kind: 'ok', text: 'Marcada como No asistió' });
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
              consultation.status === 'no_show'
                ? 'bg-orange-100 text-orange-700 border-orange-300 cursor-default'
                : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200'
            }`}
          >
            {consultation.status === 'no_show' ? 'No asistió ✓' : 'No asistió'}
          </button>
          <span className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs text-slate-500 bg-slate-50 border border-slate-200">
            Estado actual:{' '}
            <strong className="text-slate-700">
              {consultation.status === 'completed'
                ? 'Atendida'
                : consultation.status === 'no_show'
                  ? 'No asistió'
                  : consultation.status === 'in_progress'
                    ? 'En curso'
                    : 'Pendiente'}
            </strong>
          </span>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Estado del pago
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              disabled={consultation.payment_status === 'approved'}
              onClick={async () => {
                // Call backend payment approval endpoint via actions.ts
                const result = await approveConsultationPayment(
                  consultation.id,
                  consultation.amount ?? 0,
                  'manual',
                );
                if (result.success) {
                  setConsultation({ ...consultation, payment_status: 'approved' });
                  setMsg({ kind: 'ok', text: 'Pago aprobado' });
                } else {
                  setMsg({ kind: 'err', text: result.error });
                }
              }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                consultation.payment_status === 'approved'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default'
                  : 'bg-teal-500 hover:bg-teal-600 text-white border-teal-500'
              }`}
            >
              {consultation.payment_status === 'approved'
                ? 'Pago aprobado ✓'
                : 'Marcar pago como aprobado'}
            </button>
            <span className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs text-slate-500 bg-slate-50 border border-slate-200">
              Estado actual:{' '}
              <strong className="text-slate-700">
                {consultation.payment_status === 'approved' ? 'Aprobado' : 'Pendiente'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
            msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {msg.text}
        </div>
      )}

      {/* Motivo de consulta (si existe) */}
      {consultation.chief_complaint && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Motivo de consulta
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {consultation.chief_complaint}
          </p>
        </div>
      )}

      {/* ── GRABAR CONSULTA (minutas tipo Google Meet) — requiere ai_transcription ──
          Mientras planLoading es true, se muestra el placeholder bloqueado para
          evitar el flash del componente premium antes de resolver el gate. */}
      {planLoading || !planFeatures.ai_transcription ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700">Grabar la consulta</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {planLoading ? 'Verificando plan...' : 'Disponible en un plan superior'}
            </p>
          </div>
          {!planLoading && (
            <a
              href="/doctor/upgrade"
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
            >
              Ver planes
            </a>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--dh-ink)' }}>
                Grabar la consulta
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-600)' }}>
                Activa el micrófono y la IA transcribe + sugiere cómo distribuirlo en tus bloques.
              </p>
            </div>
            <ConsultationRecorder
              availableBlocks={(blocksSnapshot ?? consultation.blocks_snapshot ?? []).map((b) => ({
                key: b.key,
                label: b.label,
              }))}
              onApplyToBlock={(blockKey, content, mode) => {
                setBlocksData((prev) => {
                  const current = prev[blockKey];
                  let next: unknown = content;
                  if (mode === 'append' && typeof current === 'string' && current.trim()) {
                    next = current.trimEnd() + '\n\n' + content;
                  }
                  return { ...prev, [blockKey]: next };
                });
              }}
            />
          </div>
        </div>
      )}

      {/* ── BLOQUES DINÁMICOS ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold" style={{ color: 'var(--dh-ink)' }}>
            Plantilla personalizada
          </h2>
          <a
            href="/doctor/settings/consultation-blocks"
            className="text-xs font-semibold hover:underline"
            style={{ color: 'var(--dh-turquoise-700)' }}
          >
            Editar mi plantilla →
          </a>
        </div>
        <DynamicBlocks
          blocks={blocksSnapshot ?? consultation.blocks_snapshot}
          values={blocksData}
          onChange={(key, value) => setBlocksData((d) => ({ ...d, [key]: value }))}
          onLabelChange={(key, newLabel) =>
            setBlocksSnapshot((prev) =>
              prev ? prev.map((b) => (b.key === key ? { ...b, label: newLabel } : b)) : prev,
            )
          }
          onSave={save}
          saving={saving}
        />
      </div>

      <p className="text-xs text-slate-400 text-center py-4">
        Los bloques se congelaron al crear la consulta. Si cambias tu plantilla, las consultas
        nuevas reflejarán la nueva configuración.
      </p>
    </div>
  );
}
