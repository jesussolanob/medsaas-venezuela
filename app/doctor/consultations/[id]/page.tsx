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
        .select('id, consultation_code, consultation_date, chief_complaint, payment_status, plan_name, amount, blocks_snapshot, blocks_data, patient_id')
        .eq('id', params.id)
        .single()

      if (error || !c) {
        setMsg({ kind: 'err', text: 'Consulta no encontrada' })
        setLoading(false)
        return
      }

      setConsultation(c as Consultation)
      setBlocksData(c.blocks_data || {})

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
          <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {consultation.payment_status}
          </span>
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
