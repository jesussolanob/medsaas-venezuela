import Link from 'next/link'
import { LifeBuoy, ArrowLeft, Mail, MessageCircle } from 'lucide-react'

export const metadata = { title: 'Centro de ayuda — Delta Health Tech' }

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 mb-8">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center">
          <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LifeBuoy className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Centro de ayuda</h1>
          <p className="text-slate-500 mt-3 max-w-md mx-auto">
            Estamos preparando una sección con guías paso a paso, FAQs y tutoriales en video.
            Mientras tanto, escríbenos directamente.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
            <a href="mailto:hola@deltahealth.tech"
              className="flex flex-col items-center gap-2 p-5 rounded-xl border border-slate-200 hover:border-teal-400 hover:bg-teal-50 transition-all">
              <Mail className="w-6 h-6 text-teal-600" />
              <span className="font-semibold text-sm text-slate-900">Correo</span>
              <span className="text-xs text-slate-500">hola@deltahealth.tech</span>
            </a>
            <a href="https://wa.me/584145209751"
              className="flex flex-col items-center gap-2 p-5 rounded-xl border border-slate-200 hover:border-teal-400 hover:bg-teal-50 transition-all">
              <MessageCircle className="w-6 h-6 text-teal-600" />
              <span className="font-semibold text-sm text-slate-900">WhatsApp</span>
              <span className="text-xs text-slate-500">+58 414 520 9751</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
