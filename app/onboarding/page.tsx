'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, Phone, ArrowRight, Loader2, CheckCircle2, Stethoscope, User, Clock, LayoutGrid } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// F5 (2026-04-29): bloques mínimos que SIEMPRE quedan pre-marcados (core).
// Reflejan los del fallback hardcoded de la consulta para que el doctor nunca
// quede con un set vacío si no tocó las casillas.
const CORE_BLOCK_KEYS = new Set(['chief_complaint', 'diagnosis', 'treatment', 'prescription'])

// F5 (2026-04-29): tipo del catálogo de bloques.
type CatalogBlock = {
  key: string
  default_label: string
  default_content_type: string
  description: string | null
}

const ESPECIALIDADES = [
  'Cardiología','Dermatología','Endocrinología','Gastroenterología',
  'Ginecología y Obstetricia','Medicina General','Medicina Interna',
  'Nefrología','Neurología','Nutrición','Odontología',
  'Oftalmología','Ortopedia y Traumatología',
  'Otorrinolaringología','Pediatría','Psicología','Psiquiatría',
  'Reumatología','Fisioterapia','Urología','Otra',
]

const PROFESSIONAL_TITLES = [
  { value: 'Dr.',  label: 'Doctor (Dr.)' },
  { value: 'Dra.', label: 'Doctora (Dra.)' },
  { value: 'Lic.', label: 'Licenciado/a (Lic.)' },
  { value: 'Psic.', label: 'Psicólogo/a (Psic.)' },
  { value: 'Odont.', label: 'Odontólogo/a (Odont.)' },
  { value: 'Nutr.', label: 'Nutricionista (Nutr.)' },
  { value: 'Fisio.', label: 'Fisioterapeuta (Fisio.)' },
]

type Role = 'doctor' | 'patient'

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // F5 (2026-04-29): Step 1=rol, 2=datos, 3=bloques (solo doctor), 4=pending.
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [role, setRole] = useState<Role>('doctor')

  // Form fields
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [professionalTitle, setProfessionalTitle] = useState('Dr.')
  const [sex, setSex] = useState('')

  // F5 (2026-04-29): estado para el paso de bloques de consulta (solo doctor).
  const [catalog, setCatalog] = useState<CatalogBlock[]>([])
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set())
  const [blocksLoading, setBlocksLoading] = useState(false)
  const [savingBlocks, setSavingBlocks] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setUserName(user.user_metadata?.full_name || user.user_metadata?.name || '')
      setUserEmail(user.email || '')

      // Check if profile already exists and is complete
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, phone')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.phone) {
        // Already onboarded — redirect
        if (profile.role === 'super_admin' || profile.role === 'admin') {
          router.push('/admin')
        } else if (profile.role === 'patient') {
          router.push('/patient/dashboard')
        } else {
          router.push('/doctor')
        }
        return
      }

      // If profile exists with a role, pre-select it
      if (profile?.role === 'patient') setRole('patient')
      else if (profile?.role) setRole('doctor')
      else {
        // AUDIT FIX 2026-04-28 (FASE 5D): si llegamos aquí desde un first-time
        // OAuth, el trigger BD creó el profile con role NULL. Revisamos si
        // /register guardó el rol intencional en localStorage para
        // pre-seleccionarlo en vez de mostrar 'doctor' por default.
        try {
          const pending = localStorage.getItem('pending_role')
          if (pending === 'patient') setRole('patient')
          else if (pending === 'doctor') setRole('doctor')
        } catch { /* ignore */ }
      }

      setLoading(false)
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) {
      setError('El teléfono es obligatorio')
      return
    }
    if (role === 'doctor' && !sex) {
      setError('Selecciona tu sexo')
      return
    }
    if (!userId) return
    setError('')
    setSaving(true)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          role,
          phone: phone.trim(),
          full_name: userName,
          email: userEmail,
          specialty: role === 'doctor' ? specialty : undefined,
          professional_title: role === 'doctor' ? professionalTitle : undefined,
          sex: sex || undefined,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Error al guardar')
        setSaving(false)
        return
      }

      // AUDIT FIX 2026-04-28 (FASE 5D): limpiar el hint del flow de OAuth.
      try { localStorage.removeItem('pending_role') } catch { /* ignore */ }

      // F5 (2026-04-29): pacientes van directo a su dashboard; doctores pasan
      // primero por el paso 3 (selección de bloques de consulta) antes del
      // mensaje de "pendiente de aprobación".
      if (role === 'patient') {
        router.push('/patient/dashboard')
      } else {
        await loadBlocksCatalog()
        setStep(3)
        setSaving(false)
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar')
      setSaving(false)
    }
  }

  // F5 (2026-04-29): carga el catálogo de bloques + specialty defaults y
  // pre-marca los core + los enabled por defaults de la especialidad seleccionada.
  async function loadBlocksCatalog() {
    setBlocksLoading(true)
    // F-FONDO (2026-04-29): pre-marcar core inmediatamente para que el doctor
    // siempre tenga al menos los 4 bloques esenciales seleccionados aunque la
    // query del catalog tarde o falle. Antes el botón "Continuar" quedaba
    // disabled si el state estaba vacío al renderizar el step 3.
    setSelectedBlocks(new Set(CORE_BLOCK_KEYS))
    try {
      const supabase = createClient()
      const [catalogRes, specialtyRes] = await Promise.all([
        supabase
          .from('consultation_block_catalog')
          .select('key, default_label, default_content_type, description')
          .order('key'),
        specialty
          ? supabase
              .from('specialty_default_blocks')
              .select('block_key, enabled')
              .eq('specialty', specialty)
          : Promise.resolve({ data: [] as { block_key: string; enabled: boolean }[] }),
      ])

      const cat = (catalogRes.data || []) as CatalogBlock[]
      const specialtyDefaults = ((specialtyRes.data || []) as { block_key: string; enabled: boolean }[])
        .filter(s => s.enabled)
        .map(s => s.block_key)

      const preselected = new Set<string>()
      // Core siempre pre-marcado
      for (const k of CORE_BLOCK_KEYS) preselected.add(k)
      // Defaults de la especialidad
      for (const k of specialtyDefaults) preselected.add(k)
      // Filtrar a llaves que realmente existan en el catálogo
      const validKeys = new Set(cat.map(c => c.key))
      const final = new Set<string>()
      for (const k of preselected) if (validKeys.has(k)) final.add(k)

      setCatalog(cat)
      setSelectedBlocks(final)
    } catch (err) {
      // Si falla la carga, mostramos el catálogo vacío y el doctor podrá
      // continuar — la app igual cae al fallback de bloques core.
      console.error('Error cargando catálogo de bloques:', err)
    } finally {
      setBlocksLoading(false)
    }
  }

  // F5 (2026-04-29): toggle de selección.
  function toggleBlock(key: string) {
    setSelectedBlocks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // F5 (2026-04-29): guarda los bloques marcados y avanza al paso 4 (pending).
  async function saveBlocksAndContinue() {
    if (!userId) return
    setSavingBlocks(true)
    setError('')
    try {
      const supabase = createClient()
      // Bulk insert: una fila por bloque seleccionado, ordenado por la posición
      // del catálogo (que ya viene ordenado por key). Si la PK ya existe (caso
      // poco probable en onboarding), usamos upsert para idempotencia.
      const rows = catalog
        .filter(c => selectedBlocks.has(c.key))
        .map((c, idx) => ({
          doctor_id: userId,
          block_key: c.key,
          enabled: true,
          sort_order: idx,
        }))

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('doctor_consultation_blocks')
          .upsert(rows, { onConflict: 'doctor_id,block_key' })
        if (insertError) {
          setError(insertError.message)
          setSavingBlocks(false)
          return
        }
      }
      setStep(4)
    } catch (err: any) {
      setError(err?.message || 'Error al guardar bloques')
    } finally {
      setSavingBlocks(false)
    }
  }

  // F5 (2026-04-29): permitir saltar el paso si el doctor no quiere configurarlo
  // ahora. La cascada de resolución cae a defaults de especialidad / catálogo.
  function skipBlocks() {
    setStep(4)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    )
  }

  const inp = 'w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-medium outline-none transition-all focus:border-cyan-400 bg-white'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.g-text{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}`}</style>

      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center gap-2.5 justify-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center g-bg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-bold text-lg text-slate-900 leading-none">Delta</p>
              <p className="text-[10px] text-slate-400 font-semibold">Health Tech</p>
            </div>
          </div>

          {userName && (
            <p className="text-sm text-slate-500">
              Hola, <span className="font-semibold text-slate-700">{userName}</span>
            </p>
          )}
        </div>

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-extrabold text-slate-900">¿Cómo usarás Delta?</h1>
              <p className="text-sm text-slate-500">Selecciona tu rol para personalizar tu experiencia</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole('doctor')}
                className={`p-5 rounded-xl border-2 text-center transition-all ${
                  role === 'doctor'
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Stethoscope className={`w-8 h-8 mx-auto mb-2 ${role === 'doctor' ? 'text-teal-500' : 'text-slate-400'}`} />
                <p className={`text-sm font-bold ${role === 'doctor' ? 'text-teal-700' : 'text-slate-700'}`}>Soy Médico</p>
                <p className="text-xs text-slate-400 mt-1">Gestiona tu consulta</p>
              </button>

              <button
                onClick={() => setRole('patient')}
                className={`p-5 rounded-xl border-2 text-center transition-all ${
                  role === 'patient'
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <User className={`w-8 h-8 mx-auto mb-2 ${role === 'patient' ? 'text-teal-500' : 'text-slate-400'}`} />
                <p className={`text-sm font-bold ${role === 'patient' ? 'text-teal-700' : 'text-slate-700'}`}>Soy Paciente</p>
                <p className="text-xs text-slate-400 mt-1">Accede a tus citas</p>
              </button>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 g-bg"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Phone + Details */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center g-bg">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-xl font-extrabold text-slate-900">Completa tu perfil</h1>
              <p className="text-sm text-slate-500">
                {role === 'doctor'
                  ? 'Necesitamos algunos datos para configurar tu consulta'
                  : 'Tu teléfono nos permite contactarte sobre tus citas'}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Phone — required for everyone */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Teléfono WhatsApp <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+58 412 1234567"
                    className={inp + ' pl-10'}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Usaremos este número para verificación y notificaciones</p>
              </div>

              {/* Doctor-specific fields */}
              {role === 'doctor' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Sexo <span className="text-red-400">*</span></label>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ v: 'female', label: 'Femenino' }, { v: 'male', label: 'Masculino' }].map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setSex(opt.v)}
                          className={`px-4 py-2.5 rounded-xl border-2 text-sm font-semibold text-center transition-all ${
                            sex === opt.v
                              ? 'border-cyan-400 bg-cyan-50/50 text-cyan-700'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Título profesional</label>
                    <select value={professionalTitle} onChange={e => setProfessionalTitle(e.target.value)} className={inp}>
                      {PROFESSIONAL_TITLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Especialidad</label>
                    <select value={specialty} onChange={e => setSpecialty(e.target.value)} className={inp}>
                      <option value="">Seleccionar...</option>
                      {ESPECIALIDADES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 g-bg"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Completar registro</>
                  )}
                </button>
              </div>
            </form>

            <p className="text-center text-xs text-slate-400">
              Podrás completar el resto de tus datos en Configuración
            </p>
          </div>
        )}

        {/* F5 (2026-04-29) Step 3: Bloques de consulta (solo doctor) */}
        {step === 3 && role === 'doctor' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5 w-full max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center g-bg">
                <LayoutGrid className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-xl font-extrabold text-slate-900">Bloques de tu consulta</h1>
              <p className="text-sm text-slate-500">
                Selecciona los bloques que usarás en cada consulta. Los predeterminados están marcados según tu especialidad — puedes ajustarlos cuando quieras desde Configuración.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {blocksLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
                  {catalog.map(block => {
                    const checked = selectedBlocks.has(block.key)
                    const isCore = CORE_BLOCK_KEYS.has(block.key)
                    return (
                      <label
                        key={block.key}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          checked
                            ? 'border-teal-300 bg-teal-50/40'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBlock(block.key)}
                          className="w-4 h-4 mt-0.5 accent-teal-500 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                            {block.default_label}
                            {isCore && (
                              <span className="text-[9px] font-bold uppercase tracking-wide bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">
                                core
                              </span>
                            )}
                          </p>
                          {block.description && (
                            <p className="text-xs text-slate-400 leading-snug mt-0.5">
                              {block.description}
                            </p>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={saveBlocksAndContinue}
                    disabled={savingBlocks}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 g-bg"
                  >
                    {savingBlocks ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                    ) : (
                      <>Continuar <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={skipBlocks}
                    disabled={savingBlocks}
                    className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                  >
                    Configurar más tarde
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Pending Approval (doctors) */}
        {step === 4 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-amber-100">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-extrabold text-slate-900">¡Registro completado!</h1>
              <p className="text-sm text-slate-500">
                Tu cuenta ha sido creada exitosamente. Cuando el administrador de Delta apruebe tu solicitud, tendrás acceso completo a la beta.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-left">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">¿Qué sigue?</p>
              <p className="text-sm text-amber-800">
                El equipo de Delta revisará tu solicitud y te notificará cuando tu acceso esté activo. Este proceso suele tomar menos de 24 horas.
              </p>
            </div>

            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-left">
              <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-1">Tu información</p>
              <p className="text-sm text-teal-800">{userName} · {userEmail}</p>
              <p className="text-sm text-teal-800">{phone}</p>
              {specialty && <p className="text-sm text-teal-800">{specialty}</p>}
            </div>

            <Link
              href="/"
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 g-bg"
            >
              Volver al inicio <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
