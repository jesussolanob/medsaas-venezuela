'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2, Save, CheckCircle2, AlertCircle, User, Calendar } from 'lucide-react'
import DynamicBlocks, { SnapshotBlock } from '@/components/consultation/DynamicBlocks'

type Consultation = {
  id: string
  consultation_code: string
  consultation_date: string
  chief_complaint: string | null
  payment_status: string
  plan_name: string | null
  amount: number | null
  blocks_snapshot: SnapshotBlock[] | null
  blocks_data: Record<string, unknown> | null
  patient_id: string
  status?: string
  appointment_id?: string | null
}

type Patient = { id: string; full_name: string; email: string | null; phone: string | null; cedula: string | null }

export default function ConsultationDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [consultation, setConsultation] = useState<Consultation | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [blocksData, setBlocksData] = useState<Record<string, unknown>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: c, error } = await supabase
        .from('consultations')
        .select('id, consultation_code, consultation_date, chief_complaint, payment_status, plan_name, amount, blocks_snapshot, blocks_data, patient_id, started_at, ended_at, status, appointment_id')
        .eq('id', params.id)
        .single()

      if (error || !c) {
        setMsg({ kind: 'err', text: 'Consulta no encontrada' })
        setLoading(false)
        return
      }

      // BUG-9 FIX: si el snapshot está vacío o desactualizado, resolver en vivo
      // los bloques desde la config actual del doctor.
      let snapshot = c.blocks_snapshot
      if (!snapshot || (Array.isArray(snapshot) && snapshot.length === 0)) {
        try {
          const r = await fetch('/api/doctor/consultation-blocks', { cache: 'no-store' })
          if (r.ok) {
            const j = await r.json()
            // resolved viene de /api/doctor/consultation-blocks
            snapshot = (j.resolved || []).filter((b: any) => b.enabled)
          }
        } catch (e) {
          console.warn('[Consultation] failed to resolve blocks live:', e)
        }
      }

      setConsultation({ ...(c as Consultation), blocks_snapshot: snapshot })
      setBlocksData(c.blocks_data || {})

      // ⏱ Auto-tracking: setear started_at la primera vez que el doctor abre la consulta
      // (Opción C aprobada: sin botón explícito, al abrir la página se inicia el cronómetro)
      if (!c.started_at && c.status !== 'completed' && c.status !== 'no_show') {
        await supabase
          .from('consultations')
          .update({ started_at: new Date().toISOString() })
          .eq('id', params.id)
      }

      // Cargar paciente
      if (c.patient_id) {
        const { data: p } = await supabase
          .from('patients')
          .select('id, full_name, email, phone, cedula')
          .eq('id', c.patient_id)
          .single()
        setPatient(p as Patient)
      }

      setLoading(false)
    }
    load()
  }, [params.id])

  // Detecta si los bloques tienen contenido real (no vacíos)
  function hasRealContent(data: Record<string, any>): boolean {
    return Object.values(data || {}).some((v) => {
      if (v == null) return false
      if (typeof v === 'string') return v.trim().length > 0
      if (Array.isArray(v)) return v.length > 0
      if (typeof v === 'object') return Object.keys(v).length > 0
      return Boolean(v)
    })
  }

  async function save() {
    if (!consultation) return
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/doctor/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: consultation.id,
          blocks_data: blocksData,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error al guardar')

      // ⏱ Auto-tracking + auto-status:
      //  - ended_at se actualiza siempre (último guardado = fin de la consulta)
      //  - status pasa a 'completed' si los bloques tienen contenido real
      //    (= el doctor llenó al menos 1 bloque, ya la atendió formalmente)
      try {
        const supabase = createClient()
        const updates: Record<string, unknown> = { ended_at: new Date().toISOString() }
        if (hasRealContent(blocksData) && consultation.status !== 'completed') {
          updates.status = 'completed'
          updates.consultation_date = consultation.consultation_date || new Date().toISOString()
        }
        await supabase
          .from('consultations')
          .update(updates)
          .eq('id', consultation.id)

        // Refresh local state
        if (updates.status === 'completed') {
          setConsultation({ ...consultation, status: 'completed' })
        }
      } catch { /* no-bloqueante */ }

      setMsg({ kind: 'ok', text: 'Cambios guardados' })
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
  )

  if (!consultation) return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">Consulta no encontrada</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
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
              {new Date(consultation.consultation_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}
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
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado de la consulta</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            disabled={consultation.status === 'completed'}
            onClick={async () => {
              const supabase = createClient()
              await supabase.from('consultations').update({
                status: 'completed',
                ended_at: new Date().toISOString(),
              }).eq('id', consultation.id)
              if (consultation.appointment_id) {
                await supabase.from('appointments').update({ status: 'completed' as any }).eq('id', consultation.appointment_id)
              }
              setConsultation({ ...consultation, status: 'completed' })
              setMsg({ kind: 'ok', text: 'Consulta marcada como atendida' })
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
              consultation.status === 'completed'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" /> {consultation.status === 'completed' ? 'Atendida ✓' : 'Marcar como atendida'}
          </button>
          <button
            disabled={consultation.status === 'no_show'}
            onClick={async () => {
              const supabase = createClient()
              await supabase.from('consultations').update({ status: 'no_show' }).eq('id', consultation.id)
              if (consultation.appointment_id) {
                await supabase.from('appointments').update({ status: 'no_show' as any }).eq('id', consultation.appointment_id)
              }
              setConsultation({ ...consultation, status: 'no_show' })
              setMsg({ kind: 'ok', text: 'Marcada como No asistió' })
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
            Estado actual: <strong className="text-slate-700">{
              consultation.status === 'completed' ? 'Atendida'
              : consultation.status === 'no_show' ? 'No asistió'
              : consultation.status === 'in_progress' ? 'En curso'
              : 'Pendiente'
            }</strong>
          </span>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Estado del pago</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              disabled={consultation.payment_status === 'approved'}
              onClick={async () => {
                const supabase = createClient()
                await supabase.from('consultations').update({ payment_status: 'approved' }).eq('id', consultation.id)
                // sync con payments table si existe
                if (consultation.appointment_id) {
                  const { data: appt } = await supabase.from('appointments').select('payment_id').eq('id', consultation.appointment_id).single()
                  if (appt?.payment_id) {
                    await supabase.from('payments').update({ status: 'approved', paid_at: new Date().toISOString() }).eq('id', appt.payment_id)
                  }
                }
                setConsultation({ ...consultation, payment_status: 'approved' })
                setMsg({ kind: 'ok', text: 'Pago aprobado' })
              }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                consultation.payment_status === 'approved'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default'
                  : 'bg-teal-500 hover:bg-teal-600 text-white border-teal-500'
              }`}
            >
              {consultation.payment_status === 'approved' ? 'Pago aprobado ✓' : '💵 Marcar pago como aprobado'}
            </button>
            <span className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs text-slate-500 bg-slate-50 border border-slate-200">
              Estado actual: <strong className="text-slate-700">{
                consultation.payment_status === 'approved' ? 'Aprobado' : 'Pendiente'
              }</strong>
            </span>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
          msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Motivo de consulta (si existe) */}
      {consultation.chief_complaint && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Motivo de consulta</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{consultation.chief_complaint}</p>
        </div>
      )}

      {/* ── BLOQUES DINÁMICOS ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Plantilla personalizada</h2>
          <a href="/doctor/settings/consultation-blocks" className="text-xs text-teal-600 hover:underline">
            Editar mi plantilla →
          </a>
        </div>
        <DynamicBlocks
          blocks={consultation.blocks_snapshot}
          values={blocksData}
          onChange={(key, value) => setBlocksData(d => ({ ...d, [key]: value }))}
          onSave={save}
          saving={saving}
        />
      </div>

      <p className="text-xs text-slate-400 text-center py-4">
        Los bloques se congelaron al crear la consulta. Si cambias tu plantilla, las consultas
        nuevas reflejarán la nueva configuración.
      </p>
    </div>
  )
}
