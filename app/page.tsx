'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  ArrowRight, Check, Star, CalendarDays,
  Banknote, BarChart3, ChevronRight,
  Shield, Zap, Heart, Menu, X, Activity,
  UserCheck, CheckCircle2, Sparkles,
  PhoneCall, Mail, FileText, Stethoscope,
  ClipboardList, Users, Clock, TrendingUp,
} from 'lucide-react'

const NAV_LINKS = [
  { label: 'Producto', href: '#features' },
  { label: 'Beneficios', href: '#benefits' },
  { label: 'Precios', href: '#pricing' },
]

const FEATURES = [
  {
    icon: CalendarDays,
    tag: 'Agenda',
    title: 'Agenda Inteligente',
    desc: 'Configura tu disponibilidad, recibe citas online y apruébalas con un click. Sin doble-booking.',
    color: 'from-cyan-500 to-teal-500',
    bg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
  },
  {
    icon: ClipboardList,
    tag: 'Consultas',
    title: 'Consultas y EHR',
    desc: 'Registra consultas, diagnósticos, tratamientos y genera informes médicos digitales para tus pacientes.',
    color: 'from-violet-500 to-purple-500',
    bg: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
  {
    icon: Banknote,
    tag: 'Finanzas',
    title: 'Finanzas del Consultorio',
    desc: 'Controla ingresos por consultas aprobadas, registra gastos y ve tu balance real con gráficas dinámicas.',
    color: 'from-emerald-500 to-green-500',
    bg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  {
    icon: Users,
    tag: 'Pacientes',
    title: 'Portal del Paciente',
    desc: 'Tus pacientes acceden a sus citas e informes médicos desde su propio portal. Profesional y organizado.',
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
]

const BENEFITS = [
  { icon: Clock, title: 'Ahorra 2+ horas diarias', desc: 'Automatiza la gestión administrativa de tu consultorio. Más tiempo para tus pacientes.' },
  { icon: Shield, title: 'Datos seguros', desc: 'Encriptación de nivel hospitalario. Row-Level Security para aislamiento total por consultorio.' },
  { icon: Zap, title: 'Listo en 5 minutos', desc: 'Sin instalación, sin configuración compleja. Registra tu cuenta y comienza a usarlo.' },
  { icon: TrendingUp, title: 'Crece con datos', desc: 'Visualiza tus ingresos, gastos y balance. Toma decisiones con información real.' },
]

const BETA_FEATURES = [
  'Agenda inteligente con aprobaciones',
  'Gestión de pacientes completa',
  'Consultas médicas + EHR',
  'Informes médicos digitales',
  'Finanzas: ingresos, gastos, balance',
  'Portal del paciente',
  'Booking público por link',
  'Configuración de perfil y pagos',
  'Soporte directo por WhatsApp',
]

const PRO_FEATURES = [
  'Todo del plan Beta incluido',
  'Recordatorios automáticos WhatsApp',
  'CRM de leads y seguimiento',
  'Facturación con PDF',
  'Reportería avanzada con filtros',
  'Recetas en portal paciente',
  'Promociones y descuentos',
  'Mensajes doctor-paciente',
  'Soporte prioritario VIP',
]

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        .g-text{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}
        .lift{transition:transform .22s ease,box-shadow .22s ease}
        .lift:hover{transform:translateY(-5px);box-shadow:0 20px 48px rgba(0,196,204,.13),0 6px 12px rgba(0,0,0,.04)}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.15)}}
        .anim-f1{animation:float 7s ease-in-out infinite}
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
              Iniciar sesión
            </Link>
            <Link href="/register" className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all hover:opacity-90 active:scale-95 shadow-lg shadow-cyan-500/25 g-bg">
              Registrarme gratis
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
              <Link href="/login" className="text-center text-sm font-semibold text-slate-600 py-2.5 border border-slate-200 rounded-xl">Iniciar sesión</Link>
              <Link href="/register" className="text-center text-sm font-semibold text-white py-2.5 rounded-xl g-bg">Registrarme gratis</Link>
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
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Beta Abierta — Acceso Gratuito</span>
            </div>

            <h1 className="anim-fu1 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Tu consultorio,<br /><span className="g-text">100% digital</span>
            </h1>

            <p className="anim-fu2 text-xl text-slate-500 leading-relaxed max-w-lg font-medium">
              Agenda, consultas, historial clínico y finanzas — todo desde un solo lugar. Diseñado para especialistas en Venezuela.
            </p>

            <div className="anim-fu3 flex flex-col sm:flex-row gap-4">
              <Link href="/register" className="group flex items-center justify-center gap-2 text-white font-semibold px-7 py-4 rounded-2xl text-base transition-all hover:opacity-90 active:scale-95 shadow-xl shadow-cyan-500/30 g-bg">
                Registrarme gratis <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#features" className="group flex items-center justify-center gap-2 font-semibold px-7 py-4 rounded-2xl text-base border-2 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all text-slate-700">
                Ver funcionalidades <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            <p className="text-sm text-slate-400">
              <Stethoscope className="w-4 h-4 inline mr-1" />
              Acceso completo durante la beta. Sin tarjeta de crédito.
            </p>
          </div>

          {/* Dashboard Mockup */}
          <div className="relative hidden lg:block">
            <div className="anim-f1">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/80 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Buenos días, Doctora</p>
                    <p className="text-lg font-bold text-slate-900">Panel del día</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,196,204,0.1)' }}>
                    <Activity className="w-5 h-5" style={{ color: '#00C4CC' }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[{l:'Citas hoy',v:'8',d:'+2'},{l:'Ingresos',v:'$340',d:'+$120'},{l:'Pacientes',v:'156',d:'+5'}].map(k=>(
                    <div key={k.l} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 font-medium mb-1">{k.l}</p>
                      <p className="text-2xl font-bold text-slate-900">{k.v}</p>
                      <span className="text-xs font-semibold text-emerald-600">{k.d}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    {t:'09:00',n:'María López',ty:'Consulta',s:'confirmed'},
                    {t:'10:30',n:'Pedro Ramírez',ty:'Control',s:'pending'},
                    {t:'11:00',n:'Ana Soto',ty:'Primera vez',s:'confirmed'},
                    {t:'14:00',n:'Juan Gil',ty:'Control',s:'confirmed'},
                  ].map(a=>(
                    <div key={a.t} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                      <span className="text-xs font-semibold text-slate-400 w-10 shrink-0">{a.t}</span>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.s === 'pending' ? 'bg-amber-400' : ''}`} style={a.s !== 'pending' ? { background: '#00C4CC' } : {}} />
                      <span className="text-sm font-medium text-slate-700 flex-1">{a.n}</span>
                      <span className="text-xs text-slate-400">{a.ty}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 px-6 bg-slate-50" id="features">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <Sparkles className="w-3.5 h-3.5" /> Funcionalidades
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              Todo lo que necesitas, <span className="g-text">nada que sobre</span>
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">
              Cada módulo fue diseñado para resolver un problema real del consultorio médico venezolano.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`lift bg-white rounded-3xl border border-slate-200 p-8 flex flex-col gap-5 ${i === 0 ? 'md:col-span-2' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl ${f.bg} flex items-center justify-center shrink-0`}>
                    <f.icon className={`w-6 h-6 ${f.iconColor}`} />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#00C4CC' }}>{f.tag}</span>
                    <h3 className="text-xl font-bold text-slate-900 mt-1 mb-2">{f.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="py-24 px-6" id="benefits">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <Heart className="w-3.5 h-3.5" /> Beneficios
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
              Construido para <span className="g-text">médicos reales</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {BENEFITS.map(b => (
              <div key={b.title} className="lift bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'rgba(0,196,204,0.1)' }}>
                  <b.icon className="w-6 h-6" style={{ color: '#00C4CC' }} />
                </div>
                <h3 className="text-base font-bold text-slate-900">{b.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING — 2 planes: Beta Gratis + Pro (Coming Soon) */}
      <section className="py-24 px-6 bg-slate-50" id="pricing">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>
              <Zap className="w-3.5 h-3.5" /> Precios
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Simple y transparente</h2>
            <p className="text-lg text-slate-500 font-medium max-w-xl mx-auto">
              Estamos en beta abierta. Accede gratis a todas las funcionalidades y ayúdanos a construir el mejor CRM médico de Venezuela.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Beta Gratis */}
            <div className="bg-white rounded-3xl border-2 border-teal-300 p-8 flex flex-col gap-6 relative overflow-hidden shadow-lg shadow-teal-100/50">
              <div className="absolute top-5 right-5">
                <span className="text-xs font-bold px-3 py-1 rounded-full text-white g-bg">Disponible ahora</span>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#00C4CC' }}>Beta Gratis</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-extrabold text-slate-900">$0</span>
                  <span className="text-slate-400 font-medium mb-2 text-sm">/ periodo beta</span>
                </div>
                <p className="text-sm text-slate-500 mt-3">Acceso completo. Sin compromiso. Tu feedback nos ayuda a mejorar.</p>
              </div>
              <ul className="space-y-3 flex-1">
                {BETA_FEATURES.map(f=>(
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#00C4CC' }} />{f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center font-bold py-4 rounded-2xl text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-xl shadow-cyan-500/25 g-bg">
                Registrarme gratis
              </Link>
            </div>

            {/* Pro (Coming Soon) */}
            <div className="bg-white rounded-3xl border-2 border-slate-200 p-8 flex flex-col gap-6 relative overflow-hidden opacity-80">
              <div className="absolute top-5 right-5">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-500">Próximamente</span>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest mb-3 text-slate-400">Pro</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-extrabold text-slate-300">$30</span>
                  <span className="text-slate-300 font-medium mb-2 text-sm">USD / mes</span>
                </div>
                <p className="text-sm text-slate-400 mt-3">Todo del Beta más automatizaciones, CRM y reportería avanzada.</p>
              </div>
              <ul className="space-y-3 flex-1">
                {PRO_FEATURES.map(f=>(
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-400">
                    <Check className="w-4 h-4 shrink-0 mt-0.5 text-slate-300" />{f}
                  </li>
                ))}
              </ul>
              <div className="block text-center font-semibold py-4 rounded-2xl text-base border-2 border-slate-200 text-slate-400 cursor-not-allowed">
                Disponible después de la beta
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-sm text-slate-400">
            <span className="flex items-center gap-2"><Shield className="w-4 h-4" />Datos seguros</span>
            <span className="flex items-center gap-2"><PhoneCall className="w-4 h-4" />Soporte por WhatsApp</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Sin tarjeta requerida</span>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[2.5rem] p-14 text-center relative overflow-hidden bg-slate-50 border border-slate-200">
            <div className="relative z-10 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-white border border-slate-200 shadow-sm">
                <span className="w-2 h-2 rounded-full dot-p" style={{ background: '#00C4CC' }} />
                Beta Abierta
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Digitaliza tu consulta <span className="g-text">hoy mismo</span>
              </h2>
              <p className="text-lg text-slate-500 font-medium max-w-lg mx-auto">
                Únete a los primeros médicos que están transformando su consultorio. Acceso gratuito durante toda la beta.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link href="/register" className="group flex items-center justify-center gap-2 font-bold px-8 py-4 rounded-2xl text-base transition-all hover:opacity-90 active:scale-95 shadow-xl shadow-cyan-500/25 text-white g-bg">
                  Comenzar ahora — es gratis <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
              <p className="text-sm text-slate-400">
                ¿Eres paciente? <Link href="/patient/login" className="font-semibold text-teal-500 hover:text-teal-600 transition-colors">Accede a tu portal →</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-10 mb-12">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center g-bg"><Activity className="w-5 h-5 text-white" /></div>
                <div>
                  <span className="font-bold text-lg text-slate-900 tracking-tight">Delta</span>
                  <span className="text-xs text-slate-400 block font-medium">Medical CRM</span>
                </div>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs">El CRM médico diseñado para especialistas en Venezuela. Agenda, consultas, finanzas y portal del paciente.</p>
              <a href="mailto:jesussolano4@gmail.com" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"><Mail className="w-3.5 h-3.5" /> jesussolano4@gmail.com</a>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Producto</h4>
              {['Agenda Médica','Consultas & EHR','Finanzas','Portal Paciente','Booking Público'].map(item=>(
                <a key={item} href="#features" className="block text-sm text-slate-500 hover:text-slate-900 transition-colors">{item}</a>
              ))}
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">Cuenta</h4>
              <Link href="/login" className="block text-sm text-slate-500 hover:text-slate-900 transition-colors">Iniciar sesión</Link>
              <Link href="/register" className="block text-sm text-slate-500 hover:text-slate-900 transition-colors">Registrarme gratis</Link>
              <Link href="/patient/login" className="block text-sm text-slate-500 hover:text-slate-900 transition-colors">Portal del paciente</Link>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400">© 2026 Delta Medical CRM · Hecho en Venezuela</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs text-slate-400 hover:text-slate-600">Privacidad</a>
              <a href="#" className="text-xs text-slate-400 hover:text-slate-600">Términos</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
