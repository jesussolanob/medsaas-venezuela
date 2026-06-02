import Link from 'next/link'
import { FileText, ArrowLeft } from 'lucide-react'

export const metadata = { title: 'Términos y Condiciones — Delta Medical CRM' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 mb-8">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Términos y Condiciones</h1>
              <p className="text-sm text-slate-500 mt-0.5">Última actualización: Abril 2026</p>
            </div>
          </div>

          <div className="prose prose-slate max-w-none space-y-4 text-slate-700">
            <p>
              Al usar Delta Medical CRM aceptas estos términos. Léelos con atención.
            </p>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">1. Servicio</h2>
              <p>Delta Medical CRM provee una plataforma SaaS para que profesionales de la salud gestionen su práctica
              médica privada en Venezuela. El servicio incluye agenda, historia clínica electrónica, cobros, CRM y
              portal del paciente.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">2. Período de prueba</h2>
              <p>Durante el período de prueba el acceso es gratuito por 1 año. El servicio se ofrece "tal cual" sin garantías
              expresas. Reservamos el derecho de modificar funcionalidades.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">3. Responsabilidad médica</h2>
              <p>Delta Medical CRM es una herramienta de gestión administrativa. Las decisiones clínicas, diagnósticos,
              tratamientos y prescripciones son responsabilidad exclusiva del profesional médico que usa la plataforma.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">4. Uso aceptable</h2>
              <p>El médico se compromete a usar la plataforma sólo para su práctica legítima. Está prohibido cargar
              información falsa, suplantar identidad o usar la plataforma para fines ilegales.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">5. Suspensión de cuenta</h2>
              <p>Nos reservamos el derecho de suspender cuentas que violen estos términos, sin previo aviso.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">6. Jurisdicción</h2>
              <p>Estos términos se rigen por las leyes de la República Bolivariana de Venezuela.</p>
            </section>

            <p className="text-sm text-slate-500 mt-8 pt-6 border-t border-slate-200">
              Para preguntas sobre estos términos: <a href="mailto:hola@deltahealth.tech" className="text-teal-600 hover:underline">hola@deltahealth.tech</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
