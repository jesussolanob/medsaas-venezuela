'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, CheckCircle2, AlertCircle, ChevronUp, ChevronDown, GripVertical, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type CatalogEntry = {
  key: string
  default_label: string
  default_content_type: string
  description: string | null
}

type BlockRow = {
  block_key: string
  default_label: string
  custom_label: string
  enabled: boolean
  sort_order: number
  printable: boolean | null
  send_to_patient: boolean | null
  content_type: string
}

export default function ConsultationBlocksConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<BlockRow[]>([])
  const [specialty, setSpecialty] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/doctor/consultation-blocks', { cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) {
      setMsg({ kind: 'err', text: j.error || 'Error al cargar' })
      setLoading(false)
      return
    }
    setSpecialty(j.doctor_specialty)

    const catalog: CatalogEntry[] = j.catalog || []
    const doctorCfg: any[] = j.doctor_config || []
    const specialtyDefaults: any[] = j.specialty_defaults || []
    const cfgMap = new Map(doctorCfg.map(c => [c.block_key, c]))
    const specialtyMap = new Map(specialtyDefaults.map(s => [s.block_key, s]))

    // Construir filas: una por cada entrada del catálogo.
    // Prioridad: config del doctor > defaults por especialidad > catálogo default.
    const merged: BlockRow[] = catalog.map(c => {
      const cfg = cfgMap.get(c.key)
      const spec = specialtyMap.get(c.key)
      // Si doctor ya configuró, usa su valor; sino, usa default de especialidad; sino, false.
      const enabled = cfg ? cfg.enabled : (spec ? spec.enabled : false)
      const sort_order = cfg?.sort_order ?? spec?.sort_order ?? 99
      return {
        block_key: c.key,
        default_label: c.default_label,
        custom_label: cfg?.custom_label || '',
        enabled,
        sort_order,
        printable: cfg?.printable ?? null,
        send_to_patient: cfg?.send_to_patient ?? null,
        content_type: c.default_content_type,
      }
    })

    // Orden inicial: primero los enabled por sort_order, luego los disabled
    merged.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return a.sort_order - b.sort_order
    })
    // Reasignar sort_order 0..N
    merged.forEach((r, i) => { r.sort_order = i })

    setRows(merged)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggle(key: string) {
    setRows(rs => rs.map(r => r.block_key === key ? { ...r, enabled: !r.enabled } : r))
  }
  function setLabel(key: string, label: string) {
    setRows(rs => rs.map(r => r.block_key === key ? { ...r, custom_label: label } : r))
  }
  function move(key: string, dir: -1 | 1) {
    setRows(rs => {
      const idx = rs.findIndex(r => r.block_key === key)
      if (idx < 0) return rs
      const tgt = idx + dir
      if (tgt < 0 || tgt >= rs.length) return rs
      const copy = [...rs]
      ;[copy[idx], copy[tgt]] = [copy[tgt], copy[idx]]
      copy.forEach((r, i) => { r.sort_order = i })
      return copy
    })
  }

  async function save() {
    setSaving(true); setMsg(null)
    try {
      // Solo enviamos los bloques que el doctor quiere incluir en su config.
      // Si todos están disabled, el API rechaza.
      const payload = rows.map(r => ({
        block_key: r.block_key,
        enabled: r.enabled,
        sort_order: r.sort_order,
        custom_label: r.custom_label || null,
        printable: r.printable,
        send_to_patient: r.send_to_patient,
      }))
      const r = await fetch('/api/doctor/consultation-blocks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: payload }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error al guardar')
      setMsg({ kind: 'ok', text: 'Configuración guardada' })
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const enabledCount = rows.filter(r => r.enabled).length

  if (loading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb / back */}
      <Link
        href="/doctor/templates"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a Plantillas
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bloques de consulta</h1>
        <p className="text-slate-500 text-sm mt-1">
          Configura qué secciones aparecen en tus consultas y cómo se llaman.
          {specialty && <> Tu especialidad: <strong>{specialty}</strong>.</>}
        </p>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
          msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {enabledCount} / {rows.length} bloques activos
          </p>
          <p className="text-xs text-slate-400">Arrastra para reordenar (o usa ↑↓)</p>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <div key={r.block_key} className={`px-5 py-4 flex items-center gap-4 ${!r.enabled ? 'opacity-50 bg-slate-50' : ''}`}>
              <GripVertical className="w-4 h-4 text-slate-300 cursor-grab shrink-0" />

              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => move(r.block_key, -1)} disabled={i === 0}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(r.block_key, 1)} disabled={i === rows.length - 1}
                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{r.default_label}</span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {r.block_key}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder={`Personalizar nombre (default: "${r.default_label}")`}
                  value={r.custom_label}
                  onChange={e => setLabel(r.block_key, e.target.value)}
                  disabled={!r.enabled}
                  className="w-full mt-1 px-2 py-1 text-sm border border-slate-200 rounded focus:border-teal-400 outline-none disabled:bg-slate-100"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={() => toggle(r.block_key)}
                  className="w-4 h-4 accent-teal-500"
                />
                <span className="text-sm text-slate-600">Activo</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <p className="text-xs text-slate-500">
          Los cambios solo afectan <strong>consultas futuras</strong>. Las consultas
          pasadas conservan la configuración con la que se crearon.
        </p>
        <button
          onClick={save}
          disabled={saving || enabledCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar configuración
        </button>
      </div>
    </div>
  )
}
