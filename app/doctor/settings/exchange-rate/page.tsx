'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2, Save, CheckCircle2, AlertCircle, DollarSign, Euro, Edit3, RefreshCw } from 'lucide-react'

type Mode = 'usd_bcv' | 'eur_bcv' | 'custom'

export default function ExchangeRateSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [mode, setMode] = useState<Mode>('usd_bcv')
  const [customRate, setCustomRate] = useState<string>('')
  const [customLabel, setCustomLabel] = useState<string>('')
  const [previewRate, setPreviewRate] = useState<number | null>(null)
  const [previewSource, setPreviewSource] = useState<string>('')

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('profiles')
      .select('currency_mode, custom_rate, custom_rate_label')
      .eq('id', user.id)
      .single()
    if (data) {
      setMode((data.currency_mode as Mode) || 'usd_bcv')
      setCustomRate(data.custom_rate != null ? String(data.custom_rate) : '')
      setCustomLabel(data.custom_rate_label || '')
    }
    setLoading(false)
  }

  async function loadPreview(m: Mode) {
    setPreviewRate(null); setPreviewSource('')
    try {
      const r = await fetch('/api/doctor/exchange-rate', { cache: 'no-store' })
      const j = await r.json()
      if (j.rate && j.rate > 0) {
        setPreviewRate(j.rate)
        setPreviewSource(j.label || '')
      }
    } catch {}
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (!loading) loadPreview(mode) }, [mode, loading])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      if (mode === 'custom') {
        const n = Number(customRate)
        if (!Number.isFinite(n) || n <= 0) throw new Error('Ingresa un valor válido para la tasa personalizada')
      }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { error } = await supabase.from('profiles').update({
        currency_mode: mode,
        custom_rate: mode === 'custom' ? Number(customRate) : null,
        custom_rate_label: mode === 'custom' ? (customLabel || null) : null,
      }).eq('id', user.id)
      if (error) throw error

      setMsg({ kind: 'ok', text: 'Configuración guardada' })
      loadPreview(mode)
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message || 'Error al guardar' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link href="/doctor/settings" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium">
        <ArrowLeft className="w-4 h-4" /> Volver a Configuración
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tasa de cambio</h1>
        <p className="text-slate-500 text-sm mt-1">
          Elige qué tasa usar para convertir tus precios USD/EUR a bolívares en citas, facturas y reportes.
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

      {/* Selector de modo */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Modo de conversión</p>

        <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${mode === 'usd_bcv' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
          <input type="radio" name="mode" checked={mode === 'usd_bcv'} onChange={() => setMode('usd_bcv')} className="mt-0.5 accent-teal-500" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-slate-900">Tasa BCV Oficial — USD</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">RECOMENDADO</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Se actualiza automáticamente desde el Banco Central de Venezuela. Tus precios en USD se convierten a Bs usando la tasa oficial.
            </p>
          </div>
        </label>

        <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${mode === 'eur_bcv' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
          <input type="radio" name="mode" checked={mode === 'eur_bcv'} onChange={() => setMode('eur_bcv')} className="mt-0.5 accent-teal-500" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Euro className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-slate-900">Tasa BCV Oficial — EUR</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Útil si cobras en euros. Se usa la tasa oficial EUR → BsS del BCV.
            </p>
          </div>
        </label>

        <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${mode === 'custom' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
          <input type="radio" name="mode" checked={mode === 'custom'} onChange={() => setMode('custom')} className="mt-0.5 accent-teal-500" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-slate-900">Tasa personalizada</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Define tú mismo la tasa (útil si usas tasa paralela o una tasa específica de tu clínica). No se actualiza automáticamente.
            </p>
            {mode === 'custom' && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Tasa (1 unidad → Bs)</label>
                  <input type="number" step="0.0001" min="0"
                    value={customRate} onChange={e => setCustomRate(e.target.value)}
                    placeholder="Ej: 43.50"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Etiqueta (opcional)</label>
                  <input type="text" maxLength={40}
                    value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                    placeholder="Ej: Tasa clínica · paralelo"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </label>
      </div>

      {/* Preview de la tasa */}
      <div className="bg-slate-50 rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tasa que se aplicará</p>
          {previewRate ? (
            <>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {previewRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} Bs
              </p>
              <p className="text-xs text-slate-500 mt-1">{previewSource}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400 mt-2">—</p>
          )}
        </div>
        <button onClick={() => loadPreview(mode)} className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:bg-white text-slate-700 text-sm font-semibold rounded-lg">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 shadow-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar configuración
        </button>
      </div>
    </div>
  )
}
