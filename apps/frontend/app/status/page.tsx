import Link from 'next/link'
import { Activity, ArrowLeft, CheckCircle2 } from 'lucide-react'

export const metadata = { title: 'Estado del sistema — Delta Medical CRM' }

export default function StatusPage() {
  const services = [
    { name: 'API Backend (Vercel)', status: 'operational' },
    { name: 'Base de datos (Supabase)', status: 'operational' },
    { name: 'Autenticación', status: 'operational' },
    { name: 'Almacenamiento de archivos', status: 'operational' },
    { name: 'Sincronización Google Calendar', status: 'operational' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 mb-8">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Estado del sistema</h1>
              <p className="text-sm text-slate-500 mt-0.5">Todos los servicios operativos</p>
            </div>
          </div>

          <div className="space-y-3">
            {services.map(s => (
              <div key={s.name} className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-sm font-medium text-slate-900">{s.name}</span>
                <span className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  Operativo
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 mt-6 text-center">
            Esta página se actualizará en tiempo real próximamente. Si experimentas algún problema,
            escríbenos a <a href="mailto:hola@deltahealth.tech" className="text-teal-600 hover:underline">hola@deltahealth.tech</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
