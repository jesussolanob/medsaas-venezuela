'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  ArrowRight, Check, Star, Users, CalendarDays,
  MessageCircle, Brain, Banknote, Bell, BarChart3, ChevronRight,
  Shield, Zap, Heart, Menu, X, Activity, Target, Clock,
  UserCheck, RefreshCcw, ThumbsUp, CheckCircle2, Sparkles,
  Building2, PhoneCall, Mail, FileText,
} from 'lucide-react'

const NAV_LINKS = [
  { label: 'Producto', href: '#features' },
  { label: 'Métricas', href: '#metrics' },
  { label: 'Especialistas', href: '#testimonials' },
  { label: 'Precios', href: '#pricing' },
]

const METRICS = [
  { icon: RefreshCcw, label: 'Retención de Pacientes', target: '≥ 75%', description: 'El porcentaje de pacientes que regresan. Una retención baja indica problemas en la experiencia del consultorio.', color: 'bg-cyan-50', iconColor: 'text-cyan-500', ring: 'hover:ring-cyan-200' },
  { icon: CalendarDays, label: 'Tasa de No-Show', target: '< 10%', description: 'Citas sin asistencia ni aviso. Cada no-show es ingreso perdido. Los recordatorios automáticos lo reducen hasta un 80%.', color: 'bg-rose-50', iconColor: 'text-rose-500', ring: 'hover:ring-rose-200' },
  { icon: Banknote, label: 'Ingresos Mensuales', target: 'Meta creciente', description: 'Control total de cobros en USD, Bs. y Pago Móvil. Visualiza tendencias y detecta meses de baja demanda.', color: 'bg-emerald-50', iconColor: 'text-emerald-500', ring: 'hover:ring-emerald-200' },
  { icon: Clock, label: 'Velocidad de Respuesta', target: '< 2 horas', description: 'El tiempo en responder un lead de WhatsApp. Responder rápido aumenta la conversión en un 60%.', color: 'bg-amber-50', iconColor: 'text-amber-500', ring: 'hover:ring-amber-200' },
  { icon: ThumbsUp, label: 'Satisfacción (NPS)', target: '≥ 70 pts', description: 'Net Promoter Score de tus pacientes. Un NPS alto genera crecimiento orgánico por recomendaciones.', color: 'bg-violet-50', iconColor: 'text-violet-500', ring: 'hover:ring-violet-200' },
  { icon: Target, label: 'Citas Completadas', target: '≥ 85%', description: 'Ratio citas completadas vs agendadas. Optimiza tu agenda con listas de espera y bloqueos automáticos.', color: 'bg-blue-50', iconColor: 'text-blue-500', ring: 'hover:ring-blue-200' },
]

const TESTIMONIALS = [
  { name: 'Dr. Carlos Ramírez', role: 'Cardiólogo · Caracas', avatar: 'CR', text: 'Mis no-shows bajaron del 28% a solo 4% en el primer mes. Los recordatorios automáticos de WhatsApp funcionan increíblemente bien.', metric: '−85% No-Shows', metricColor: 'text-emerald-600 bg-emerald-50' },
  { name: 'Dra. María González', role: 'Ginecóloga · Maracaibo', avatar: 'MG', text: 'Tener la agenda y los recordatorios automáticos me cambió la vida. Ahorro casi 2 horas diarias que ahora dedico a mi familia.', metric: '+2h/día libres', metricColor: 'text-cyan-600 bg-cyan-50' },
  { name: 'Dr. Alejandro Méndez', role: 'Internista · Valencia', avatar: 'AM', text: 'Pasé de 40 a 72 consultas al mes en 3 meses. El CRM de leads de WhatsApp convierte conversaciones en citas reales.', metric: '+80% Consultas', metricColor: 'text-violet-600 bg-violet-50' },
]

const TRIAL_FEATURES = ['30 días de prueba completa','Hasta 50 pacientes','Agenda básica','Recordatorios automáticos','CRM de leads (limitado)','Soporte por email']
const BASIC_FEATURES = ['Pacientes ilimitados','Agenda inteligente','Recordatorios automáticos','Control financiero básico','Soporte por email']
const PROFESSIONAL_FEATURES = ['Pacientes ilimitados','CRM de leads dinámico','Historial clínico digital','Portal del paciente','Recordatorios personalizados','Gestión financiera completa','Múltiples métodos de pago','Soporte prioritario WhatsApp']
const CLINIC_FEATURES = ['Todo del Plan Profesional incluido','Hasta 10 doctores por clínica','Panel de administración centralizado','Agenda de todos los doctores','Paciente elige doctor disponible','Reportes financieros consolidados','Roles: admin clínica + doctores','Marca personalizada (logo, colores)','Booking público multi-doctor','Soporte VIP dedicado']

interface Promotion {
  id: string
  plan_key: string
  duration_months: number
  original_price_usd: number
  promo_price_usd: number
  label: string
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [promotions, setPromotions] = useState<Promotion[]>([])

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    fetch('/api/promotions')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPromotions(data) })
      .catch(() => {})
  }, [])

  const getPromo = (planKey: string) => promotions.find(p => p.plan_key === planKey)

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        .g-text{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}
        .lift{transition:transform .22s ease,box-shadow .22s ease}
        .lift:hover{transform:translateY(-5px);box-shadow:0 20px 48px rgba(0,196,204,.13),0 6px 12px rgba(0,0,0,.04)}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes float2{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.15)}}
        .anim-f1{animation:float 7s ease-in-out infinite}
        .anim-f2{animation:float2 7s ease-in-out 2.5s infinite}
        .anim-fu{animation:fadeUp .65s ease both}
        .anim-fu1{animation:fadeUp .65s .12s ease both}
        .anim-fu2{animation:fadeUp .65s .24s ease both}
        .anim-fu3{animation:fadeUp .65s .36s ease both}
        .dot-p{animation:pulseDot 2.2s ease infinite}
      `}</style>

      {/* NAVBAR */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-xl border-b border-slate-100 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform g-bg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="leading-none">
              <span className="font-bold text-lg text-slate-900 tracking-tight">Delta</span>
              <span className="text-[10px] text-slate-400 block font-semibold tracking-[0.15em] uppercase">Medical CRM</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">{l.label}</a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg hover:bg-slate-100 transition-all">
              Soy doctor
            </Link>
            <Link href="/patient/login" className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg hover:bg-slate-100 transition-all">
              Soy paciente
            </Link>
            <Link href="/register?plan=basic" className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all hover:opacity-90 active:scale-95 shadow-lg shadow-cyan-500/25 g-bg">
              Prueba gratis
            </Link>
          </div>

          <button className="md:hidden p-2 rounded-lg hover:bg-slate-100" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-2">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)} className="block text-sm font-medium text-slate-600 py-2">{l.label}</a>
            ))}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2 mt-2">
              <Link href="/login" className="text-center text-sm font-semibold text-slate-600 py-2.5 border border-slate-200 rounded-xl">Soy doctor</Link>
              <Link href="/patient/login" className="text-center text-sm font-semibold text-slate-600 py-2.5 border border-slate-200 rounded-xl">Soy paciente</Link>
              <Link href="/register?plan=basic" className="text-center text-sm font-semibold text-white py-2.5 rounded-xl g-bg">Prueba gratis — 30 días</Link>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[600px] pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,196,204,0.09) 0%, transparent 70%)' }} />
        <div className="absolute top-32 left-[15%] w-72 h-72 rounded-full blur-3xl opacity-15 pointer-events-none" style={{ background: '#00C4CC' }} />

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="anim-fu inline-flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm">
              <span className="w-2 h-2 rounded-full dot-p" style={{ background: '#00C4CC' }} />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">CRM Médico para Venezuela</span>
            </div>

            <h1 className="anim-fu1 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              El CRM que <span className="g-text">transforma</span><br />tu consulta
            </h1>

            <p className="anim-fu2 text-xl text-slate-500 leading-relaxed max-w-lg font-medium">
              Gestiona pacientes, leads de WhatsApp, agenda e historial clínico — todo desde un solo lugar diseñado para especialistas venezolanos.
            </p>

            <div className="anim-fu3 flex flex-col sm:flex-row gap-4">
              <Link href="/register?plan=basic" className="group flex items-center justify-center gap-2 text-white font-semibold px-7 py-4 rounded-2xl text-base transition-all hover:opacity-90 active:scale-95 shadow-xl shadow-cyan-500/30 g-bg">
                Comenzar gratis <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/register?plan=professional" className="group flex items-center justify-center gap-2 font-semibold px-7 py-4 rounded-2xl text-base border-2 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all text-slate-700">
                Ver Plan Profesional · $30/mes <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <p className="text-sm text-slate-500">¿Eres paciente? <Link href="/patient/login" className="font-semibold text-teal-500 hover:text-teal-600 transition-colors">Ver mis citas y recetas →</Link></p>

            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {['CR','MG','AM','JL','SR'].map((init, i) => (
                  <div key={i} className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold" style={{ background: `hsl(${180+i*18},60%,42%)` }}>{init[0]}</div>
                ))}
              </div>
              <div>
                <div className="flex">{[1,2,3,4,5].map(i=><Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}</div>
                <p className="text-xs text-slate-500 font-medium">+50 médicos activos en Venezuela</p>
              </div>
            </div>
          </div>

          {/* Dashboard Mockup */}
          <div className="relative hidden lg:block">
            <div className="anim-f1">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/80 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Buenos días, Dr. Ramírez</p>
                    <p className="text-lg font-bold text-slate-900">Panel del día</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,196,204,0.1)' }}>
                    <Activity className="w-5 h-5" style={{ color: '#00C4CC' }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[{l:'Citas hoy',v:'12',d:'+2'},{l:'Leads nuevos',v:'8',d:'+5'},{l:'No-shows',v:'1',d:'−3'}].map(k=>(
                    <div key={k.l} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 font-medium mb-1">{k.l}</p>
                      <p className="text-2xl font-bold text-slate-900">{k.v}</p>
                      <span className="text-xs font-semibold text-emerald-600">{k.d}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-cyan-100" style={{ background: 'rgba(0,196,204,0.06)' }}>
                  <div className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style={{ background: '#00C4CC' }}>ML</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">María López</p>
                    <p className="text-xs text-slate-500 truncate">WhatsApp · Hace 5 min · Consulta cardiológica</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(0,196,204,0.15)', color: '#00C4CC' }}>HOT</span>
                </div>
                <div className="space-y-2">
                  {[{t:'09:00',n:'Juan Pérez',ty:'Consulta'},{t:'10:30',n:'Ana Soto',ty:'Control'},{t:'11:00',n:'Pedro Gil',ty:'Ecocardiograma'}].map(a=>(
                    <div key={a.t} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                      <span className="text-xs font-semibold text-slate-400 w-10 shrink-0">{a.t}</span>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#00C4CC' }} />
                      <span className="text-sm font-medium text-slate-700 flex-1">{a.n}</span>
                      <span className="text-xs text-slate-400">{a.ty}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="anim-f2 absolute -left-10 top-1/3 bg-white rounded-2xl shadow-xl border border-slate-100 p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
              <div><p className="text-xs font-bold text-slate-900">Récipe generado</p><p className="text-xs text-slate-400">Hace 2 minutos</p></div>
            </div>
            <div className="anim-f1 absolute -right-6 bottom-24 bg-white rounded-2xl shadow-xl border border-slate-100 p-4">
              <p className="text-xs text-slate-400 font-medium mb-1">Satisfacción NPS</p>
              <p className="text-2xl font-extrabold" style={{ color: '#00C4CC' }}>82</p>
              <p className="text-xs text-emerald-600 font-bold">↑ +7 este mes</p>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="py-10 border-y border-slate-100 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Médicos que confían en Delta</p>
          <div className="flex flex-wrap justify-center gap-5">
            {['Cardiólogos · Caracas','Ginecólogos · Maracaibo','Internistas · Valencia','Dermatólogos · Barquisimeto','Pediatras · Mérida'].map(s=>(
              <span key={s} className="flex items-center gap-2 text-sm font-medium text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00C4CC' }} />{s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* MÉTRICAS */}
      <section className="py-24 px-6" id="metrics">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <BarChart3 className="w-3.5 h-3.5" /> Métricas clave
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              Indicadores que tu consulta <span className="g-text">debe controlar</span>
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">Los médicos más exitosos no trabajan más — trabajan con datos. Delta te ayuda a monitorear estas 6 métricas críticas.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {METRICS.map(m => (
              <div key={m.label} className={`lift bg-white rounded-2xl border border-slate-200 p-6 space-y-4 ring-1 ring-transparent ${m.ring}`}>
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl ${m.color} flex items-center justify-center`}><m.icon className={`w-5 h-5 ${m.iconColor}`} /></div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">{m.target}</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">{m.label}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{m.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 px-6 bg-slate-50" id="features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <Sparkles className="w-3.5 h-3.5" /> El producto
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Todo en un solo lugar</h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto font-medium">Desde el primer mensaje de WhatsApp hasta el récipe final — Delta lo gestiona todo.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <div className="md:col-span-2 rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden lift cursor-pointer" style={{ background: '#00C4CC', minHeight: 220 }}>
              <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-15 bg-white" />
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-4"><MessageCircle className="w-5 h-5 text-white" /></div>
              <div>
                <span className="text-xs font-bold text-white/60 uppercase tracking-widest">CRM</span>
                <h3 className="text-2xl font-bold text-white mt-1 mb-2">CRM de Leads Dinámico</h3>
                <p className="text-white/80 text-sm leading-relaxed max-w-md">Clasifica leads de WhatsApp e Instagram en <strong className="text-white">Hot</strong> (&lt;7d), <strong className="text-white">Cold</strong> (&gt;7d) y <strong className="text-white">Clientes</strong>. Seguimiento completo desde el primer mensaje hasta la cita.</p>
              </div>
            </div>

            <div className="rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden lift cursor-pointer bg-slate-900" style={{ minHeight: 220 }}>
              <div className="absolute -right-4 -bottom-4 opacity-10"><FileText className="w-32 h-32 text-cyan-400" /></div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-4"><FileText className="w-5 h-5 text-cyan-400" /></div>
              <div>
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Historial</span>
                <h3 className="text-xl font-bold text-white mt-1 mb-2">Historial Clínico Digital</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Acceso seguro a la historia de cada paciente, diagnósticos, tratamientos y notas clínicas.</p>
              </div>
            </div>

            {[
              { icon: CalendarDays, tag: 'Agenda', title: 'Agenda Inteligente', desc: 'Bloqueos automáticos según tu horario. Visualiza disponibilidad y evita doble-booking.' },
              { icon: Bell, tag: 'Automatización', title: 'Recordatorios Inteligentes', desc: 'WhatsApp y email automáticos a las 24h, 3h y 1h antes. Reduce el no-show hasta un 80%.' },
              { icon: Banknote, tag: 'Finanzas', title: 'Gestión Financiera', desc: 'Cobros en USD, Bs. y Pago Móvil. Informes de ingresos mensuales.' },
            ].map(f => (
              <div key={f.title} className="bg-white rounded-3xl p-7 flex flex-col justify-between lift cursor-pointer border border-slate-200 hover:border-cyan-200" style={{ minHeight: 200 }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(0,196,204,0.1)' }}>
                  <f.icon className="w-5 h-5" style={{ color: '#00C4CC' }} />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#00C4CC' }}>{f.tag}</span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 mb-1.5">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}

            <div className="md:col-span-2 bg-white rounded-3xl p-8 flex items-center gap-8 lift cursor-pointer border border-slate-200 hover:border-cyan-200" style={{ minHeight: 200 }}>
              <div className="flex-1">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(0,196,204,0.1)' }}><BarChart3 className="w-5 h-5" style={{ color: '#00C4CC' }} /></div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#00C4CC' }}>Reportes</span>
                <h3 className="text-xl font-bold text-slate-900 mt-1 mb-2">Reportes e Informes</h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-sm">Panel de administración con KPIs en tiempo real. Visualiza consultas completadas, ingresos, no-shows y tendencias mensuales.</p>
              </div>
              <div className="hidden sm:flex flex-col gap-2 shrink-0 w-32">
                {[85,62,91,48,73].map((v,i)=>(
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${v}%`, background: '#00C4CC' }} />
                    </div>
                    <span className="text-xs text-slate-400 w-7 text-right">{v}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* NexHealth-inspired features row */}
            {[
              { icon: Users, tag: 'Pacientes', title: 'Portal del Paciente', desc: 'Tus pacientes acceden a sus citas, recetas y datos clínicos. Todo organizado y accesible desde cualquier dispositivo.' },
              { icon: FileText, tag: 'Recetas', title: 'Récipes y Documentos', desc: 'Genera récipes médicos digitales para tus pacientes. Control completo de prescripciones con historial accesible.' },
              { icon: Building2, tag: 'Clínicas', title: 'Multi-Doctor para Clínicas', desc: 'Plan Centro de Salud: registra tu clínica, agrega doctores, y gestiona suscripciones desde un panel centralizado.' },
            ].map(f => (
              <div key={f.title} className="bg-white rounded-3xl p-7 flex flex-col justify-between lift cursor-pointer border border-slate-200 hover:border-cyan-200" style={{ minHeight: 200 }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,196,204,0.1)' }}>
                    <f.icon className="w-5 h-5" style={{ color: '#00C4CC' }} />
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 uppercase tracking-widest">{f.tag}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1 mb-1.5">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* QUIÉNES SOMOS */}
      <section className="py-24 px-6" id="about">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <Heart className="w-3.5 h-3.5" /> Quiénes somos
            </div>
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Construido por y para el ecosistema médico venezolano</h2>
            <p className="text-lg text-slate-500 leading-relaxed font-medium">Delta nació de la frustración de ver consultorios llenos de post-its y WhatsApp desbordado. Somos un equipo venezolano que entiende la realidad local: pagos en USD, Pago Móvil, pacientes que se comunican por Instagram.</p>
            <p className="text-base text-slate-500 leading-relaxed">Nuestra misión es darte la tecnología que usan las grandes clínicas privadas, adaptada al presupuesto del especialista venezolano independiente.</p>
            <div className="grid grid-cols-3 gap-4 pt-2">
              {[{v:'+50',l:'Médicos activos'},{v:'+2k',l:'Citas gestionadas'},{v:'−75%',l:'Menos no-shows'}].map(s=>(
                <div key={s.l} className="text-center p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-2xl font-extrabold" style={{ color: '#00C4CC' }}>{s.v}</p>
                  <p className="text-xs text-slate-500 font-medium mt-1">{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[
              { icon: Shield, title: 'Privacidad médica garantizada', desc: 'Datos con encriptación de nivel hospitalario. Row-Level Security activo para aislamiento total por consultorio.', color: 'bg-blue-50', ic: 'text-blue-500' },
              { icon: Zap, title: 'Automatización que ahorra tiempo real', desc: 'Cada flujo fue diseñado para reducir el trabajo administrativo. Los médicos reportan ahorrar entre 1.5 y 3 horas diarias.', color: 'bg-amber-50', ic: 'text-amber-500' },
              { icon: Building2, title: 'Adaptado a Venezuela', desc: 'Pago Móvil, transferencias, USD, Bs. Nada de tarjetas internacionales que no funcionan aquí.', color: 'bg-cyan-50', ic: 'text-cyan-500' },
              { icon: Users, title: 'Soporte con personas reales', desc: 'Equipo venezolano disponible por WhatsApp. Sin bots, sin tickets, sin esperas de 48 horas.', color: 'bg-emerald-50', ic: 'text-emerald-500' },
            ].map(v=>(
              <div key={v.title} className="flex gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                <div className={`w-10 h-10 rounded-xl ${v.color} flex items-center justify-center shrink-0`}><v.icon className={`w-5 h-5 ${v.ic}`} /></div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">{v.title}</h4>
                  <p className="text-sm text-slate-500 leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARACIÓN */}
      <section className="py-24 px-6" id="comparison">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <BarChart3 className="w-3.5 h-3.5" /> Comparación
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              ¿Por qué <span className="g-text">Delta</span>?
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">Compara cómo Delta transforma tu consulta frente a las herramientas que probablemente estés usando hoy.</p>
          </div>

          <div className="overflow-x-auto">
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden min-w-full">
              {/* Header */}
              <div className="grid grid-cols-4 gap-0">
                <div className="p-6 bg-slate-50 border-r border-slate-200 col-span-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Característica</p>
                </div>
                <div className="p-6 border-r border-slate-200 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center mb-2 shrink-0">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 text-center">Delta Medical CRM</p>
                  <p className="text-xs text-teal-600 font-semibold mt-1">Desde $20/mes</p>
                </div>
                <div className="p-6 border-r border-slate-200 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2 shrink-0">
                    <BarChart3 className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 text-center">Excel en consultorio</p>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Gratis</p>
                </div>
                <div className="p-6 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2 shrink-0">
                    <FileText className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 text-center">Registro manual</p>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Cuaderno</p>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-200">
                {[
                  { feature: 'Agenda inteligente con bloqueo automático', delta: true, excel: false, manual: false },
                  { feature: 'Recordatorios automáticos por WhatsApp', delta: true, excel: false, manual: false },
                  { feature: 'Historial clínico digital seguro', delta: true, excel: 'partial', manual: false },
                  { feature: 'Control financiero en USD y Bs', delta: true, excel: 'partial', manual: false },
                  { feature: 'Portal del paciente', delta: true, excel: false, manual: false },
                  { feature: 'Acceso desde cualquier dispositivo', delta: true, excel: false, manual: false },
                  { feature: 'CRM de leads y seguimiento', delta: true, excel: false, manual: false },
                  { feature: 'Recetas e informes digitales', delta: true, excel: false, manual: false },
                  { feature: 'Económico (desde $20/mes)', delta: true, excel: true, manual: true },
                  { feature: 'Sin instalación, en la nube', delta: true, excel: false, manual: false },
                ].map((row, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-0">
                    <div className="p-6 bg-slate-50 border-r border-slate-200 col-span-1 flex items-center">
                      <p className="text-sm font-medium text-slate-700">{row.feature}</p>
                    </div>
                    <div className="p-6 border-r border-slate-200 flex items-center justify-center">
                      {row.delta ? (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100">
                          <Check className="w-5 h-5 text-teal-600" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200">
                          <span className="text-slate-400 text-lg font-bold">−</span>
                        </div>
                      )}
                    </div>
                    <div className="p-6 border-r border-slate-200 flex items-center justify-center">
                      {row.excel === true ? (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100">
                          <Check className="w-5 h-5 text-teal-600" strokeWidth={3} />
                        </div>
                      ) : row.excel === 'partial' ? (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100">
                          <span className="text-amber-600 text-lg font-bold">~</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200">
                          <span className="text-slate-400 text-lg font-bold">−</span>
                        </div>
                      )}
                    </div>
                    <div className="p-6 flex items-center justify-center">
                      {row.manual ? (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100">
                          <Check className="w-5 h-5 text-teal-600" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200">
                          <span className="text-slate-400 text-lg font-bold">−</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-slate-600 text-sm mb-4">Delta está diseñado específicamente para médicos especialistas. Comienza en 5 minutos.</p>
            <Link href="/register?plan=basic" className="inline-flex items-center justify-center gap-2 font-bold px-8 py-4 rounded-2xl text-base transition-all hover:opacity-90 active:scale-95 shadow-xl text-white g-bg">
              Prueba gratis — 30 días <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section className="py-24 px-6 bg-slate-50" id="testimonials">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <UserCheck className="w-3.5 h-3.5" /> Testimonios
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              Médicos que confían en <span className="g-text">Delta</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t=>(
              <div key={t.name} className="lift bg-white rounded-3xl border border-slate-200 p-8 flex flex-col gap-5">
                <div className="flex gap-1">{[1,2,3,4,5].map(i=><Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}</div>
                <p className="text-slate-600 leading-relaxed text-sm flex-1">&ldquo;{t.text}&rdquo;</p>
                <span className={`self-start text-xs font-bold px-3 py-1.5 rounded-full ${t.metricColor}`}>{t.metric}</span>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold g-bg">{t.avatar}</div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRECIOS */}
      <section className="py-24 px-6" id="pricing">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <Zap className="w-3.5 h-3.5" /> Planes y precios
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Simple y transparente</h2>
            <p className="text-lg text-slate-500 font-medium">Comienza gratis, escala cuando estés listo.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-5">
            {/* Trial */}
            <div className="bg-white rounded-3xl border-2 border-slate-200 p-7 flex flex-col gap-5">
              <div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Trial</p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-slate-900">$0</span>
                  <span className="text-slate-400 font-medium mb-1.5 text-sm">/ 30 días</span>
                </div>
                <p className="text-sm text-slate-500 mt-2">Prueba completa. Sin tarjeta.</p>
              </div>
              <ul className="space-y-2.5 flex-1">
                {TRIAL_FEATURES.map(f=>(
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-slate-400 shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <Link href="/register?plan=trial" className="block text-center font-semibold py-3 rounded-2xl border-2 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all text-slate-700 text-sm">
                Comenzar gratis →
              </Link>
            </div>

            {/* Basic */}
            <div className="bg-white rounded-3xl border-2 border-slate-200 p-7 flex flex-col gap-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#00C4CC' }}>Basic</p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-slate-900">$20</span>
                  <span className="text-slate-400 font-medium mb-1.5 text-sm">USD / mes</span>
                </div>
                <p className="text-sm text-slate-500 mt-2">Para el médico que inicia su digitalización.</p>
                {getPromo('basic') && (() => {
                  const p = getPromo('basic')!
                  const disc = Math.round(((p.original_price_usd - p.promo_price_usd) / p.original_price_usd) * 100)
                  return (
                    <div className="mt-3 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl p-3 border border-teal-200">
                      <p className="text-xs font-bold text-teal-700">{p.label || `Oferta ${p.duration_months} meses`}</p>
                      <p className="text-sm mt-0.5">
                        <span className="line-through text-slate-400">${p.original_price_usd}</span>{' '}
                        <span className="font-extrabold text-teal-600">${p.promo_price_usd} USD</span>{' '}
                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">-{disc}%</span>
                      </p>
                    </div>
                  )
                })()}
              </div>
              <ul className="space-y-2.5 flex-1">
                {BASIC_FEATURES.map(f=>(
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Check className="w-4 h-4 shrink-0" style={{ color: '#00C4CC' }} />{f}
                  </li>
                ))}
              </ul>
              <Link href="/register?plan=basic" className="block text-center font-semibold py-3 rounded-2xl border-2 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all text-slate-700 text-sm">
                Seleccionar Plan →
              </Link>
            </div>

            {/* Professional */}
            <div className="rounded-3xl p-7 flex flex-col gap-5 relative overflow-hidden" style={{ background: 'linear-gradient(145deg,#0f172a 0%,#1e293b 100%)' }}>
              <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10" style={{ background: '#00C4CC' }} />
              <div className="absolute top-5 right-5">
                <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: '#00C4CC' }}>Popular</span>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#00C4CC' }}>Professional</p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-white">$30</span>
                  <span className="text-slate-400 font-medium mb-1.5 text-sm">USD / mes</span>
                </div>
                <p className="text-sm text-slate-400 mt-2">Para el especialista independiente.</p>
                {getPromo('professional') && (() => {
                  const p = getPromo('professional')!
                  const disc = Math.round(((p.original_price_usd - p.promo_price_usd) / p.original_price_usd) * 100)
                  return (
                    <div className="mt-3 rounded-xl p-3 border border-cyan-700" style={{ background: 'rgba(0,196,204,0.1)' }}>
                      <p className="text-xs font-bold" style={{ color: '#00C4CC' }}>{p.label || `Oferta ${p.duration_months} meses`}</p>
                      <p className="text-sm mt-0.5">
                        <span className="line-through text-slate-500">${p.original_price_usd}</span>{' '}
                        <span className="font-extrabold text-white">${p.promo_price_usd} USD</span>{' '}
                        <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">-{disc}%</span>
                      </p>
                    </div>
                  )
                })()}
              </div>
              <ul className="space-y-2.5 flex-1">
                {PROFESSIONAL_FEATURES.map(f=>(
                  <li key={f} className="flex items-center gap-2.5 text-sm text-white">
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#00C4CC' }} />{f}
                  </li>
                ))}
              </ul>
              <Link href="/register?plan=professional" className="block text-center font-bold py-3 rounded-2xl text-sm text-white transition-all hover:opacity-90 active:scale-95 shadow-xl" style={{ background: '#00C4CC' }}>
                Obtener Plan Profesional →
              </Link>
            </div>

            {/* Centro de Salud */}
            <div className="rounded-3xl p-7 flex flex-col gap-5 relative overflow-hidden border-2 border-violet-300" style={{ background: 'linear-gradient(145deg,#1e1b4b 0%,#312e81 100%)' }}>
              <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10" style={{ background: '#8b5cf6' }} />
              <div className="absolute top-5 right-5">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-violet-500 text-white">Clínicas</span>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest mb-3 text-violet-400">Centro de Salud</p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-white">$100</span>
                  <span className="text-violet-300 font-medium mb-1.5 text-sm">USD / mes</span>
                </div>
                <p className="text-sm text-violet-300 mt-2">Para clínicas con múltiples doctores.</p>
                {getPromo('clinic') && (() => {
                  const p = getPromo('clinic')!
                  const disc = Math.round(((p.original_price_usd - p.promo_price_usd) / p.original_price_usd) * 100)
                  return (
                    <div className="mt-3 rounded-xl p-3 border border-violet-600" style={{ background: 'rgba(139,92,246,0.15)' }}>
                      <p className="text-xs font-bold text-violet-300">{p.label || `Oferta ${p.duration_months} meses`}</p>
                      <p className="text-sm mt-0.5">
                        <span className="line-through text-violet-400">${p.original_price_usd}</span>{' '}
                        <span className="font-extrabold text-white">${p.promo_price_usd} USD</span>{' '}
                        <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">-{disc}%</span>
                      </p>
                    </div>
                  )
                })()}
              </div>
              <ul className="space-y-2.5 flex-1">
                {CLINIC_FEATURES.map(f=>(
                  <li key={f} className="flex items-center gap-2.5 text-sm text-white">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-violet-400" />{f}
                  </li>
                ))}
              </ul>
              <Link href="/register?plan=clinic" className="block text-center font-bold py-3 rounded-2xl text-sm text-white transition-all hover:opacity-90 active:scale-95 shadow-xl bg-violet-500">
                Registrar mi clínica →
              </Link>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-sm text-slate-400">
            <span className="flex items-center gap-2"><Shield className="w-4 h-4" />Datos seguros</span>
            <span className="flex items-center gap-2"><PhoneCall className="w-4 h-4" />Pago Móvil disponible</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Sin permanencia</span>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[2.5rem] p-14 text-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)' }}>
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, #00C4CC, transparent)' }} />
            <div className="relative z-10 space-y-6">
              <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
                Digitaliza tu consulta <span className="g-text">hoy mismo</span>
              </h2>
              <p className="text-lg text-slate-400 font-medium max-w-lg mx-auto">Únete a los médicos venezolanos que transformaron su manera de trabajar. Empieza en 5 minutos.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link href="/register?plan=basic" className="group flex items-center justify-center gap-2 font-bold px-8 py-4 rounded-2xl text-base transition-all hover:opacity-90 active:scale-95 shadow-xl text-white g-bg">
                  Prueba gratis — 30 días <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/register?plan=clinic" className="flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-2xl text-base border border-violet-400/40 text-white hover:bg-violet-500/20 transition-all">
                  <Building2 className="w-4 h-4" /> Plan Clínicas · $100/mes
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center g-bg"><Activity className="w-5 h-5 text-white" /></div>
                <div>
                  <span className="font-bold text-lg text-slate-900 tracking-tight">Delta</span>
                  <span className="text-xs text-slate-400 block font-medium">Medical CRM</span>
                </div>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs">El ecosistema digital para médicos especialistas en Venezuela. CRM, agenda, historial clínico y finanzas en un solo lugar.</p>
              <a href="mailto:soporte@delta.ve" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"><Mail className="w-3.5 h-3.5" /> soporte@delta.ve</a>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Producto</h4>
              {['CRM de Leads','Agenda Médica','Historial Clínico','Recordatorios','Finanzas','Suscripciones'].map(item=>(
                <a key={item} href="#features" className="block text-sm text-slate-500 hover:text-slate-900 transition-colors">{item}</a>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Cuenta</h4>
              {[{label:'Iniciar sesión',href:'/login'},{label:'Prueba gratis',href:'/register?plan=trial'},{label:'Plan Profesional',href:'/register?plan=professional'}].map(item=>(
                <Link key={item.label} href={item.href} className="block text-sm text-slate-500 hover:text-slate-900 transition-colors">{item.label}</Link>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">© 2026 Delta Medical CRM · Desarrollado con ❤️ en Venezuela</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs text-slate-400 hover:text-slate-600">Privacidad</a>
              <a href="#" className="text-xs text-slate-400 hover:text-slate-600">Términos</a>
              <a href="#" className="text-xs text-slate-400 hover:text-slate-600">Seguridad</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
