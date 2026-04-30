import Link from 'next/link'
import { Shield, ArrowLeft } from 'lucide-react'

export const metadata = { title: 'Política de Privacidad — Delta Medical CRM' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 mb-8">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Política de Privacidad</h1>
              <p className="text-sm text-slate-500 mt-0.5">Última actualización: Abril 2026</p>
            </div>
          </div>

          <div className="prose prose-slate max-w-none space-y-4 text-slate-700">
            <p>
              En Delta Medical CRM tomamos en serio la privacidad de los datos médicos de nuestros usuarios.
              Este documento describe cómo recopilamos, usamos y protegemos tu información.
            </p>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">1. Información que recopilamos</h2>
              <p>Recopilamos únicamente la información necesaria para proveer el servicio: datos de identificación
              del médico y paciente, historial clínico cargado por el médico, información de pagos para procesamiento
              de cobros.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">2. Uso de la información</h2>
              <p>La información se usa exclusivamente para permitir el funcionamiento del CRM médico, la comunicación
              entre médico y paciente, y la generación de reportes financieros y clínicos.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">3. Compartir información</h2>
              <p>No compartimos tu información con terceros, salvo cuando sea requerido por ley o autoridades
              competentes en Venezuela.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">4. Seguridad</h2>
              <p>Implementamos múltiples capas de seguridad: cifrado en tránsito (HTTPS), aislamiento por tenant
              (RLS en PostgreSQL), autenticación con tokens JWT y backups diarios.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mt-6">5. Tus derechos</h2>
              <p>Como usuario tienes derecho a acceder, rectificar y solicitar la eliminación de tus datos personales.
              Para ejercer estos derechos, escríbenos a <a href="mailto:hola@deltahealth.tech" className="text-teal-600 hover:underline">hola@deltahealth.tech</a>.</p>
            </section>

            <p className="text-sm text-slate-500 mt-8 pt-6 border-t border-slate-200">
              Esta política puede actualizarse. Te notificaremos por email ante cambios materiales.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
