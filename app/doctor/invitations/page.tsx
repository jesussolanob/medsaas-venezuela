'use client'

import { useState, useEffect, useTransition } from 'react'
import { Send, Copy, Check, Clock, CheckCircle2, X, Link2, Phone, User, Plus, ExternalLink, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Invitation = {
  id: string
  token: string
  patient_name: string
  patient_phone: string
  created_at: string
  used_at: string | null
  doctor_id: string
}

function genToken(): string {
  return Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12)
}

export default function InvitationsPage() {
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ patient_name: '', patient_phone: '' })
  const [error, setError] = useState('')
  const [dbError, setDbError] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<string | null>(null)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setDoctorId(user.id)
      try {
        const { data, error: fetchErr } = await supabase
          .from('doctor_invitations')
          .select('*')
          .eq('doctor_id', user.id)
          .order('created_at', { ascending: false })
        if (fetchErr) {
          setDbError(true)
        } else {
          setInvitations(data ?? [])
        }
      } catch {
        setDbError(true)
      }
      setLoading(false)
    })
  }, [])

  const publicLink = doctorId ? `${baseUrl}/book/${doctorId}` : ''

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.patient_name.trim()) { setError('El nombre del paciente es obligatorio'); return }
    if (!form.patient_phone.trim()) { setError('El teléfono es obligatorio'); return }
    if (!doctorId) return
    setError('')

    startTransition(async () => {
      const token = genToken()
      const link = `${baseUrl}/invite/${token}`

      // Try to save to DB — gracefully handle schema errors
      try {
        const supabase = createClient()
        const { error: dbErr } = await supabase
          .from('doctor_invitations')
          .insert({
            token,
            patient_name: form.patient_name,
            patient_phone: form.patient_phone,
            doctor_id: doctorId,
          })
          .select()
          .single()

        if (!dbErr) {
          // Refresh invitations list
          const { data: updatedList } = await supabase
            .from('doctor_invitations')
            .select('*')
            .eq('doctor_id', doctorId)
            .order('created_at', { ascending: false })
          setInvitations(updatedList ?? [])
        } else {
          // DB doesn't have the columns yet — still allow WhatsApp send
          console.warn('DB error (schema mismatch):', dbErr.message)
          setDbError(true)
        }
      } catch (err) {
        console.warn('Could not save invitation to DB:', err)
        setDbError(true)
      }

      setLastCreated(link)
      setForm({ patient_name: '', patient_phone: '' })
      setShowForm(false)

      // Open WhatsApp regardless of DB result
      const waMsg = encodeURIComponent(
        `Hola ${form.patient_name}, tu médico te invita a agendar tu consulta en este enlace:\n\n${link}\n\nEs personal e intransferible. 📅`
      )
      window.open(`https://wa.me/${form.patient_phone.replace(/\D/g, '')}?text=${waMsg}`, '_blank')
    })
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-3xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Invitaciones & Booking</h1>
            <p className="text-sm text-slate-500">Tu link público de citas y links personalizados por paciente</p>
          </div>
          <button onClick={() => setShowForm(true)} className="g-bg flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90">
            <Plus className="w-4 h-4" /> Invitación personal
          </button>
        </div>

        {/* Fixed public link */}
        {doctorId && (
          <div className="g-bg rounded-xl p-5 text-white">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base">Tu link fijo de booking</p>
                <p className="text-sm text-white/70 mt-0.5">Comparte este link con cualquier paciente — nunca vence</p>
                <div className="mt-3 bg-white/10 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <p className="text-sm font-mono flex-1 truncate text-white/90">{publicLink}</p>
                  <button
                    onClick={() => copyText(publicLink, 'public')}
                    className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  >
                    {copied === 'public' ? <><Check className="w-3.5 h-3.5" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
                  </button>
                </div>
              </div>
              <button
                onClick={() => window.open(publicLink, '_blank')}
                className="shrink-0 w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Share via WhatsApp */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const msg = encodeURIComponent(`Hola! Puedes agendar tu consulta conmigo directamente en este link:\n\n${publicLink}\n\n¡Te espero! 📅`)
                  window.open(`https://wa.me/?text=${msg}`, '_blank')
                }}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
              >
                <Send className="w-3.5 h-3.5" /> Compartir por WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* DB Schema warning */}
        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Ejecuta las migraciones SQL</p>
              <p className="text-xs text-amber-600 mt-0.5">
                La tabla <code className="bg-amber-100 px-1 rounded">doctor_invitations</code> necesita columnas adicionales.
                Ejecuta <code className="bg-amber-100 px-1 rounded">sql_migrations.sql</code> en Supabase SQL Editor para activar el historial de invitaciones.
                Los links de WhatsApp siguen funcionando aunque no se guarden en la base de datos.
              </p>
            </div>
          </div>
        )}

        {/* Last created success */}
        {lastCreated && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-700">¡Link de invitación creado y enviado por WhatsApp!</p>
              <p className="text-xs text-emerald-600 mt-0.5 break-all">{lastCreated}</p>
            </div>
            <button onClick={() => copyText(lastCreated, 'last')} className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 flex items-center gap-1">
              {copied === 'last' ? <><Check className="w-3.5 h-3.5" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
            </button>
          </div>
        )}

        {/* How it works */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Links personales vs. link fijo</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <p className="text-sm font-bold text-teal-600 mb-1">🔗 Link fijo del médico</p>
              <p className="text-xs text-slate-500">Un solo link para todos tus pacientes. Ideal para redes sociales, tarjetas de presentación o firma de email.</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <p className="text-sm font-bold text-violet-600 mb-1">📨 Invitación personal</p>
              <p className="text-xs text-slate-500">Link único por paciente. Aparece pre-completado con su nombre y teléfono al agendar. Ideal para seguimiento personalizado.</p>
            </div>
          </div>
        </div>

        {/* Invitations list */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">Invitaciones personales enviadas</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Cargando...</div>
          ) : invitations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Link2 className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-slate-400 text-sm font-medium">Sin invitaciones personales aún</p>
              <p className="text-slate-300 text-xs mt-0.5">Crea una para seguimiento personalizado</p>
            </div>
          ) : (
            invitations.map((inv, i) => (
              <div key={inv.id} className={`flex items-center gap-4 px-5 py-3.5 ${i < invitations.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-teal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{inv.patient_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{inv.patient_phone}</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{new Date(inv.created_at).toLocaleDateString('es-VE')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {inv.used_at ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />Usado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                      <Clock className="w-3 h-3" />Pendiente
                    </span>
                  )}
                  <button onClick={() => copyText(`${baseUrl}/invite/${inv.token}`, inv.token)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                    {copied === inv.token ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create invitation modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Nueva invitación personal</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del paciente <span className="text-red-400">*</span></label>
                <input value={form.patient_name} onChange={e => setForm(p => ({ ...p, patient_name: e.target.value }))} placeholder="María González" className={fi} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono (WhatsApp) <span className="text-red-400">*</span></label>
                <input type="tel" value={form.patient_phone} onChange={e => setForm(p => ({ ...p, patient_phone: e.target.value }))} placeholder="+58 412 000 0000" className={fi} />
              </div>
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
                Se generará un link único y se abrirá WhatsApp para enviárselo al paciente automáticamente.
              </p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={isPending} className="flex-1 g-bg py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-60">
                  {isPending ? 'Creando...' : <><Send className="w-4 h-4" />Enviar por WhatsApp</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
