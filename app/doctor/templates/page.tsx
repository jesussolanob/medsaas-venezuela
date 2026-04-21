'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileEdit, Upload, X, Save, Loader2, CheckCircle,
  FileText, Pill, ClipboardList, Bed, Eye, Type, Image as ImageIcon
} from 'lucide-react'

type TemplateType = 'informe' | 'recipe' | 'prescripciones' | 'reposo'

type TemplateConfig = {
  logo_url: string | null
  signature_url: string | null
  font_family: string
  header_text: string
  footer_text: string
  show_logo: boolean
  show_signature: boolean
  primary_color: string
}

const DEFAULT_CONFIG: TemplateConfig = {
  logo_url: null,
  signature_url: null,
  font_family: 'Inter',
  header_text: '',
  footer_text: '',
  show_logo: true,
  show_signature: true,
  primary_color: '#0891b2',
}

const TEMPLATE_TABS: { key: TemplateType; label: string; icon: any; description: string }[] = [
  { key: 'informe', label: 'Informe', icon: FileText, description: 'Informe médico completo con diagnóstico y tratamiento' },
  { key: 'recipe', label: 'Recipe', icon: Pill, description: 'Receta médica con medicamentos y dosis' },
  { key: 'prescripciones', label: 'Prescripciones', icon: ClipboardList, description: 'Órdenes de exámenes de laboratorio e imágenes' },
  { key: 'reposo', label: 'Reposo Médico', icon: Bed, description: 'Constancia de reposo médico para el paciente' },
]

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (moderna)' },
  { value: 'Georgia', label: 'Georgia (clásica)' },
  { value: 'Times New Roman', label: 'Times New Roman (formal)' },
  { value: 'Arial', label: 'Arial (limpia)' },
  { value: 'Calibri', label: 'Calibri (profesional)' },
  { value: 'Palatino', label: 'Palatino (elegante)' },
]

const inp = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition-all focus:border-teal-400 bg-white'

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState<TemplateType>('informe')
  const [configs, setConfigs] = useState<Record<TemplateType, TemplateConfig>>({
    informe: { ...DEFAULT_CONFIG },
    recipe: { ...DEFAULT_CONFIG },
    prescripciones: { ...DEFAULT_CONFIG },
    reposo: { ...DEFAULT_CONFIG },
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingSignature, setUploadingSignature] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [doctorName, setDoctorName] = useState('')
  const [doctorSpecialty, setDoctorSpecialty] = useState('')
  const logoRef = useRef<HTMLInputElement>(null)
  const signatureRef = useRef<HTMLInputElement>(null)

  const config = configs[activeTab]

  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load doctor profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, specialty')
      .eq('id', user.id)
      .single()
    if (profile) {
      setDoctorName(profile.full_name || '')
      setDoctorSpecialty(profile.specialty || '')
    }

    // Load saved templates
    const { data } = await supabase
      .from('doctor_templates')
      .select('*')
      .eq('doctor_id', user.id)

    if (data && data.length > 0) {
      const loaded = { ...configs }
      data.forEach((t: any) => {
        if (loaded[t.template_type as TemplateType]) {
          loaded[t.template_type as TemplateType] = {
            logo_url: t.logo_url,
            signature_url: t.signature_url,
            font_family: t.font_family || 'Inter',
            header_text: t.header_text || '',
            footer_text: t.footer_text || '',
            show_logo: t.show_logo !== false,
            show_signature: t.show_signature !== false,
            primary_color: t.primary_color || '#0891b2',
          }
        }
      })
      setConfigs(loaded)
    }

    setLoading(false)
  }

  function updateConfig(field: keyof TemplateConfig, value: any) {
    setConfigs(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value }
    }))
  }

  async function uploadFile(file: File, type: 'logo' | 'signature') {
    if (type === 'logo') setUploadingLogo(true)
    else setUploadingSignature(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const ext = file.name.split('.').pop()
      const path = `templates/${user.id}/${type}_${activeTab}_${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from('payment-receipts')
        .upload(path, file, { upsert: true })

      if (error) throw error

      const { data: publicUrl } = supabase.storage
        .from('payment-receipts')
        .getPublicUrl(path)

      if (type === 'logo') {
        updateConfig('logo_url', publicUrl.publicUrl)
      } else {
        updateConfig('signature_url', publicUrl.publicUrl)
      }
    } catch (err) {
      console.error(`Error uploading ${type}:`, err)
      alert(`Error al subir ${type === 'logo' ? 'logo' : 'firma'}`)
    } finally {
      if (type === 'logo') setUploadingLogo(false)
      else setUploadingSignature(false)
    }
  }

  async function saveTemplate() {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const payload = {
        doctor_id: user.id,
        template_type: activeTab,
        logo_url: config.logo_url,
        signature_url: config.signature_url,
        font_family: config.font_family,
        header_text: config.header_text,
        footer_text: config.footer_text,
        show_logo: config.show_logo,
        show_signature: config.show_signature,
        primary_color: config.primary_color,
      }

      // Upsert: update if exists, insert if not
      const { data: existing } = await supabase
        .from('doctor_templates')
        .select('id')
        .eq('doctor_id', user.id)
        .eq('template_type', activeTab)
        .maybeSingle()

      if (existing) {
        await supabase.from('doctor_templates').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('doctor_templates').insert(payload)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Error saving template:', err)
      alert('Error al guardar plantilla')
    } finally {
      setSaving(false)
    }
  }

  async function applyToAll() {
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const currentConfig = configs[activeTab]
      const newConfigs = { ...configs }

      for (const tab of TEMPLATE_TABS) {
        newConfigs[tab.key] = { ...currentConfig }

        const payload = {
          doctor_id: user.id,
          template_type: tab.key,
          logo_url: currentConfig.logo_url,
          signature_url: currentConfig.signature_url,
          font_family: currentConfig.font_family,
          header_text: currentConfig.header_text,
          footer_text: currentConfig.footer_text,
          show_logo: currentConfig.show_logo,
          show_signature: currentConfig.show_signature,
          primary_color: currentConfig.primary_color,
        }

        const { data: existing } = await supabase
          .from('doctor_templates')
          .select('id')
          .eq('doctor_id', user.id)
          .eq('template_type', tab.key)
          .maybeSingle()

        if (existing) {
          await supabase.from('doctor_templates').update(payload).eq('id', existing.id)
        } else {
          await supabase.from('doctor_templates').insert(payload)
        }
      }

      setConfigs(newConfigs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Error applying to all:', err)
      alert('Error al aplicar a todas las plantillas')
    } finally {
      setSaving(false)
    }
  }

  const tabInfo = TEMPLATE_TABS.find(t => t.key === activeTab)!

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-900">Plantillas de documentos</h2>
          <p className="text-sm text-slate-500 mt-1">Personaliza el logo, firma, tipografía y colores de tus documentos médicos</p>
        </div>

        {/* Link a configuración de BLOQUES DE CONSULTA */}
        <a
          href="/doctor/settings/consultation-blocks"
          className="block p-4 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <FileEdit className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">Bloques de consulta (secciones del formulario)</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Decide qué secciones aparecen al hacer una consulta: prescripción, tareas, plan alimenticio, ejercicios, reposo, etc. Activa/desactiva y renombra según tu especialidad.
              </p>
            </div>
            <span className="text-teal-600 text-sm font-semibold">Configurar →</span>
          </div>
        </a>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TEMPLATE_TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-teal-500 text-white shadow-md'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Template description */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <tabInfo.icon className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">{tabInfo.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{tabInfo.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Configuration */}
          <div className="space-y-5">
            {/* Logo */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-bold text-slate-800">Logo</p>
                </div>
                <button
                  onClick={() => updateConfig('show_logo', !config.show_logo)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${
                    config.show_logo ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {config.show_logo ? 'Visible' : 'Oculto'}
                </button>
              </div>

              {config.logo_url ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={config.logo_url} alt="Logo" className="h-16 object-contain rounded-lg border border-slate-200" />
                  <button
                    onClick={() => updateConfig('logo_url', null)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 flex flex-col items-center gap-2 text-slate-400 hover:border-teal-400 hover:text-teal-500 transition-colors"
                >
                  {uploadingLogo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  <span className="text-xs font-medium">{uploadingLogo ? 'Subiendo...' : 'Subir logo (PNG, JPG)'}</span>
                </button>
              )}
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], 'logo') }}
              />
            </div>

            {/* Signature */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-bold text-slate-800">Firma digital</p>
                </div>
                <button
                  onClick={() => updateConfig('show_signature', !config.show_signature)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${
                    config.show_signature ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {config.show_signature ? 'Visible' : 'Oculta'}
                </button>
              </div>

              {config.signature_url ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={config.signature_url} alt="Firma" className="h-20 object-contain rounded-lg border border-slate-200 bg-white p-2" />
                  <button
                    onClick={() => updateConfig('signature_url', null)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => signatureRef.current?.click()}
                  disabled={uploadingSignature}
                  className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 flex flex-col items-center gap-2 text-slate-400 hover:border-teal-400 hover:text-teal-500 transition-colors"
                >
                  {uploadingSignature ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  <span className="text-xs font-medium">{uploadingSignature ? 'Subiendo...' : 'Subir firma (PNG con fondo transparente)'}</span>
                </button>
              )}
              <input
                ref={signatureRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], 'signature') }}
              />
            </div>

            {/* Typography & Color */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-bold text-slate-800">Tipografía y color</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Fuente</label>
                <select
                  value={config.font_family}
                  onChange={e => updateConfig('font_family', e.target.value)}
                  className={inp}
                >
                  {FONT_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Color principal</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={config.primary_color}
                    onChange={e => updateConfig('primary_color', e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={config.primary_color}
                    onChange={e => updateConfig('primary_color', e.target.value)}
                    className={inp + ' flex-1'}
                    placeholder="#0891b2"
                  />
                </div>
              </div>
            </div>

            {/* Header & Footer text */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-bold text-slate-800">Encabezado y pie</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Texto del encabezado</label>
                <input
                  value={config.header_text}
                  onChange={e => updateConfig('header_text', e.target.value)}
                  placeholder="Ej: Consultorio Dr. Pérez — Cardiología"
                  className={inp}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Texto del pie de página</label>
                <input
                  value={config.footer_text}
                  onChange={e => updateConfig('footer_text', e.target.value)}
                  placeholder="Ej: Av. Libertador, Torre Médica, Piso 3 — Tel: 0212-1234567"
                  className={inp}
                />
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex gap-3">
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {saved ? <><CheckCircle className="w-4 h-4" /> Guardado</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Guardar {tabInfo.label}</>}
              </button>
              <button
                onClick={applyToAll}
                disabled={saving}
                className="flex items-center justify-center gap-2 border border-slate-300 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Aplicar a todos
              </button>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700">Vista previa</p>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                <Eye className="w-3.5 h-3.5" />
                {showPreview ? 'Ocultar' : 'Mostrar'} PDF
              </button>
            </div>

            <div
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
              style={{ fontFamily: config.font_family }}
            >
              {/* Preview Header */}
              <div className="p-6 border-b-[3px]" style={{ borderColor: config.primary_color }}>
                <div className="flex items-start justify-between gap-4">
                  {config.show_logo && config.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.logo_url} alt="Logo" className="h-12 object-contain" />
                  )}
                  <div className={`${config.show_logo && config.logo_url ? 'text-right' : ''} flex-1`}>
                    <p className="text-base font-bold" style={{ color: config.primary_color }}>
                      {config.header_text || doctorName || 'Delta Medical'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{tabInfo.label}</p>
                  </div>
                </div>
              </div>

              {/* Preview Body */}
              <div className="p-6 space-y-4">
                <div className="flex gap-8 text-[10px] text-slate-500">
                  <div>
                    <span className="uppercase tracking-wider font-bold text-slate-400 block">Paciente</span>
                    <span className="font-semibold text-slate-700">Juan Pérez</span>
                  </div>
                  <div>
                    <span className="uppercase tracking-wider font-bold text-slate-400 block">Fecha</span>
                    <span className="font-semibold text-slate-700">{new Date().toLocaleDateString('es-VE')}</span>
                  </div>
                  <div>
                    <span className="uppercase tracking-wider font-bold text-slate-400 block">Código</span>
                    <span className="font-mono text-slate-700">CONS-001</span>
                  </div>
                </div>

                {/* Template-specific content */}
                {activeTab === 'informe' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: config.primary_color }}>Motivo de consulta</p>
                      <p className="text-xs text-slate-600">Dolor abdominal recurrente desde hace 2 semanas...</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: config.primary_color }}>Diagnóstico</p>
                      <p className="text-xs text-slate-600">Gastritis crónica con componente funcional</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: config.primary_color }}>Tratamiento</p>
                      <p className="text-xs text-slate-600">Omeprazol 20mg cada 12h por 14 días...</p>
                    </div>
                  </div>
                )}

                {activeTab === 'recipe' && (
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: config.primary_color }}>Medicamentos</p>
                    <div className="space-y-2">
                      {['Omeprazol 20mg — 1 cada 12h — 14 días', 'Metoclopramida 10mg — 1 antes de cada comida — 7 días'].map((med, i) => (
                        <div key={i} className="text-xs text-slate-600 pl-3 border-l-2" style={{ borderColor: config.primary_color }}>
                          {i + 1}. {med}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: config.primary_color }}>Indicaciones</p>
                      <p className="text-xs text-slate-600">Tomar con agua. Evitar alimentos irritantes.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'prescripciones' && (
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: config.primary_color }}>Exámenes solicitados</p>
                    <div className="space-y-2">
                      {['Hematología completa', 'Perfil hepático', 'Ecografía abdominal superior'].map((exam, i) => (
                        <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: config.primary_color }}>{i + 1}</span>
                          {exam}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'reposo' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600">
                      Quien suscribe, <strong>{doctorName || 'Dr. Nombre'}</strong>, {doctorSpecialty || 'Especialidad'}, hace constar que el/la paciente <strong>Juan Pérez</strong>, titular de la cédula de identidad V-12.345.678, amerita reposo médico por un período de <strong>3 días</strong>, desde el {new Date().toLocaleDateString('es-VE')} hasta el {new Date(Date.now() + 3 * 86400000).toLocaleDateString('es-VE')}.
                    </p>
                    <p className="text-xs text-slate-600">
                      Diagnóstico: <strong>Gastritis aguda</strong>
                    </p>
                    <p className="text-xs text-slate-400 mt-4">
                      Constancia que se expide a solicitud de la parte interesada.
                    </p>
                  </div>
                )}
              </div>

              {/* Preview Signature */}
              {config.show_signature && (
                <div className="px-6 pb-4">
                  <div className="border-t border-slate-100 pt-4 flex flex-col items-center gap-1">
                    {config.signature_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={config.signature_url} alt="Firma" className="h-12 object-contain" />
                    ) : (
                      <div className="h-12 w-32 border-b-2 border-slate-300" />
                    )}
                    <p className="text-[10px] font-semibold text-slate-700">{doctorName || 'Dr. Nombre'}</p>
                    <p className="text-[9px] text-slate-400">{doctorSpecialty || 'Especialidad'}</p>
                  </div>
                </div>
              )}

              {/* Preview Footer */}
              {config.footer_text && (
                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
                  <p className="text-[9px] text-slate-400 text-center">{config.footer_text}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
