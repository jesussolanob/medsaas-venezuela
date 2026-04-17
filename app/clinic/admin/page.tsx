'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Building2, Users, Calendar, BarChart3, Plus, Settings, LogOut,
  Activity, Menu, X, UserPlus, Copy, Check, Mail, Clock, MapPin
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Clinic = {
  id: string
  name: string
  slug: string | null
  logo_url: string | null
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  max_doctors: number
  subscription_status: string
  subscription_expires_at: string | null
}

type ClinicDoctor = {
  id: string
  full_name: string
  specialty: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  clinic_role: string
  is_active: boolean
}

type ClinicStats = {
  totalDoctors: number
  totalAppointments: number
  todayAppointments: number
  monthRevenue: number
}

export default function ClinicAdminPage() {
  const router = useRouter()
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([])
  const [stats, setStats] = useState<ClinicStats>({ totalDoctors: 0, totalAppointments: 0, todayAppointments: 0, monthRevenue: 0 })
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tab, setTab] = useState<'dashboard' | 'doctors' | 'agenda' | 'settings'>('dashboard')
  const [inviteRole, setInviteRole] = useState<'doctor' | 'asistente'>('doctor')
  const [editingSettings, setEditingSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ name: '', address: '', city: '', state: '', phone: '', email: '' })
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    loadClinic()
  }, [])

  useEffect(() => {
    if (clinic) {
      setSettingsForm({
        name: clinic.name,
        address: clinic.address || '',
        city: clinic.city || '',
        state: clinic.state || '',
        phone: clinic.phone || '',
        email: clinic.email || ''
      })
      setCurrentLogoUrl(clinic.logo_url || null)
    }
  }, [clinic])

  async function loadClinic() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Get clinic where user is owner
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id, clinic_role')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) {
      // No clinic — show creation form
      setLoading(false)
      return
    }

    const { data: clinicData } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', profile.clinic_id)
      .single()

    if (clinicData) setClinic(clinicData)

    // Get doctors in this clinic
    const { data: clinicDoctors } = await supabase
      .from('profiles')
      .select('id, full_name, specialty, email, phone, avatar_url, clinic_role, is_active')
      .eq('clinic_id', profile.clinic_id)

    if (clinicDoctors) {
      setDoctors(clinicDoctors as ClinicDoctor[])
      setStats(prev => ({ ...prev, totalDoctors: clinicDoctors.length }))
    }

    // Get appointment stats
    const today = new Date().toISOString().split('T')[0]
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    const { count: todayCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .in('doctor_id', clinicDoctors?.map(d => d.id) || [])
      .gte('scheduled_at', today + 'T00:00:00')
      .lte('scheduled_at', today + 'T23:59:59')

    const { data: monthAppts } = await supabase
      .from('appointments')
      .select('plan_price')
      .in('doctor_id', clinicDoctors?.map(d => d.id) || [])
      .gte('scheduled_at', monthStart)
      .eq('status', 'completed')

    const monthRevenue = monthAppts?.reduce((sum, a) => sum + (a.plan_price || 0), 0) || 0

    setStats(prev => ({
      ...prev,
      todayAppointments: todayCount || 0,
      totalAppointments: monthAppts?.length || 0,
      monthRevenue
    }))

    setLoading(false)
  }

  async function handleInviteDoctor(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !clinic) return
    setInviting(true)
    setInviteSuccess('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('clinic_invitations').insert({
      clinic_id: clinic.id,
      email: inviteEmail.trim(),
      role: inviteRole,
      invited_by: user.id,
    })

    if (error) {
      setInviteSuccess('Error: ' + error.message)
    } else {
      setInviteSuccess(`Invitación enviada a ${inviteEmail} como ${inviteRole}`)
      setInviteEmail('')
      setInviteRole('doctor')
    }
    setInviting(false)
  }

  async function handleRemoveDoctor(docId: string) {
    if (!confirm('¿Estás seguro de que deseas remover este doctor? Se perderá su asociación con la clínica.')) return

    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ clinic_id: null, clinic_role: 'doctor' }).eq('id', docId)

    if (!error) {
      setDoctors(doctors.filter(d => d.id !== docId))
      setStats(prev => ({ ...prev, totalDoctors: Math.max(0, prev.totalDoctors - 1) }))
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !clinic) return

    setUploadingLogo(true)
    const supabase = createClient()

    try {
      const ext = file.name.split('.').pop()
      const path = `clinic-logos/${clinic.id}.${ext}`

      // Upload to clinic-logos bucket
      const { error: uploadErr } = await supabase.storage.from('clinic-logos').upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr

      // Get public URL
      const { data: publicUrl } = supabase.storage.from('clinic-logos').getPublicUrl(path)
      const logoUrl = publicUrl.publicUrl

      // Update clinic record
      const { error: updateErr } = await supabase.from('clinics').update({ logo_url: logoUrl }).eq('id', clinic.id)
      if (updateErr) throw updateErr

      setCurrentLogoUrl(logoUrl)
      setClinic({ ...clinic, logo_url: logoUrl })
      setInviteSuccess('Logo actualizado exitosamente')
    } catch (err: any) {
      setInviteSuccess('Error al subir logo: ' + err?.message)
    }
    setUploadingLogo(false)
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!clinic) return

    setUploadingLogo(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.from('clinics').update({
        name: settingsForm.name.trim(),
        address: settingsForm.address.trim() || null,
        city: settingsForm.city.trim() || null,
        state: settingsForm.state.trim() || null,
        phone: settingsForm.phone.trim() || null,
        email: settingsForm.email.trim() || null,
      }).eq('id', clinic.id)

      if (error) throw error

      setClinic({ ...clinic, ...settingsForm })
      setEditingSettings(false)
      setInviteSuccess('Configuración actualizada exitosamente')
    } catch (err: any) {
      setInviteSuccess('Error: ' + err?.message)
    }
    setUploadingLogo(false)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-violet-500 flex items-center justify-center mx-auto animate-pulse">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <p className="text-slate-500 font-medium">Cargando clínica...</p>
        </div>
      </div>
    )
  }

  // No clinic yet — show setup screen
  if (!clinic) {
    return <ClinicSetup onCreated={loadClinic} />
  }

  const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 bg-white transition-colors'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .clinic-layout * { font-family: 'Inter', sans-serif; }
        .g-clinic { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); }
        .g-text-clinic { background: linear-gradient(135deg, #8b5cf6, #6d28d9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
      `}</style>

      <div className="clinic-layout flex min-h-screen bg-slate-50 text-slate-900">
        {/* Mobile overlay */}
        {mobileOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}

        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 w-[240px] flex flex-col border-r border-slate-200 bg-white z-50 transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl g-clinic flex items-center justify-center shadow-md shadow-violet-200">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none g-text-clinic">{clinic.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Admin Clínica</p>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {[
              { id: 'dashboard' as const, icon: BarChart3, label: 'Dashboard' },
              { id: 'doctors' as const, icon: Users, label: 'Doctores' },
              { id: 'agenda' as const, icon: Calendar, label: 'Agenda General' },
              { id: 'settings' as const, icon: Settings, label: 'Configuración' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setMobileOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all border-l-3 ${
                  tab === item.id
                    ? 'bg-violet-50 text-violet-600 font-semibold border-violet-500'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
                }`}
              >
                <item.icon className={`w-4 h-4 shrink-0 ${tab === item.id ? 'text-violet-500' : ''}`} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="px-3 py-4 border-t border-slate-100">
            <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 w-full transition-all">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 lg:ml-[240px] flex flex-col min-h-screen w-full">
          <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <button className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100" onClick={() => setMobileOpen(true)}>
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-sm font-semibold text-slate-700">
                {tab === 'dashboard' ? 'Dashboard' : tab === 'doctors' ? 'Doctores' : tab === 'agenda' ? 'Agenda General' : 'Configuración'}
              </h1>
            </div>
            <span className="hidden sm:inline-flex text-xs text-violet-500 bg-violet-50 px-3 py-1 rounded-full font-medium">Centro de Salud</span>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 w-full">
            <div className="max-w-6xl mx-auto">
              {/* Dashboard tab */}
              {tab === 'dashboard' && (
                <div className="space-y-6">
                  {/* KPI cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Doctores', value: stats.totalDoctors, icon: Users, color: 'text-violet-500 bg-violet-50' },
                      { label: 'Citas hoy', value: stats.todayAppointments, icon: Calendar, color: 'text-teal-500 bg-teal-50' },
                      { label: 'Citas este mes', value: stats.totalAppointments, icon: Clock, color: 'text-blue-500 bg-blue-50' },
                      { label: 'Ingresos mes', value: `$${stats.monthRevenue}`, icon: BarChart3, color: 'text-emerald-500 bg-emerald-50' },
                    ].map(kpi => (
                      <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{kpi.label}</p>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.color}`}>
                            <kpi.icon className="w-4 h-4" />
                          </div>
                        </div>
                        <p className="text-2xl font-extrabold text-slate-900">{kpi.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Doctors overview */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-bold text-slate-800">Equipo médico</p>
                      <button onClick={() => setTab('doctors')} className="text-xs font-semibold text-violet-600 hover:text-violet-700">Ver todos →</button>
                    </div>
                    <div className="space-y-3">
                      {doctors.slice(0, 5).map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold shrink-0">
                            {doc.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{doc.full_name}</p>
                            <p className="text-xs text-slate-400">{doc.specialty || 'Sin especialidad'}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${doc.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            {doc.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      ))}
                      {doctors.length === 0 && (
                        <div className="text-center py-8 text-slate-400">
                          <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <p className="text-sm">Aún no tienes doctores registrados</p>
                          <button onClick={() => setTab('doctors')} className="text-xs text-violet-600 font-semibold mt-2">Invitar doctores →</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Doctors tab */}
              {tab === 'doctors' && (
                <div className="space-y-6">
                  {/* Invite doctor */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-sm font-bold text-slate-800 mb-3">Invitar doctor a la clínica</p>
                    <form onSubmit={handleInviteDoctor} className="flex gap-3 items-end flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={e => setInviteEmail(e.target.value)}
                          placeholder="email@doctor.com"
                          className={fi}
                          required
                        />
                      </div>
                      <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as 'doctor' | 'asistente')}
                        className={fi + ' min-w-[140px]'}
                      >
                        <option value="doctor">Doctor</option>
                        <option value="asistente">Asistente</option>
                      </select>
                      <button type="submit" disabled={inviting} className="g-clinic px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2 shrink-0">
                        <UserPlus className="w-4 h-4" /> {inviting ? 'Enviando...' : 'Invitar'}
                      </button>
                    </form>
                    {inviteSuccess && (
                      <p className={`text-xs mt-2 ${inviteSuccess.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{inviteSuccess}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">El doctor/asistente recibirá un email para unirse a tu clínica. Máximo {clinic.max_doctors} doctores.</p>
                  </div>

                  {/* Doctor list */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <p className="text-sm font-bold text-slate-800">Doctores ({doctors.length}/{clinic.max_doctors})</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {doctors.map(doc => (
                        <div key={doc.id} className="px-5 py-4 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-sm font-bold shrink-0">
                            {doc.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{doc.full_name}</p>
                            <p className="text-xs text-slate-400">{doc.specialty || 'Sin especialidad'} · {doc.email}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            doc.clinic_role === 'admin' ? 'bg-violet-50 text-violet-600' : 'bg-slate-50 text-slate-600'
                          }`}>
                            {doc.clinic_role === 'admin' ? 'Admin' : doc.clinic_role === 'asistente' ? 'Asistente' : 'Doctor'}
                          </span>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${doc.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                            {doc.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                          <button
                            onClick={() => handleRemoveDoctor(doc.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                      {doctors.length === 0 && (
                        <div className="px-5 py-12 text-center text-slate-400">
                          <UserPlus className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                          <p className="text-sm font-medium">No hay doctores aún</p>
                          <p className="text-xs mt-1">Invita a tu primer doctor usando el formulario de arriba.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Agenda tab */}
              {tab === 'agenda' && (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                  <h3 className="text-lg font-bold text-slate-700 mb-2">Agenda Consolidada</h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">
                    Aquí podrás ver las agendas de todos tus doctores en una vista unificada.
                    Cada doctor gestiona su propia agenda, y tú ves todo en un solo lugar.
                  </p>
                  <p className="text-xs text-slate-400 mt-4">Disponible próximamente</p>
                </div>
              )}

              {/* Settings tab */}
              {tab === 'settings' && (
                <div className="space-y-6">
                  {/* Logo upload */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-sm font-bold text-slate-800 mb-4">Logo de la clínica</p>
                    <div className="flex items-center gap-6">
                      <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {currentLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={currentLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <Building2 className="w-8 h-8 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="block px-4 py-2.5 rounded-lg border-2 border-dashed border-slate-300 text-center cursor-pointer hover:border-violet-400 transition-colors">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            disabled={uploadingLogo}
                            className="hidden"
                          />
                          <p className="text-sm font-semibold text-slate-600">{uploadingLogo ? 'Subiendo...' : 'Cambiar logo'}</p>
                          <p className="text-xs text-slate-400 mt-1">PNG, JPG o GIF</p>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Settings form */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-bold text-slate-800">Información de la clínica</p>
                      {!editingSettings && (
                        <button
                          onClick={() => setEditingSettings(true)}
                          className="text-xs font-semibold text-violet-600 hover:text-violet-700"
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    {editingSettings ? (
                      <form onSubmit={handleSaveSettings} className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre *</label>
                          <input
                            type="text"
                            value={settingsForm.name}
                            onChange={e => setSettingsForm(p => ({ ...p, name: e.target.value }))}
                            className={fi}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">Dirección</label>
                          <input
                            type="text"
                            value={settingsForm.address}
                            onChange={e => setSettingsForm(p => ({ ...p, address: e.target.value }))}
                            placeholder="Torre Médica, Piso 3, Local 301"
                            className={fi}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Ciudad</label>
                            <input
                              type="text"
                              value={settingsForm.city}
                              onChange={e => setSettingsForm(p => ({ ...p, city: e.target.value }))}
                              placeholder="Caracas"
                              className={fi}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Estado</label>
                            <input
                              type="text"
                              value={settingsForm.state}
                              onChange={e => setSettingsForm(p => ({ ...p, state: e.target.value }))}
                              placeholder="Distrito Capital"
                              className={fi}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Teléfono</label>
                            <input
                              type="tel"
                              value={settingsForm.phone}
                              onChange={e => setSettingsForm(p => ({ ...p, phone: e.target.value }))}
                              placeholder="+58 212 1234567"
                              className={fi}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                            <input
                              type="email"
                              value={settingsForm.email}
                              onChange={e => setSettingsForm(p => ({ ...p, email: e.target.value }))}
                              placeholder="contacto@clinica.com"
                              className={fi}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={uploadingLogo}
                            className="flex-1 g-clinic px-4 py-2.5 rounded-lg text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                          >
                            {uploadingLogo ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSettings(false)}
                            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-slate-600 bg-slate-50 hover:bg-slate-100"
                          >
                            Cancelar
                          </button>
                        </div>
                        {inviteSuccess && (
                          <p className={`text-xs ${inviteSuccess.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{inviteSuccess}</p>
                        )}
                      </form>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                          <p className="text-sm font-semibold text-slate-900">{clinic.name}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Plan</label>
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-violet-50 text-violet-600">Centro de Salud · $100/mes</span>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                          <p className="text-sm text-slate-600">{clinic.address || 'No configurada'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Ubicación</label>
                          <p className="text-sm text-slate-600">{[clinic.city, clinic.state].filter(Boolean).join(', ') || 'No configurada'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                          <p className="text-sm text-slate-600">{clinic.phone || 'No configurado'}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Estado suscripción</label>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                            clinic.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {clinic.subscription_status === 'active' ? 'Activa' : clinic.subscription_status === 'trial' ? 'Trial' : 'Suspendida'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-sm font-bold text-slate-800 mb-2">Link de booking público</p>
                    <p className="text-xs text-slate-400 mb-3">Los pacientes pueden agendar directamente con cualquier doctor de tu clínica.</p>
                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                      <code className="text-xs text-slate-600 flex-1 truncate">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/clinic/{clinic.slug || clinic.id}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/clinic/${clinic.slug || clinic.id}`)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <Copy className="w-4 h-4 text-slate-500" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

// Clinic setup component for new users
function ClinicSetup({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', phone: '', email: '', specialty: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 bg-white transition-colors'

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setCreating(true); setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

    const { data: clinic, error: cErr } = await supabase
      .from('clinics')
      .insert({
        name: form.name.trim(),
        slug,
        owner_id: user.id,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        phone: form.phone || null,
        email: form.email || user.email,
        specialty: form.specialty || null,
        subscription_plan: 'centro_salud',
        subscription_status: 'trial',
      })
      .select('id')
      .single()

    if (cErr || !clinic) {
      setError(cErr?.message || 'Error al crear clínica')
      setCreating(false)
      return
    }

    // Link user profile to clinic as admin
    await supabase.from('profiles').update({
      clinic_id: clinic.id,
      clinic_role: 'admin',
    }).eq('id', user.id)

    setCreating(false)
    onCreated()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .g-clinic { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); }
      `}</style>
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl g-clinic flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-200">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Registra tu Centro de Salud</h1>
          <p className="text-sm text-slate-500 mt-2">Configura tu clínica y comienza a agregar doctores</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre de la clínica *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Centro Médico Delta" className={fi} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Especialidad principal</label>
            <input value={form.specialty} onChange={e => setForm(p => ({ ...p, specialty: e.target.value }))} placeholder="Ej: Odontología, Medicina General, Multiespecialidad" className={fi} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
            <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Torre Médica, Piso 3, Local 301" className={fi} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ciudad</label>
              <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Caracas" className={fi} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
              <input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} placeholder="Distrito Capital" className={fi} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+58 212 1234567" className={fi} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="contacto@clinica.com" className={fi} />
            </div>
          </div>
          <button type="submit" disabled={creating} className="w-full g-clinic py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
            {creating ? 'Creando...' : 'Crear Centro de Salud'}
          </button>
          <p className="text-xs text-slate-400 text-center">Plan Centro de Salud · $100 USD/mes · Hasta 10 doctores · 30 días de prueba gratis</p>
        </form>
      </div>
    </div>
  )
}
