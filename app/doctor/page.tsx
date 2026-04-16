'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Calendar, FileText, TrendingUp,
  Bell, DollarSign, ArrowRight, Activity,
  CheckCircle, Clock, AlertCircle
} from 'lucide-react'
import Link from 'next/link'

type Profile = {
  full_name: string
  specialty: string | null
  email: string
}

type Subscription = {
  plan: string
  status: string
  expires_at: string | null
}

export default function DoctorDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, specialty, email')
        .eq('id', user.id)
        .single()

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status, expires_at')
        .eq('doctor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      setProfile(prof)
      setSubscription(sub)
      setLoading(false)
    }
    fetchData()
  }, [])

  const daysLeft = subscription?.expires_at
    ? Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const quickLinks = [
    { label: 'Mis Pacientes', icon: Users, href: '/doctor/patients', color: 'bg-teal-50 text-teal-600', desc: 'Gestiona tu lista de pacientes' },
    { label: 'Agenda', icon: Calendar, href: '/doctor/agenda', color: 'bg-blue-50 text-blue-600', desc: 'Citas del día y semana' },
    { label: 'CRM Leads', icon: TrendingUp, href: '/doctor/crm', color: 'bg-violet-50 text-violet-600', desc: 'Leads de WhatsApp e Instagram' },
    { label: 'Historial Clínico', icon: FileText, href: '/doctor/patients', color: 'bg-emerald-50 text-emerald-600', desc: 'Expedientes y prescripciones' },
    { label: 'Recordatorios', icon: Bell, href: '/doctor/reminders', color: 'bg-amber-50 text-amber-600', desc: 'Notificaciones a pacientes' },
    { label: 'Finanzas', icon: DollarSign, href: '/doctor/finances', color: 'bg-rose-50 text-rose-600', desc: 'Ingresos y cobros' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Cargando tu portal...</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .g-bg { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 50%, #0e7490 100%); }
        .g-text { background: linear-gradient(135deg, #00C4CC, #0891b2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card-hover { transition: all 0.2s; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); }
      `}</style>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Subscription banner */}
        {subscription && daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
          <div className={`rounded-xl px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 border ${daysLeft <= 3 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <AlertCircle className={`w-5 h-5 shrink-0 ${daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`} />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${daysLeft <= 3 ? 'text-red-700' : 'text-amber-700'}`}>
                Tu suscripción vence en {daysLeft} día{daysLeft !== 1 ? 's' : ''}
              </p>
              <p className={`text-xs mt-0.5 ${daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`}>
                Renueva tu plan para mantener el acceso sin interrupciones.
              </p>
            </div>
            <Link
              href="/register?plan=pro"
              className="text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 px-3 sm:px-4 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Renovar
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-slate-500 text-sm">{greeting()},</p>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
              {profile?.full_name ? `Dr. ${profile.full_name}` : 'Bienvenido'}
            </h1>
            {profile?.specialty && (
              <p className="text-slate-400 text-sm mt-1">{profile.specialty}</p>
            )}
          </div>

          {/* Subscription badge */}
          {subscription && (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 shrink-0">
              {subscription.status === 'trial' || subscription.status === 'active' ? (
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              ) : (
                <Clock className="w-4 h-4 text-amber-400" />
              )}
              <div>
                <p className="text-xs font-semibold text-slate-700 capitalize">
                  Plan {subscription.plan === 'pro' ? 'Pro' : 'Free'}
                </p>
                <p className="text-[10px] text-slate-400 capitalize">
                  {subscription.status === 'trial' ? 'Período de prueba' :
                   subscription.status === 'active' ? 'Activo' :
                   subscription.status === 'pending_payment' ? 'Pago pendiente' : subscription.status}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Hero welcome card */}
        <div className="g-bg rounded-2xl p-7 relative overflow-hidden text-white">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-24 h-24 rounded-full bg-cyan-400/20 blur-xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-white/80" />
              <span className="text-white/80 text-sm font-medium">Delta Medical CRM</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              Tu portal médico está listo
            </h2>
            <p className="text-white/70 text-sm max-w-lg">
              Gestiona pacientes, agenda citas, lleva historial clínico y controla tus finanzas, todo desde un solo lugar.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-5">
              <Link
                href="/doctor/patients"
                className="flex items-center justify-center sm:justify-start gap-2 bg-white text-teal-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
              >
                <Users className="w-4 h-4" />
                <span>Ver Pacientes</span>
              </Link>
              <Link
                href="/doctor/agenda"
                className="flex items-center justify-center sm:justify-start gap-2 bg-white/20 backdrop-blur text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/30 transition-colors border border-white/30"
              >
                <Calendar className="w-4 h-4" />
                <span>Ver Agenda</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Quick access grid */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Acceso rápido
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {quickLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="card-hover bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3"
              >
                <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span>Abrir</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Coming soon notice */}
        <div className="bg-slate-100 border border-slate-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center shrink-0 mt-0.5">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Estamos construyendo tu portal</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Las secciones de CRM, Historial Clínico, Finanzas y más están en desarrollo activo. Pronto tendrás acceso completo a todas las funcionalidades de Delta Medical CRM.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
