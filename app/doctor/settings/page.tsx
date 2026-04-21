'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getProfessionalTitle } from '@/lib/professional-title'
import {
  User, Users2, Shield, Plus, X, CheckCircle, ToggleLeft, ToggleRight,
  Link2, Copy, Check, ExternalLink, Save as SaveIcon, Camera, Loader2,
  Building, Trash2, Search, Tag, DollarSign, Bell, Volume2, VolumeX,
  Image as ImageIcon, FileBadge, Smartphone,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { VENEZUELA_INSURANCES } from './insurances'
import AvatarUploader from './avatar-uploader'

type PricingPlan = { id: string; name: string; price_usd: number; duration_minutes: number; sessions_count: number; is_active: boolean }
type Module = { id: string; label: string; description: string; enabled: boolean }
type Assistant = { id: string; name: string; email: string; modules: Record<string, boolean>; created_at: string }
type Insurance = { id?: string; name: string; credit_days: number; notes: string }
type Service = { id: string; name: string; price_usd: number; description: string; is_active: boolean }
type PaymentMethodData = {
  id: string
  label: string
  emoji: string
  fields: { key: string; label: string; placeholder?: string; type?: string }[]
}

const ESPECIALIDADES = [
  'Medicina General','Cardiología','Dermatología','Endocrinología','Gastroenterología',
  'Ginecología','Hematología','Infectología','Medicina Interna','Nefrología',
  'Neumología','Neurología','Oftalmología','Oncología','Ortopedia y Traumatología',
  'Otorrinolaringología','Pediatría','Psicología','Psiquiatría','Reumatología','Fisioterapia','Urología',
  'Cirugía General','Cirugía Plástica','Medicina de Emergencia','Radiología','Otra',
]

const PROFESSIONAL_TITLES = [
  { value: 'Dr.',  label: 'Doctor (Dr.)',       gender: 'M' },
  { value: 'Dra.', label: 'Doctora (Dra.)',     gender: 'F' },
  { value: 'Lic.', label: 'Licenciado/a (Lic.)', gender: 'N' },
  { value: 'Psic.', label: 'Psicólogo/a (Psic.)', gender: 'N' },
  { value: 'Odont.', label: 'Odontólogo/a (Odont.)', gender: 'N' },
  { value: 'Nutr.', label: 'Nutricionista (Nutr.)', gender: 'N' },
  { value: 'Fisio.', label: 'Fisioterapeuta (Fisio.)', gender: 'N' },
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

const PAYMENT_METHODS: PaymentMethodData[] = [
  { id: 'pago_movil', label: 'Pago Móvil', emoji: '📱', fields: [
    { key: 'bank', label: 'Banco', placeholder: 'Ej: Banesco' },
    { key: 'phone', label: 'Teléfono', placeholder: '0412-1234567' },
    { key: 'id_number', label: 'Cédula/RIF', placeholder: 'V-12345678' },
    { key: 'holder', label: 'Titular', placeholder: 'Dr. Carlos Ramírez' },
  ]},
  { id: 'transferencia', label: 'Transferencia', emoji: '🏦', fields: [
    { key: 'bank', label: 'Banco', placeholder: 'Ej: Banco de Venezuela' },
    { key: 'account', label: 'N° de cuenta', placeholder: '0102-xxxx-xx-xxxxxxxxxx' },
    { key: 'account_type', label: 'Tipo', placeholder: 'Corriente / Ahorro' },
    { key: 'id_number', label: 'Cédula/RIF', placeholder: 'V-12345678' },
    { key: 'holder', label: 'Titular', placeholder: 'Nombre del titular' },
  ]},
  { id: 'zelle', label: 'Zelle', emoji: '💳', fields: [
    { key: 'email', label: 'Email Zelle', placeholder: 'doctor@email.com', type: 'email' },
    { key: 'holder', label: 'Nombre del titular', placeholder: 'Carlos Ramirez' },
    { key: 'bank', label: 'Banco (opcional)', placeholder: 'Chase, Bank of America…' },
  ]},
  { id: 'binance', label: 'Binance Pay', emoji: '₿', fields: [
    { key: 'binance_id', label: 'Binance ID', placeholder: '123456789' },
    { key: 'email', label: 'Email', placeholder: 'doctor@email.com' },
  ]},
  { id: 'cash_usd', label: 'Efectivo USD', emoji: '💵', fields: [] },
  { id: 'cash_bs', label: 'Efectivo Bs', emoji: '💵', fields: [] },
  { id: 'pos', label: 'Punto de venta', emoji: '🛒', fields: [
    { key: 'bank', label: 'Banco del POS', placeholder: 'Ej: Mercantil' },
  ]},
]

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'

type TabId = 'profile' | 'booking' | 'payment' | 'notifications' | 'integrations'

function SettingsPageInner() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabId) || 'profile'

  // Profile
  const [profile, setProfile] = useState({ full_name: '', email: '', phone: '', specialty: '', professional_title: 'Dr.', allows_online: true })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<TabId>(initialTab)
  const [doctorId, setDoctorId] = useState<string | null>(null)

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Plans
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [newPlan, setNewPlan] = useState({ name: '', price_usd: '', duration_minutes: '30', sessions_count: '1' })
  const [planError, setPlanError] = useState('')
  const [plansSaving, setPlansSaving] = useState(false)

  // Payment
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])
  const [paymentDetails, setPaymentDetails] = useState<Record<string, Record<string, string>>>({})
  const [paymentSaved, setPaymentSaved] = useState(false)

  // Insurance
  const [insurances, setInsurances] = useState<Insurance[]>([])
  const [showNewInsurance, setShowNewInsurance] = useState(false)
  const [insuranceSearch, setInsuranceSearch] = useState('')
  const [newInsurance, setNewInsurance] = useState({ name: '', credit_days: 30, notes: '' })
  const [showInsDropdown, setShowInsDropdown] = useState(false)

  // Assistants
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [showNewAssistant, setShowNewAssistant] = useState(false)
  const [newAss, setNewAss] = useState({ name: '', email: '' })
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null)
  const [assError, setAssError] = useState('')

  // Notifications
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [browserNotif, setBrowserNotif] = useState(false)

  // Share message template
  const [shareMessageTemplate, setShareMessageTemplate] = useState('Hola {paciente}, te envío los documentos de tu consulta del {fecha}: {documentos}. Cualquier duda quedo a tu orden. {doctor}')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Integrations
  const [whatsappToken, setWhatsappToken] = useState('')
  const [whatsappPhoneId, setWhatsappPhoneId] = useState('')
  const [googleToken, setGoogleToken] = useState('')
  const [integrationsLoading, setIntegrationsLoading] = useState(false)

  // Services
  const [services, setServices] = useState<Service[]>([])
  const [showNewService, setShowNewService] = useState(false)
  const [newService, setNewService] = useState({ name: '', price_usd: '', description: '' })
  const [serviceError, setServiceError] = useState('')
  const [servicesSaving, setServicesSaving] = useState(false)

  // Booking link
  const [copied, setCopied] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const publicLink = doctorId ? `${baseUrl}/book/${doctorId}` : ''

  // Load all data
  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setDoctorId(user.id)

      // profile
      // Load profile — use * to avoid errors if some columns don't exist yet
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id).single()

      if (data) {
        setProfile({ full_name: data.full_name ?? '', email: data.email ?? '', phone: data.phone ?? '', specialty: data.specialty ?? '', professional_title: data.professional_title ?? 'Dr.', allows_online: data.allows_online !== false })
        setAvatarUrl(data.avatar_url ?? null)
        setLogoUrl(data.logo_url ?? null)
        setWhatsappToken(data.whatsapp_token ?? '')
        setWhatsappPhoneId(data.whatsapp_phone_id ?? '')
        if (data.share_message_template) setShareMessageTemplate(data.share_message_template)
        setGoogleToken(data.google_refresh_token ? '••••••••••' : '')
        setPaymentMethods(data.payment_methods ?? ['pago_movil', 'transferencia'])
        setPaymentDetails(data.payment_details ?? {})
        setSoundEnabled(data.sound_notifications !== false)
      }

      // plans
      const { data: p } = await supabase.from('pricing_plans').select('*').eq('doctor_id', user.id).order('price_usd')
      if (p) setPlans(p as PricingPlan[])

      // insurances
      try {
        const { data: ins } = await supabase.from('doctor_insurances').select('*').eq('doctor_id', user.id).order('name')
        if (ins) setInsurances(ins.map(i => ({ id: i.id, name: i.name, credit_days: i.credit_days ?? 30, notes: i.notes ?? '' })))
      } catch { /* tabla puede no existir */ }

      // services
      try {
        const { data: svcs } = await supabase.from('doctor_services').select('*').eq('doctor_id', user.id).order('name')
        if (svcs) setServices(svcs as Service[])
      } catch { /* tabla puede no existir */ }

      setLoading(false)
    }
    load()

    // notifications permission
    if ('Notification' in window) {
      setBrowserNotif(Notification.permission === 'granted')
    }
    const ls = localStorage.getItem('appt_sound_enabled')
    if (ls !== null) setSoundEnabled(ls === 'true')
  }, [])

  /* ---------------- PROFILE ---------------- */

  async function saveProfile() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({
      full_name: profile.full_name,
      phone: profile.phone,
      specialty: profile.specialty,
      professional_title: profile.professional_title,
      allows_online: profile.allows_online,
      share_message_template: shareMessageTemplate || null,
    }).eq('id', user.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  /* ---------------- LOGO ---------------- */

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !doctorId) return
    setUploadingLogo(true); setLogoError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `logos/${doctorId}.${ext}`
    let { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr && upErr.message?.toLowerCase().includes('bucket')) {
      try {
        await supabase.storage.createBucket('avatars', { public: true })
        const retry = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
        upErr = retry.error
      } catch { upErr = { message: 'No se pudo crear el bucket' } as any }
    }
    if (upErr) {
      setLogoError('No se pudo subir el logo. Intenta de nuevo.')
    } else {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = urlData.publicUrl
      await supabase.from('profiles').update({ logo_url: url }).eq('id', doctorId)
      setLogoUrl(url + '?t=' + Date.now())
    }
    setUploadingLogo(false)
  }

  /* ---------------- PLANS ---------------- */

  async function savePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!newPlan.name.trim()) { setPlanError('El nombre es obligatorio'); return }
    if (!newPlan.price_usd || isNaN(parseFloat(newPlan.price_usd))) { setPlanError('Precio inválido'); return }
    if (!doctorId) return
    setPlansSaving(true); setPlanError('')
    const supabase = createClient()
    const { data, error } = await supabase.from('pricing_plans').insert({
      doctor_id: doctorId,
      name: newPlan.name,
      price_usd: parseFloat(newPlan.price_usd),
      duration_minutes: parseInt(newPlan.duration_minutes) || 30,
      sessions_count: parseInt(newPlan.sessions_count) || 1,
      is_active: true,
    }).select().single()
    if (error) {
      setPlanError('Error al guardar: ' + error.message)
    } else if (data) {
      setPlans(prev => [...prev, data as PricingPlan])
    }
    setNewPlan({ name: '', price_usd: '', duration_minutes: '30', sessions_count: '1' })
    setShowNewPlan(false); setPlansSaving(false)
  }

  async function togglePlan(id: string) {
    const plan = plans.find(p => p.id === id)
    setPlans(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p))
    if (plan) { const supabase = createClient(); await supabase.from('pricing_plans').update({ is_active: !plan.is_active }).eq('id', id) }
  }

  async function deletePlan(id: string) {
    setPlans(prev => prev.filter(p => p.id !== id))
    const supabase = createClient(); await supabase.from('pricing_plans').delete().eq('id', id)
  }

  /* ---------------- PAYMENT METHODS ---------------- */

  function togglePaymentMethod(id: string) {
    setPaymentMethods(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  function updatePaymentField(methodId: string, field: string, value: string) {
    setPaymentDetails(prev => ({
      ...prev,
      [methodId]: { ...(prev[methodId] ?? {}), [field]: value },
    }))
  }

  async function savePaymentMethods() {
    if (!doctorId) return
    const supabase = createClient()
    try {
      await supabase.from('profiles').update({
        payment_methods: paymentMethods,
        payment_details: paymentDetails,
      }).eq('id', doctorId)
      setPaymentSaved(true)
      setTimeout(() => setPaymentSaved(false), 2500)
    } catch (err: any) {
      alert('No se pudo guardar (posiblemente falta columna payment_details en DB). ' + err.message)
    }
  }

  /* ---------------- INSURANCE ---------------- */

  const insFiltered = insuranceSearch.trim().length > 0
    ? VENEZUELA_INSURANCES.filter(n => n.toLowerCase().includes(insuranceSearch.toLowerCase()))
    : VENEZUELA_INSURANCES

  async function addInsurance(e: React.FormEvent) {
    e.preventDefault()
    if (!newInsurance.name.trim() || !doctorId) return
    const supabase = createClient()
    try {
      const { data } = await supabase.from('doctor_insurances').insert({
        doctor_id: doctorId,
        name: newInsurance.name.trim(),
        credit_days: newInsurance.credit_days,
        notes: newInsurance.notes,
      }).select().single()
      if (data) setInsurances(prev => [...prev, { id: data.id, name: data.name, credit_days: data.credit_days, notes: data.notes ?? '' }])
    } catch {
      setInsurances(prev => [...prev, { ...newInsurance }])
    }
    setNewInsurance({ name: '', credit_days: 30, notes: '' })
    setShowNewInsurance(false); setInsuranceSearch(''); setShowInsDropdown(false)
  }

  async function removeInsurance(idx: number) {
    const item = insurances[idx]
    setInsurances(prev => prev.filter((_, i) => i !== idx))
    if (item.id) { const supabase = createClient(); await supabase.from('doctor_insurances').delete().eq('id', item.id) }
  }

  function selectInsuranceFromList(name: string) {
    setNewInsurance(p => ({ ...p, name }))
    setInsuranceSearch(name); setShowInsDropdown(false)
  }

  /* ---------------- ASSISTANTS ---------------- */

  function createAssistant(e: React.FormEvent) {
    e.preventDefault()
    if (!newAss.name.trim() || !newAss.email.trim()) { setAssError('Nombre y email son obligatorios'); return }
    const defaultModules: Record<string, boolean> = {}
    ALL_MODULES.forEach(m => { defaultModules[m.id] = m.enabled })
    const assistant: Assistant = { id: Date.now().toString(), name: newAss.name, email: newAss.email, modules: defaultModules, created_at: new Date().toISOString() }
    setAssistants(prev => [...prev, assistant])
    setNewAss({ name: '', email: '' }); setShowNewAssistant(false); setAssError('')
  }

  function toggleAssistantModule(assId: string, moduleId: string) {
    setAssistants(prev => prev.map(a => a.id === assId ? { ...a, modules: { ...a.modules, [moduleId]: !a.modules[moduleId] } } : a))
    if (selectedAssistant?.id === assId) setSelectedAssistant(prev => prev ? { ...prev, modules: { ...prev.modules, [moduleId]: !prev.modules[moduleId] } } : null)
  }

  /* ---------------- NOTIFICATIONS ---------------- */

  async function toggleSound() {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('appt_sound_enabled', String(next))
    if (doctorId) {
      try {
        const supabase = createClient()
        await supabase.from('profiles').update({ sound_notifications: next }).eq('id', doctorId)
      } catch { /* columna puede no existir */ }
    }
  }

  async function requestBrowserNotif() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setBrowserNotif(perm === 'granted')
  }

  /* ---------------- SERVICES ---------------- */

  async function saveService(e: React.FormEvent) {
    e.preventDefault()
    if (!newService.name.trim()) { setServiceError('El nombre es obligatorio'); return }
    if (!newService.price_usd || isNaN(parseFloat(newService.price_usd))) { setServiceError('Precio inválido'); return }
    if (!doctorId) return
    setServicesSaving(true); setServiceError('')
    const supabase = createClient()
    const { data, error } = await supabase.from('doctor_services').insert({
      doctor_id: doctorId,
      name: newService.name,
      price_usd: parseFloat(newService.price_usd),
      description: newService.description || null,
      is_active: true,
    }).select().single()
    if (error) {
      setServiceError('Error al guardar: ' + error.message)
    } else if (data) {
      setServices(prev => [...prev, data as Service])
    }
    setNewService({ name: '', price_usd: '', description: '' })
    setShowNewService(false); setServicesSaving(false)
  }

  async function toggleService(id: string) {
    const service = services.find(s => s.id === id)
    setServices(prev => prev.map(s => s.id === id ? { ...s, is_active: !s.is_active } : s))
    if (service) { const supabase = createClient(); await supabase.from('doctor_services').update({ is_active: !service.is_active }).eq('id', id) }
  }

  async function deleteService(id: string) {
    setServices(prev => prev.filter(s => s.id !== id))
    const supabase = createClient(); await supabase.from('doctor_services').delete().eq('id', id)
  }

  /* ---------------- INTEGRATIONS ---------------- */

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
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'profile', label: 'Mi perfil', icon: User },
    { id: 'booking', label: 'Link público', icon: Link2 },
    { id: 'payment', label: 'Métodos de pago', icon: DollarSign },
    { id: 'notifications', label: 'Notificaciones', icon: Bell },
    { id: 'integrations', label: 'Integraciones', icon: ExternalLink },
  ]

  return (
    <>
      <style>{`* { font-family: 'Inter', sans-serif; } .g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Configuración</h1>
          <p className="text-sm text-slate-500">Perfil, métodos de pago, notificaciones y más</p>
        </div>

        {/* Shortcuts a secciones avanzadas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="/doctor/settings/consultation-blocks"
            className="block p-4 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <FileBadge className="w-5 h-5 text-teal-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">Bloques de consulta</p>
                <p className="text-xs text-slate-600 mt-0.5">Secciones del formulario de consulta por especialidad.</p>
              </div>
            </div>
          </a>
          <a href="/doctor/settings/exchange-rate"
            className="block p-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">Tasa de cambio</p>
                <p className="text-xs text-slate-600 mt-0.5">USD BCV, EUR BCV o tasa personalizada para conversiones a Bs.</p>
              </div>
            </div>
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* ---------------- PROFILE ---------------- */}
        {tab === 'profile' && (
          <div className="space-y-4">
            {/* Foto de perfil con crop */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-1">Foto de perfil</p>
              <p className="text-xs text-slate-500 mb-4">Esta foto aparece en tu página pública y en el portal. Puedes recortarla y hacer zoom.</p>
              <AvatarUploader
                doctorId={doctorId}
                currentUrl={avatarUrl}
                onUploaded={(url) => setAvatarUrl(url)}
              />
            </div>

            {/* Logo del consultorio */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-1">Logo del consultorio</p>
              <p className="text-xs text-slate-500 mb-4">Aparece en facturas, presupuestos, informes médicos y recetas.</p>
              <div className="flex items-center gap-5">
                <div className="w-24 h-24 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <FileBadge className="w-7 h-7 text-slate-300" />
                  )}
                </div>
                <div className="space-y-2">
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    {uploadingLogo ? 'Subiendo…' : (logoUrl ? 'Cambiar logo' : 'Subir logo')}
                  </button>
                  <p className="text-[10px] text-slate-400">PNG o SVG con fondo transparente · Máx. 2MB</p>
                </div>
              </div>
              {logoError && <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{logoError}</p>}
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
              {loading ? <div className="text-slate-400 text-sm py-4">Cargando…</div> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Título profesional</label>
                      <select value={profile.professional_title} onChange={e => setProfile(p => ({ ...p, professional_title: e.target.value }))} className={fi}>
                        {PROFESSIONAL_TITLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre completo</label>
                      <input value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} className={fi} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                      <input value={profile.email} disabled className={fi + ' opacity-50 cursor-not-allowed'} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                      <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+58 412 000 0000" className={fi} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Especialidad</label>
                    <select value={profile.specialty} onChange={e => setProfile(p => ({ ...p, specialty: e.target.value }))} className={fi}>
                      <option value="">Seleccionar especialidad…</option>
                      {ESPECIALIDADES.map(esp => <option key={esp} value={esp}>{esp}</option>)}
                    </select>
                  </div>
                  {/* Online consultations toggle */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Consultas online</p>
                        <p className="text-xs text-slate-400 mt-0.5">Permitir que pacientes agenden videoconsultas</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProfile(p => ({ ...p, allows_online: !p.allows_online }))}
                        className="flex items-center gap-2"
                      >
                        {profile.allows_online ? (
                          <ToggleRight className="w-8 h-8 text-teal-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-300" />
                        )}
                      </button>
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

        {/* Plans tab removed — now in /doctor/services */}

        {/* ---------------- BOOKING ---------------- */}
        {tab === 'booking' && (
          <div className="space-y-4">
            <div className="g-bg rounded-xl p-6 text-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Link2 className="w-6 h-6 text-white" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg">Tu link público de booking</p>
                  <p className="text-sm text-white/70 mt-0.5">Compártelo en redes, tarjetas de presentación o por WhatsApp. Nunca vence.</p>
                  <div className="mt-4 bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-mono flex-1 truncate text-white/90">{publicLink || 'Cargando…'}</p>
                    <button onClick={() => { navigator.clipboard.writeText(publicLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                      className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                      {copied ? <><Check className="w-3.5 h-3.5" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* Share Message Template */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Mensaje de WhatsApp / Correo</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Personaliza el mensaje que se envía al compartir documentos con tus pacientes desde Consultas.
                </p>
              </div>
              <div>
                <textarea
                  value={shareMessageTemplate}
                  onChange={e => setShareMessageTemplate(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                  placeholder="Escribe tu mensaje personalizado..."
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1 self-center">Variables:</span>
                {[
                  { tag: '{paciente}', desc: 'Nombre' },
                  { tag: '{fecha}', desc: 'Fecha consulta' },
                  { tag: '{documentos}', desc: 'Docs seleccionados' },
                  { tag: '{doctor}', desc: 'Tu nombre' },
                  { tag: '{codigo}', desc: 'Código consulta' },
                ].map(v => (
                  <button
                    key={v.tag}
                    onClick={() => setShareMessageTemplate(prev => prev + ' ' + v.tag)}
                    className="px-2 py-1 bg-teal-50 text-teal-700 rounded-md text-[11px] font-semibold hover:bg-teal-100 transition-colors"
                    title={v.desc}
                  >
                    {v.tag}
                  </button>
                ))}
                <div className="relative ml-1">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[11px] font-semibold hover:bg-amber-100 transition-colors border border-amber-200"
                    title="Agregar emoji"
                  >
                    😊 Emojis
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 w-[280px]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-slate-700">Emojis</p>
                        <button onClick={() => setShowEmojiPicker(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
                      </div>
                      <div className="grid grid-cols-8 gap-1">
                        {['👋','😊','🙏','💪','❤️','✅','📋','💊','🏥','🩺','📅','⏰','📧','📱','👨‍⚕️','👩‍⚕️','🔬','💉','🌡️','😷','🤝','👍','⭐','🎯','📌','✨','🔔','💬','📝','🗓️','💰','🏃'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setShareMessageTemplate(prev => prev + emoji)
                              setShowEmojiPicker(false)
                            }}
                            className="text-lg hover:bg-slate-100 rounded p-1 transition-colors flex items-center justify-center"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Vista previa</p>
                <p className="text-xs text-slate-600 whitespace-pre-wrap">
                  {shareMessageTemplate
                    .replace('{paciente}', 'María García')
                    .replace('{fecha}', new Date().toLocaleDateString('es-VE'))
                    .replace('{documentos}', 'informe médico, receta')
                    .replace('{doctor}', profile.professional_title + ' ' + profile.full_name)
                    .replace('{codigo}', 'CON-001')
                  }
                </p>
              </div>
              <button onClick={saveProfile} className="flex items-center gap-2 g-bg px-4 py-2 rounded-lg text-sm font-bold text-white hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" /> Guardar mensaje
              </button>
            </div>
          </div>
        )}

        {/* ---------------- PAYMENT METHODS ---------------- */}
        {tab === 'payment' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">Métodos de pago aceptados</p>
              <p className="text-xs text-slate-500 mb-4">Configura los datos para recibir pagos. Los pacientes verán esta información al agendar o pagar.</p>

              <div className="space-y-3">
                {PAYMENT_METHODS.map(method => {
                  const active = paymentMethods.includes(method.id)
                  return (
                    <div key={method.id} className={`border rounded-xl overflow-hidden transition-all ${active ? 'border-teal-300 bg-teal-50/30' : 'border-slate-200 bg-white'}`}>
                      <button
                        type="button"
                        onClick={() => togglePaymentMethod(method.id)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <input type="checkbox" readOnly checked={active} className="w-5 h-5 rounded border-slate-300 text-teal-500 pointer-events-none" />
                        <span className="text-xl">{method.emoji}</span>
                        <span className="text-sm font-medium text-slate-700 flex-1">{method.label}</span>
                        {active && method.fields.length > 0 && (
                          <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">Configurable</span>
                        )}
                      </button>
                      {active && method.fields.length > 0 && (
                        <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {method.fields.map(f => (
                            <div key={f.key}>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                              <input
                                type={f.type ?? 'text'}
                                value={paymentDetails[method.id]?.[f.key] ?? ''}
                                onChange={e => updatePaymentField(method.id, f.key, e.target.value)}
                                placeholder={f.placeholder}
                                className={fi}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button onClick={savePaymentMethods} className="mt-6 flex items-center gap-2 g-bg px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90">
                {paymentSaved ? <><CheckCircle className="w-4 h-4" />Guardado</> : <><SaveIcon className="w-4 h-4" />Guardar métodos y datos</>}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- SERVICES ---------------- */}
        {/* Services and Insurance tabs removed for MVP */}

        {/* ---------------- HIDDEN: INSURANCE (MVP deferred) ---------------- */}
        {false && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Seguros aceptados</p>
                  <p className="text-xs text-slate-500 mt-1">Busca de la lista de Venezuela o agrega uno personalizado</p>
                </div>
                <button onClick={() => setShowNewInsurance(true)} className="g-bg flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90">
                  <Plus className="w-3.5 h-3.5" /> Agregar seguro
                </button>
              </div>

              {showNewInsurance && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                  <form onSubmit={addInsurance} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Buscar seguro</label>
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          value={insuranceSearch}
                          onChange={e => { setInsuranceSearch(e.target.value); setNewInsurance(p => ({ ...p, name: e.target.value })); setShowInsDropdown(true) }}
                          onFocus={() => setShowInsDropdown(true)}
                          onBlur={() => setTimeout(() => setShowInsDropdown(false), 150)}
                          placeholder="Escribe para buscar (ej: Mercantil, Mapfre, Seguros Caracas…)"
                          className={fi + ' pl-10'}
                        />
                        {showInsDropdown && insFiltered.length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                            {insFiltered.slice(0, 50).map(name => (
                              <button
                                type="button"
                                key={name}
                                onClick={() => selectInsuranceFromList(name)}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors"
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Lista completa de compañías de seguros de Venezuela — o escribe uno personalizado</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Copago (USD, opcional)</label>
                        <input type="number" min="0" step="0.01" placeholder="0.00" className={fi} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Días de crédito</label>
                        <input type="number" min="0" value={newInsurance.credit_days} onChange={e => setNewInsurance(p => ({ ...p, credit_days: parseInt(e.target.value) || 0 }))} className={fi} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
                        <input value={newInsurance.notes} onChange={e => setNewInsurance(p => ({ ...p, notes: e.target.value }))} placeholder="Autorización previa" className={fi} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowNewInsurance(false); setInsuranceSearch(''); setShowInsDropdown(false) }} className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        Cancelar
                      </button>
                      <button type="submit" className="flex-1 g-bg py-2 rounded-lg text-xs font-bold text-white">Agregar</button>
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
                      <button onClick={() => removeInsurance(idx)} className="p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- NOTIFICATIONS ---------------- */}
        {tab === 'notifications' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Notificaciones del panel</p>

              <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {soundEnabled ? <Volume2 className="w-5 h-5 text-teal-500 shrink-0" /> : <VolumeX className="w-5 h-5 text-slate-400 shrink-0" />}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Sonido al recibir una cita</p>
                    <p className="text-xs text-slate-500">Reproduce un beep cuando se agenda una cita nueva</p>
                  </div>
                </div>
                <button
                  onClick={toggleSound}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${soundEnabled ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                >
                  {soundEnabled ? <><ToggleRight className="w-4 h-4" />Activo</> : <><ToggleLeft className="w-4 h-4" />Inactivo</>}
                </button>
              </div>

              <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Bell className={`w-5 h-5 shrink-0 ${browserNotif ? 'text-teal-500' : 'text-slate-400'}`} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Notificaciones del navegador</p>
                    <p className="text-xs text-slate-500">Recibe alertas del sistema cuando haya una cita nueva</p>
                  </div>
                </div>
                {browserNotif ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full shrink-0">Permitido</span>
                ) : (
                  <button onClick={requestBrowserNotif} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-500 text-white hover:opacity-90">
                    Permitir
                  </button>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Smartphone className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">El panel revisa nuevas citas cada 30 segundos. Mantén esta pestaña abierta para recibirlas.</p>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- ASSISTANTS ---------------- */}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{ass.name}</p><p className="text-xs text-slate-400 truncate">{ass.email}</p></div>
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full shrink-0">Asistente</span>
                  </div>
                  {selectedAssistant?.id === ass.id && (
                    <div className="p-5 space-y-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Módulos activos</p>
                      {ALL_MODULES.map(mod => (
                        <div key={mod.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0 gap-3">
                          <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{mod.label}</p><p className="text-xs text-slate-400">{mod.description}</p></div>
                          <button onClick={() => toggleAssistantModule(ass.id, mod.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${ass.modules[mod.id] ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
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

        {/* ---------------- INTEGRATIONS ---------------- */}
        {tab === 'integrations' && (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
              <Shield className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
              <p className="text-sm text-teal-700">Conecta herramientas externas para sincronizar tu agenda y enviar mensajes automáticos.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-600 text-sm font-bold">GC</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Google Calendar</p>
                    <p className="text-xs text-slate-500">Sincroniza tus citas con Google Calendar</p>
                  </div>
                </div>
                {googleToken ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Conectado</span>
                ) : (
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">No conectado</span>
                )}
              </div>
              <button onClick={() => { window.location.href = '/api/integrations/google/auth' }} className="w-full px-4 py-2.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors">
                {googleToken ? 'Reconectar Google Calendar' : 'Conectar Google Calendar'}
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <span className="text-emerald-600 text-sm font-bold">WA</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">WhatsApp Business API</p>
                    <p className="text-xs text-slate-500">Envía confirmaciones y recordatorios</p>
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
                  <input type="password" value={whatsappToken} onChange={e => setWhatsappToken(e.target.value)} placeholder="Obtén tu token en developers.facebook.com" className={fi} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">ID del Número de Teléfono</label>
                  <input value={whatsappPhoneId} onChange={e => setWhatsappPhoneId(e.target.value)} placeholder="Ej: 123456789012345" className={fi} />
                </div>
              </div>
              <button onClick={saveIntegrations} disabled={integrationsLoading} className="w-full px-4 py-2.5 g-bg text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                {integrationsLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><SaveIcon className="w-4 h-4" /> Guardar credenciales</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default function DoctorSettingsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-slate-400 text-sm">Cargando…</div>}>
      <SettingsPageInner />
    </Suspense>
  )
}
