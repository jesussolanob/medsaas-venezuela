import Link from 'next/link'
import { ArrowLeft, UserPlus, Calendar, Stethoscope, DollarSign, MessageCircle, Mail } from 'lucide-react'

export const metadata = { title: 'Centro de ayuda — Delta Medical CRM' }

export default function HelpPage() {
  const steps = [
    {
      n: 1,
      icon: UserPlus,
      title: 'Crea tu cuenta',
      time: '2 min',
      content: [
        'Ingresa a /register desde la página principal.',
        'Llena tu nombre, cédula, email y especialidad.',
        'Recibirás un correo de verificación. Confírmalo y ya estás dentro de Delta.',
        'Tu cuenta tiene 1 año de prueba gratis.',
      ],
    },
    {
      n: 2,
      icon: Stethoscope,
      title: 'Completa tu perfil profesional',
      time: '5 min',
      content: [
        'Ve a Configuración → Perfil y agrega: foto, teléfono, dirección del consultorio, métodos de pago aceptados (Pago Móvil, Zelle, Binance, etc).',
        'En Configuración → Bloques de consulta personaliza qué quieres registrar en cada consulta (motivo, diagnóstico, tratamiento, prescripción, tareas, etc).',
        'En Configuración → Tasa de cambio elige USD, EUR o tasa personalizada para convertir tus precios a bolívares.',
      ],
    },
    {
      n: 3,
      icon: Calendar,
      title: 'Configura tu agenda',
      time: '3 min',
      content: [
        'Ve a Agenda → Configurar disponibilidad.',
        'Define tus horarios semanales (ej: lun-vie 9am-5pm).',
        'Marca días bloqueados (vacaciones, cirugías).',
        'Setea la duración por defecto de tus consultas (15, 30, 45, 60 min).',
      ],
    },
    {
      n: 4,
      icon: DollarSign,
      title: 'Crea tus servicios y planes',
      time: '5 min',
      content: [
        'Ve a Servicios y crea tus tarifas.',
        'Puedes crear consultas individuales o paquetes (ej: 5 sesiones $150).',
        'Marca cuáles aparecen en el booking público para que los pacientes puedan agendar.',
      ],
    },
    {
      n: 5,
      icon: MessageCircle,
      title: 'Comparte tu link de booking',
      time: '1 min',
      content: [
        'Tu link público es: medsaas-venezuela.vercel.app/book/tu-id',
        'Compártelo en Instagram, WhatsApp, tarjetas de presentación.',
        'Los pacientes pueden agendar sin necesidad de cuenta — registro opcional.',
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-cyan-500 to-teal-600 text-white py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4" /> Volver al inicio
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold">Centro de ayuda</h1>
          <p className="text-white/90 mt-3 max-w-2xl text-lg">
            Aprende a usar Delta en 5 pasos simples. Tiempo total: ~15 minutos.
          </p>
        </div>
      </div>

      {/* Pasos del tutorial */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
        {steps.map(s => {
          const Icon = s.icon
          return (
            <div key={s.n} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                  <Icon className="w-6 h-6 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-600">PASO {s.n}</span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{s.time}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-3">{s.title}</h2>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {s.content.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-teal-600 flex-shrink-0">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )
        })}

        {/* Contacto */}
        <div className="bg-slate-100 rounded-2xl p-6 sm:p-8 mt-12">
          <h3 className="text-lg font-bold text-slate-900 mb-2">¿Necesitas más ayuda?</h3>
          <p className="text-sm text-slate-600 mb-4">
            Si te queda alguna duda, escríbenos. Respondemos en menos de 24h.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a href="mailto:hola@deltahealth.tech"
              className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-teal-400 transition-colors">
              <Mail className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Correo</p>
                <p className="text-xs text-slate-500">hola@deltahealth.tech</p>
              </div>
            </a>
            <a href="https://wa.me/584145209751"
              className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-teal-400 transition-colors">
              <MessageCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">WhatsApp</p>
                <p className="text-xs text-slate-500">+58 414 520 9751</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
