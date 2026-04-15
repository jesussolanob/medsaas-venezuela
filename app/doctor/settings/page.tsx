'use client'

import { useState, useEffect, useRef } from 'react'
import { User, Users2, Shield, Plus, X, CheckCircle, ToggleLeft, ToggleRight, Link2, Copy, Check, ExternalLink, Save as SaveIcon, Camera, Loader2, Building, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Module = { id: string; label: string; description: string; enabled: boolean }
type Assistant = { id: string; name: string; email: string; modules: Record<string, boolean>; created_at: string }

const ESPECIALIDADES = [
  'Medicina General','Cardiología','Dermatología','Endocrinología','Gastroenterología',
  'Ginecología','Hematología','Infectología','Medicina Interna','Nefrología',
  'Neumología','Neurología','Oftalmología','Oncología','Ortopedia y Traumatología',
  'Otorrinolaringología','Pediatría','Psicología','Psiquiatría','Reumatología','Urología',
  'Cirugía General','Cirugía Plástica','Medicina de Emergencia','Radiología','Otra',
]

const ALL_MODULES: Module[] = [
  { id: 'patients', label: 'Pacientes', description: 'Ver y gestionar pacientes', enabled: true },
  { id: 'agenda', label: 'Agenda', description: 'Ver y editar citas', enabled: true },
  { id: 'ehr', label: 'Historial Clínico', description: 'Ver expedientes y consultas', enabled: true },
  { id: 'crm', label: 'CRM Leads', description: 'Ver leads de WhatsApp', enabled: true },
  { id: 'reminders', label: 'Recordatorios', description: 'Enviar notificaciones', enabled: true },
  { id: 'finances_income', label: 'Finanzas — Ingresos', description: 'Ver ingresos del consultorio', enabled: false },
  { id: 'finances_expenses', label: 'Finanzas — Gastos', description: 'Registrar gastos del consultorio', enabled: true },
  { id: 'invitations', label: 'Invitaciones', description: 'Enviar links de booking', enabled: true },
  { id: 'billing', label: 'Facturación', description: 'Emitir recibos y presupuestos', enabled: true },
]

export default function DoctorSettingsPage() {
  const [profile, setProfile] = useState({ full_name: '', email: '', phone: '', specialty: '' })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'profile' | 'assistants' | 'booking' | 'payment' | 'insurance' | 'integrations'>('profile')
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [whatsappToken, setWhatsappToken] = useState('')
  const [whatsappPhoneId, setWhatsappPhoneId] = useState('')
  const [googleToken, setGoogleToken] = useState('')
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['pago_movil', 'transferencia'])

  // Insurance state
  const [insurances, setInsurances] = useState<{ name: string; credit_days: number; notes: string }[]>([])
  const [showNewInsurance, setShowNewInsurance] = useState(false)
  const [newInsurance, setNewInsurance] = useState({ name: '', credit_days: 30, notes: '' })

  // Assistant state
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [showNewAssistant, setShowNewAssistant] = useState(false)
  const [newAss, setNewAss] = useState({ name: '', email: '' })
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null)
  const [assError, setAssError] = useState('')

  // Booking link copy
  const [copied, setCopied] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const publicLink = doctorId ? `${baseUrl}/book/${doctorId}` : ''

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setDoctorId(user.id)
      const { data } = await supabase.from('profiles').select('full_name, email, phone, specialty, avatar_url, whatsapp_token, whatsapp_phone_id, google_refresh_token').eq('id', user.id).single()
      if (data) {
        setProfile({ full_name: data.full_name ?? '', email: data.email ?? '', phone: data.phone ?? '', specialty: data.specialty ?? '' })
        setAvatarUrl(data.avatar_url ?? null)
        setWhatsappToken(data.whatsapp_token ?? '')
        setWhatsappPhoneId(data.whatsapp_phone_id ?? '')
        setGoogleToken(data.google_refresh_token ? '••••••••••' : '')
      }
      setLoading(false)
    })
  }, [])

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !doctorId) return
    setUploadingPhoto(true)
    setUploadError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `avatars/${doctorId}.${ext}`
    let { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })

    // Si falla por bucket inexistente, intentar crear el bucket
    if (uploadErr && uploadErr.message?.toLowerCase().includes('bucket')) {
      try {
        await supabase.storage.createBucket('avatars', { public: true })
        const retry = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
        uploadErr = retry.error
      } catch (createErr) {
        uploadErr = { message: 'No se pudo crear el bucket avatars. Contacta al administrador.' } as any
      }
    }

    if (uploadErr) {
      setUploadError('No se pudo subir la foto. Intenta de nuevo o contacta al administrador.')
    } else {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = urlData.publicUrl
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', doctorId)
      setAvatarUrl(url + '?t=' + Date.now())
    }
    setUploadingPhoto(false)
  }

  function togglePaymentMethod(method: string) {
    setPaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    )
  }

  function addInsurance(e: React.FormEvent) {
    e.preventDefault()
    if (!newInsurance.name.trim()) return
    setInsurances(prev => [...prev, { ...newInsurance }])
    setNewInsurance({ name: '', credit_days: 30, notes: '' })
    setShowNewInsurance(false)
  }

  function removeInsurance(idx: number) {
    setInsurances(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveProfile() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ full_name: profile.full_name, phone: profile.phone, specialty: profile.specialty }).eq('id', user.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function saveIntegrations() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setIntegrationsLoading(true)
    await supabase.from('profiles').update({
      whatsapp_token: whatsappToken || null,
      whatsapp_phone_id: whatsappPhoneId || null,
    }).eq('id', user.id)
    setIntegrationsLoading(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function createAssistant(e: React.FormEvent) {
    e.preventDefault()
    if (!newAss.name.trim() || !newAss.email.trim()) { setAssError('Nombre y email son obligatorios'); return }
    const defaultModules: Record<string, boolean> = {}
    ALL_MODULES.forEach(m => { defaultModules[m.id] = m.enabled })
    const assistant: Assistant = { id: Date.now().toString(), name: newAss.name, email: newAss.email, modules: defaultModules, created_at: new Date().toISOString() }
    setAssistants(prev => [...prev, assistant])
    setNewAss({ name: '', email: '' })
    setShowNewAssistant(false)
    setAssError('')
  }

  function toggleAssistantModule(assId: string, moduleId: string) {
    setAssistants(prev => prev.map(a => a.id === assId ? { ...a, modules: { ...a.modules, [moduleId]: !a.modules[moduleId] } } : a))
    if (selectedAssistant?.id === assId) setSelectedAssistant(prev => prev ? { ...prev, modules: { ...prev.modules, [moduleId]: !prev.modules[moduleId] } } : null)
  }

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'profile', label: 'Mi perfil' },
    { id: 'booking', label: 'Link público' },
    { id: 'payment', label: 'Métodos de pago' },
    { id: 'insurance', label: 'Seguros' },
    { id: 'assistants', label: 'Asistentes' },
  ]

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Configuración</h1>
          <p className="text-sm text-slate-500">Perfil, planes de consulta, link de booking y asistentes</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {[
            { id: 'profile', label: 'Mi perfil' },
            { id: 'booking', label: 'Link público' },
            { id: 'payment', label: 'Métodos de pago' },
            { id: 'insurance', label: 'Seguros' },
            { id: 'assistants', label: 'Asistentes' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* PROFILE TAB */}
        {tab === 'profile' && (
          <div className="space-y-4">
            {/* Foto de perfil */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-4">Foto de perfil</p>
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-8 h-8 text-slate-300" />
                    )}
                  </div>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Esta foto aparece en tu página pública de booking.</p>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadPhoto} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                    <Camera className="w-3.5 h-3.5" />{uploadingPhoto ? 'Subiendo...' : 'Cambiar foto'}
                  </button>
                  <p className="text-[10px] text-slate-400">JPG, PNG o WEBP · Máx. 2MB</p>
                </div>
              </div>
              {uploadError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-700">{uploadError}</p>
                </div>
              )}
            </div>

            {/* Datos del perfil */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center"><User className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="font-bold text-slate-900">{profile.full_name || 'Tu perfil'}</p>
                  <p className="text-xs text-slate-400">{profile.email}</p>
                </div>
              </div>
              {loading ? <div className="text-slate-400 text-sm py-4">Cargando...</div> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre completo</label>
                      <input value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} className={fi} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                      <input value={profile.email} disabled className={fi + ' opacity-50 cursor-not-allowed'} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                      <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+58 412 000 0000" className={fi} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Especialidad</label>
                      <select value={profile.specialty} onChange={e => setProfile(p => ({ ...p, specialty: e.target.value }))} className={fi}>
                        <option value="">Seleccionar especialidad...</option>
                        {ESPECIALIDADES.map(esp => <option key={esp} value={esp}>{esp}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={saveProfile} className="flex items-center gap-2 g-bg px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90">
                    {saved ? <><CheckCircle className="w-4 h-4" />Guardado</> : <><SaveIcon className="w-4 h-4" />Guardar cambios</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BOOKING LINK TAB */}
        {tab === 'booking' && (
          <div className="space-y-4">
            <div className="g-bg rounded-xl p-6 text-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Link2 className="w-6 h-6 text-white" /></div>
                <div className="flex-1">
                  <p className="font-bold text-lg">Tu link público de booking</p>
                  <p className="text-sm text-white/70 mt-0.5">Compártelo en redes, tarjetas de presentación o por WhatsApp. Nunca vence.</p>
                  <div className="mt-4 bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                    <p className="text-sm font-mono flex-1 truncate text-white/90">{publicLink || 'Cargando...'}</p>
                    <button onClick={() => { navigator.clipboard.writeText(publicLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                      className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                      {copied ? <><Check className="w-3.5 h-3.5" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => window.open(publicLink, '_blank')}
                className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-teal-300 hover:shadow-sm transition-all flex items-center gap-3">
                <ExternalLink className="w-5 h-5 text-teal-500 shrink-0" />
                <div><p className="text-sm font-semibold text-slate-800">Ver mi página</p><p className="text-xs text-slate-400">Cómo la ve el paciente</p></div>
              </button>
              <button onClick={() => { const msg = encodeURIComponent(`Puedes agendar tu consulta conmigo en:\n\n${publicLink}`); window.open(`https://wa.me/?text=${msg}`, '_blank') }}
                className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-emerald-300 hover:shadow-sm transition-all flex items-center gap-3">
                <span className="text-emerald-500 font-bold text-sm shrink-0">WA</span>
                <div><p className="text-sm font-semibold text-slate-800">Compartir por WhatsApp</p><p className="text-xs text-slate-400">Enviar a cualquier contacto</p></div>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">¿Qué ve el paciente?</p>
              <div className="space-y-2">
                {['Tu nombre y especialidad', 'Los planes de consulta con precios', 'Calendario de disponibilidad (3 semanas)', 'Formulario para registrar sus datos'].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm text-slate-600"><CheckCircle className="w-4 h-4 text-teal-500 shrink-0" />{item}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PAYMENT METHODS TAB */}
        {tab === 'payment' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-4">Métodos de pago aceptados</p>
              <p className="text-xs text-slate-500 mb-4">Los pacientes verán estas opciones al agendar</p>

              <div className="space-y-3">
                {[
                  { id: 'cash_usd', label: '💵 Efectivo USD' },
                  { id: 'cash_bs', label: '💵 Efectivo Bs' },
                  { id: 'pago_movil', label: '📱 Pago Móvil' },
                  { id: 'transferencia', label: '🏦 Transferencia' },
                  { id: 'zelle', label: '💳 Zelle' },
                  { id: 'binance', label: '₿ Binance' },
                  { id: 'pos', label: '🛒 Punto de venta' },
                ].map(method => (
                  <label key={method.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={paymentMethods.includes(method.id)}
                      onChange={() => togglePaymentMethod(method.id)}
                      className="w-5 h-5 rounded border-slate-300 text-teal-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-700">{method.label}</span>
                  </label>
                ))}
              </div>

              <button onClick={() => console.log('Save payment methods:', paymentMethods)} className="mt-6 flex items-center gap-2 g-bg px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90">
                <SaveIcon className="w-4 h-4" /> Guardar
              </button>
            </div>
          </div>
        )}

        {/* INSURANCE TAB */}
        {tab === 'insurance' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Seguros aceptados</p>
                  <p className="text-xs text-slate-500 mt-1">Configurar tarifa de crédito por asegurador</p>
                </div>
                <button onClick={() => setShowNewInsurance(true)} className="g-bg flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90">
                  <Plus className="w-3.5 h-3.5" /> Agregar seguro
                </button>
              </div>

              {showNewInsurance && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 space-y-3">
                  <form onSubmit={addInsurance} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del seguro</label>
                      <input
                        value={newInsurance.name}
                        onChange={e => setNewInsurance(p => ({ ...p, name: e.target.value }))}
                        placeholder="Ej: Seguros Mercantil"
                        className={fi}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Días de crédito</label>
                      <input
                        type="number"
                        min="0"
                        value={newInsurance.credit_days}
                        onChange={e => setNewInsurance(p => ({ ...p, credit_days: parseInt(e.target.value) || 0 }))}
                        className={fi}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
                      <textarea
                        value={newInsurance.notes}
                        onChange={e => setNewInsurance(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Ej: Requiere autorización previa"
                        rows={2}
                        className={fi + ' resize-none'}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowNewInsurance(false)} className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        Cancelar
                      </button>
                      <button type="submit" className="flex-1 g-bg py-2 rounded-lg text-xs font-bold text-white">
                        Agregar
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {insurances.length === 0 ? (
                <div className="py-12 text-center">
                  <Building className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Sin seguros configurados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {insurances.map((ins, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-800">{ins.name}</p>
                        <p className="text-xs text-slate-500 mt-1">Plazo: {ins.credit_days} días</p>
                        {ins.notes && <p className="text-xs text-slate-600 mt-1 italic">{ins.notes}</p>}
                      </div>
                      <button
                        onClick={() => removeInsurance(idx)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ASSISTANTS TAB */}
        {tab === 'assistants' && (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
              <Shield className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
              <p className="text-sm text-teal-700">Los <strong>asistentes</strong> pueden acceder a tu panel con los módulos que configures.</p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowNewAssistant(true)} className="g-bg flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90">
                <Plus className="w-4 h-4" /> Agregar asistente
              </button>
            </div>

            {showNewAssistant && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Nuevo asistente</p>
                  <button onClick={() => setShowNewAssistant(false)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                {assError && <p className="text-sm text-red-600">{assError}</p>}
                <form onSubmit={createAssistant} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label><input value={newAss.name} onChange={e => setNewAss(p => ({ ...p, name: e.target.value }))} placeholder="Ana González" className={fi} /></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Email</label><input type="email" value={newAss.email} onChange={e => setNewAss(p => ({ ...p, email: e.target.value }))} placeholder="asistente@email.com" className={fi} /></div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowNewAssistant(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500">Cancelar</button>
                    <button type="submit" className="flex-1 g-bg py-2 rounded-xl text-xs font-bold text-white">Crear asistente</button>
                  </div>
                </form>
              </div>
            )}

            {assistants.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
                <Users2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-semibold text-sm">Sin asistentes aún</p>
              </div>
            ) : (
              assistants.map(ass => (
                <div key={ass.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedAssistant(selectedAssistant?.id === ass.id ? null : ass)}>
                    <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center"><span className="text-violet-600 font-bold text-sm">{ass.name.charAt(0)}</span></div>
                    <div className="flex-1"><p className="text-sm font-semibold text-slate-800">{ass.name}</p><p className="text-xs text-slate-400">{ass.email}</p></div>
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">Asistente</span>
                  </div>
                  {selectedAssistant?.id === ass.id && (
                    <div className="p-5 space-y-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Módulos activos</p>
                      {ALL_MODULES.map(mod => (
                        <div key={mod.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                          <div><p className="text-sm font-semibold text-slate-800">{mod.label}</p><p className="text-xs text-slate-400">{mod.description}</p></div>
                          <button onClick={() => toggleAssistantModule(ass.id, mod.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${ass.modules[mod.id] ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {ass.modules[mod.id] ? <><ToggleRight className="w-4 h-4" />Activo</> : <><ToggleLeft className="w-4 h-4" />Inactivo</>}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* INTEGRATIONS TAB */}
        {tab === 'integrations' && (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
              <Shield className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
              <p className="text-sm text-teal-700">Conecta herramientas externas para sincronizar tu agenda y enviar mensajes automáticos.</p>
            </div>

            {/* Google Calendar */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-600 text-sm font-bold">GC</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Google Calendar</p>
                      <p className="text-xs text-slate-500">Sincroniza tus citas con Google Calendar</p>
                    </div>
                  </div>
                </div>
                {googleToken ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Conectado</span>
                ) : (
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">No conectado</span>
                )}
              </div>
              {googleToken && (
                <p className="text-xs text-slate-500 italic">Tu Google Calendar está conectado. Las citas se sincronizarán automáticamente.</p>
              )}
              <button
                onClick={() => window.open('/api/integrations/google/auth', '_blank')}
                className="w-full px-4 py-2.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors"
              >
                {googleToken ? 'Reconectar Google Calendar' : 'Conectar Google Calendar'}
              </button>
            </div>

            {/* WhatsApp Business */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <span className="text-emerald-600 text-sm font-bold">WA</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">WhatsApp Business API</p>
                      <p className="text-xs text-slate-500">Envía confirmaciones y recordatorios de citas</p>
                    </div>
                  </div>
                </div>
                {whatsappToken ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Conectado</span>
                ) : (
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">No conectado</span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Token de API de Meta</label>
                  <input
                    type="password"
                    value={whatsappToken}
                    onChange={e => setWhatsappToken(e.target.value)}
                    placeholder="Obtén tu token en https://developers.facebook.com"
                    className={fi}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Mantén esto seguro. No lo compartas con nadie.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">ID del Número de Teléfono</label>
                  <input
                    type="text"
                    value={whatsappPhoneId}
                    onChange={e => setWhatsappPhoneId(e.target.value)}
                    placeholder="Ej: 123456789012345"
                    className={fi}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">ID del número de WhatsApp Business asociado</p>
                </div>
              </div>

              <button
                onClick={saveIntegrations}
                disabled={integrationsLoading || (!whatsappToken && !whatsappPhoneId)}
                className="w-full px-4 py-2.5 g-bg text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {integrationsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" /> Guardar credenciales
                  </>
                )}
              </button>
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <p className="text-sm text-blue-700">
                <strong>¿Necesitas ayuda?</strong> Consulta nuestra documentación sobre cómo integrar WhatsApp Business API en{' '}
                <a href="https://developers.facebook.com/docs/whatsapp/cloud-api" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  Meta Developers
                </a>.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
