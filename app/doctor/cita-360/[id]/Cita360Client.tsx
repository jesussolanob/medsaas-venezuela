'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Calendar, Stethoscope, DollarSign, FileText,
  Clock, MapPin, User, Phone, Mail, CheckCircle2, AlertCircle, X,
  CreditCard, Receipt, Hash, RefreshCw, Eye, ExternalLink, Copy,
} from 'lucide-react'

export type Cita360Data = {
  appointment: any
  consultation: any | null
  payment: any | null
  doctor: { full_name: string; specialty: string | null; professional_title: string | null; email: string } | null
  patient: { full_name: string; email: string | null; phone: string | null; cedula: string | null; birth_date: string | null } | null
  rescheduleChain: Array<{ id: string; appointment_code: string; status: string; scheduled_at: string; reschedule_of: string | null; created_at: string }>
  changeLog: Array<{ actor_role: string; action: string; field_changed: string; old_value: string | null; new_value: string | null; created_at: string }>
}

type Step = 1 | 2 | 3 | 4

const STATUS_CITA: Record<string, { label: string; color: string }> = {
  scheduled:   { label: 'Agendada',   color: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed:   { label: 'Confirmada', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  completed:   { label: 'Completada (legacy)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  no_show:     { label: 'No asistió (legacy)', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  cancelled:   { label: 'Cancelada',  color: 'bg-red-50 text-red-700 border-red-200' },
  rescheduled: { label: 'Reagendada', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  pending:     { label: 'Pendiente',  color: 'bg-slate-100 text-slate-600 border-slate-200' },
}

const STATUS_CONSULTA: Record<string, { label: string; color: string }> = {
  pending:      { label: 'Pendiente',   color: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_progress:  { label: 'En curso',    color: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:    { label: 'Atendida',    color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  no_show:      { label: 'No asistió',  color: 'bg-orange-50 text-orange-700 border-orange-200' },
  cancelled:    { label: 'Cancelada',   color: 'bg-red-50 text-red-700 border-red-200' },
}

const STATUS_PAGO: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Aprobado',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function StatusPill({ map, status }: { map: Record<string, any>, status: string | null }) {
  const cfg = map[status || ''] || { label: status || '—', color: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtMoney(v: number | string | null | undefined, currency = 'USD'): string {
  const n = Number(v ?? 0)
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
}

function CodeChip({ value, label, color = 'cyan' }: { value: string | null | undefined, label: string, color?: 'cyan' | 'teal' | 'coral' | 'slate' }) {
  const palette: Record<string, string> = {
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    coral: 'bg-orange-50 text-orange-700 border-orange-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  if (!value) return null
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(value).catch(() => {})}
      title="Click para copiar"
      className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-mono text-[11px] font-semibold ${palette[color]} hover:opacity-80`}
    >
      <span className="text-[9px] uppercase opacity-70">{label}</span>
      <span>{value}</span>
      <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
    </button>
  )
}

export default function Cita360Client({ data }: { data: Cita360Data }) {
  const [step, setStep] = useState<Step>(1)
  const { appointment: appt, consultation: cons, payment: pay, doctor, patient, rescheduleChain, changeLog } = data

  const steps = [
    { n: 1 as Step, label: 'Cita',     icon: Calendar,    color: 'cyan' },
    { n: 2 as Step, label: 'Consulta', icon: Stethoscope, color: 'teal' },
    { n: 3 as Step, label: 'Pago',     icon: DollarSign,  color: 'coral' },
    { n: 4 as Step, label: 'Resumen',  icon: FileText,    color: 'slate' },
  ]

  return (
    <div className="space-y-4">
      {/* Header con código MAESTRO (consultation_code) */}
      <div className="bg-gradient-to-br from-cyan-500 to-teal-600 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider opacity-80 font-mono">Cita 360°</p>
            <h1 className="text-2xl font-bold mt-1">{patient?.full_name || appt.patient_name || 'Paciente'}</h1>
            <p className="text-white/85 text-sm mt-0.5">
              {fmtDate(appt.scheduled_at)}
            </p>
          </div>
          {/* Código maestro: el de la consulta (NUNCA cambia, ni al reagendar ni al cobrar) */}
          {(cons?.consultation_code || appt.appointment_code) && (
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-widest text-white/70 font-bold">Código de cita</p>
              <button
                onClick={() => navigator.clipboard?.writeText(cons?.consultation_code || appt.appointment_code).catch(() => {})}
                title="Click para copiar"
                className="font-mono text-xl font-bold hover:opacity-80"
              >
                {cons?.consultation_code || appt.appointment_code}
              </button>
            </div>
          )}
        </div>
        {/* Códigos técnicos secundarios (colapsado, info para soporte) */}
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-white/70 hover:text-white">📋 IDs técnicos (cita / pago)</summary>
          <div className="flex flex-wrap gap-2 mt-2">
            <CodeChip value={appt.appointment_code} label="ID CITA" color="cyan" />
            <CodeChip value={pay?.payment_code} label="ID PAGO" color="coral" />
          </div>
        </details>
      </div>

      {/* Stepper navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2">
        <div className="grid grid-cols-4 gap-1">
          {steps.map((s) => {
            const Icon = s.icon
            const active = step === s.n
            return (
              <button
                key={s.n}
                onClick={() => setStep(s.n)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${active ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'}`}>
                  {s.n}
                </span>
                <Icon className="w-4 h-4 hidden sm:block" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* PASO 1 — CITA */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-600" />
            <h2 className="text-lg font-bold text-slate-900">Detalles de la cita</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field icon={Hash} label="Código" value={appt.appointment_code} mono />
            <Field icon={CheckCircle2} label="Estado de la cita">
              <StatusPill map={STATUS_CITA} status={appt.status} />
            </Field>
            <Field icon={Calendar} label="Fecha y hora" value={fmtDate(appt.scheduled_at)} />
            <Field icon={Clock} label="Duración" value={`${appt.duration_minutes || 30} min`} />
            <Field icon={MapPin} label="Modalidad" value={appt.appointment_mode === 'online' ? '💻 Online' : '🏥 Presencial'} />
            <Field icon={User} label="Médico" value={doctor ? `${doctor.professional_title || ''} ${doctor.full_name}`.trim() : '—'} sub={doctor?.specialty || ''} />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Paciente</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field icon={User} label="Nombre" value={patient?.full_name || appt.patient_name} />
              <Field icon={Hash} label="Cédula" value={patient?.cedula || appt.patient_cedula || '—'} mono />
              <Field icon={Mail} label="Email" value={patient?.email || appt.patient_email || '—'} />
              <Field icon={Phone} label="Teléfono" value={patient?.phone || appt.patient_phone || '—'} />
            </div>
          </div>

          {appt.service_snapshot && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Servicio contratado (snapshot)</h3>
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700">
                <div className="font-semibold">{appt.service_snapshot.name || 'Consulta'}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {fmtMoney(appt.service_snapshot.price_usd)} · {appt.service_snapshot.mode || 'presencial'}
                  {appt.service_snapshot.sessions_count > 1 && ` · ${appt.service_snapshot.sessions_count} sesiones`}
                </div>
              </div>
            </div>
          )}

          {/* Reagendamientos */}
          {rescheduleChain && rescheduleChain.length > 1 && (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-slate-900">Historial de reagendamientos ({rescheduleChain.length - 1})</h3>
              </div>
              <ol className="space-y-2">
                {rescheduleChain.map((r, i) => (
                  <li key={r.id} className={`flex items-center gap-3 p-3 rounded-lg border ${r.id === appt.id ? 'bg-cyan-50 border-cyan-200' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="w-6 h-6 rounded-full bg-white border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-700">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-slate-700">{r.appointment_code}</div>
                      <div className="text-sm text-slate-900">{fmtDate(r.scheduled_at)}</div>
                    </div>
                    <StatusPill map={STATUS_CITA} status={r.status} />
                    {r.id === appt.id && <span className="text-[10px] uppercase font-bold text-cyan-700">Actual</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* PASO 2 — CONSULTA */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-bold text-slate-900">Detalles de la consulta clínica</h2>
            {cons && (
              <Link
                href={`/doctor/consultations/${cons.id}`}
                className="ml-auto text-xs text-teal-600 hover:underline inline-flex items-center gap-1"
              >
                Editar consulta <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {!cons ? (
            <div className="bg-slate-50 rounded-xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Esta cita aún no tiene consulta clínica asociada.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field icon={Hash} label="Código de consulta" value={cons.consultation_code} mono />
                <Field icon={CheckCircle2} label="Estado de consulta">
                  <StatusPill map={STATUS_CONSULTA} status={cons.status} />
                </Field>
                <Field icon={Clock} label="Iniciada" value={fmtDate(cons.started_at)} />
                <Field icon={Clock} label="Finalizada" value={fmtDate(cons.ended_at)} />
                <Field icon={Calendar} label="Fecha consulta" value={fmtDate(cons.consultation_date)} />
                <Field icon={FileText} label="Plantilla" value={cons.plan_name || '—'} />
              </div>

              {(cons.diagnosis || cons.treatment || cons.chief_complaint) && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  {cons.chief_complaint && (
                    <DataRow label="Motivo" value={cons.chief_complaint} />
                  )}
                  {cons.diagnosis && (
                    <DataRow label="Diagnóstico" value={stripHtml(cons.diagnosis)} />
                  )}
                  {cons.treatment && (
                    <DataRow label="Tratamiento" value={stripHtml(cons.treatment)} />
                  )}
                </div>
              )}

              {/* Bloques de plantilla */}
              {Array.isArray(cons.blocks_snapshot) && cons.blocks_snapshot.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Plantilla de bloques (snapshot al crear)</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {cons.blocks_snapshot.map((b: any, i: number) => (
                      <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">{b.key}</div>
                        <div className="text-sm font-medium text-slate-700">{b.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contenido capturado por bloque */}
              {cons.blocks_data && Object.keys(cons.blocks_data).length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Contenido clínico</h3>
                  <div className="space-y-2">
                    {Object.entries(cons.blocks_data).map(([k, v]: [string, any]) => {
                      if (!v) return null
                      const text = typeof v === 'string' ? stripHtml(v) : JSON.stringify(v)
                      if (!text) return null
                      return (
                        <DataRow key={k} label={k} value={text.slice(0, 300)} />
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PASO 3 — PAGO */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-bold text-slate-900">Detalles del pago</h2>
          </div>

          {!pay ? (
            <div className="bg-slate-50 rounded-xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No hay registro de pago para esta cita.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field icon={Hash} label="Código de pago" value={pay.payment_code} mono />
                <Field icon={CheckCircle2} label="Estado del pago">
                  <StatusPill map={STATUS_PAGO} status={pay.status} />
                </Field>
                <Field icon={DollarSign} label="Monto USD" value={fmtMoney(pay.amount_usd, 'USD')} />
                <Field icon={DollarSign} label="Monto Bs" value={pay.amount_bs ? `Bs ${Number(pay.amount_bs).toLocaleString('es-VE')}` : '—'} sub={pay.bcv_rate ? `Tasa: ${pay.bcv_rate}` : undefined} />
                <Field icon={CreditCard} label="Método" value={pay.method_snapshot || '—'} />
                <Field icon={Receipt} label="Referencia" value={pay.payment_reference || '—'} mono />
                <Field icon={Clock} label="Pagado el" value={fmtDate(pay.paid_at)} />
                <Field icon={CreditCard} label="Moneda" value={pay.currency || 'USD'} />
              </div>

              {pay.payment_receipt_url && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Comprobante</h3>
                  <a
                    href={pay.payment_receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-semibold"
                  >
                    <Eye className="w-4 h-4" /> Ver comprobante
                  </a>
                </div>
              )}

              {pay.package_id && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm">
                    <span className="font-semibold text-violet-900">📦 Pago de paquete prepagado</span>
                    <p className="text-xs text-violet-700 mt-1">
                      Esta cita se pagó con un paquete. El monto USD = 0 porque el cobro se hizo al comprar el paquete.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PASO 4 — RESUMEN */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-bold text-slate-900">Resumen 360°</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bloque cita */}
              <SummaryCard
                icon={Calendar}
                color="cyan"
                title="Cita"
                code={appt.appointment_code}
                status={<StatusPill map={STATUS_CITA} status={appt.status} />}
                lines={[
                  { k: 'Cuándo', v: fmtDate(appt.scheduled_at) },
                  { k: 'Duración', v: `${appt.duration_minutes || 30} min` },
                  { k: 'Modalidad', v: appt.appointment_mode === 'online' ? 'Online' : 'Presencial' },
                  { k: 'Reagendada', v: rescheduleChain.length > 1 ? `${rescheduleChain.length - 1} vez(es)` : 'No' },
                ]}
              />
              {/* Bloque consulta */}
              <SummaryCard
                icon={Stethoscope}
                color="teal"
                title="Consulta"
                code={cons?.consultation_code || null}
                status={cons ? <StatusPill map={STATUS_CONSULTA} status={cons.status} /> : <span className="text-xs text-slate-400">Sin consulta</span>}
                lines={cons ? [
                  { k: 'Iniciada', v: cons.started_at ? fmtDate(cons.started_at) : '—' },
                  { k: 'Finalizada', v: cons.ended_at ? fmtDate(cons.ended_at) : '—' },
                  { k: 'Plantilla', v: cons.plan_name || '—' },
                ] : []}
              />
              {/* Bloque pago */}
              <SummaryCard
                icon={DollarSign}
                color="coral"
                title="Pago"
                code={pay?.payment_code || null}
                status={pay ? <StatusPill map={STATUS_PAGO} status={pay.status} /> : <span className="text-xs text-slate-400">Sin pago</span>}
                lines={pay ? [
                  { k: 'Monto', v: fmtMoney(pay.amount_usd, 'USD') },
                  { k: 'Método', v: pay.method_snapshot || '—' },
                  { k: 'Referencia', v: pay.payment_reference || '—' },
                  { k: 'Pagado', v: pay.paid_at ? fmtDate(pay.paid_at) : 'Pendiente' },
                ] : []}
              />
            </div>
          </div>

          {/* Audit log */}
          {changeLog && changeLog.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Bitácora de cambios</h3>
              <ul className="space-y-2">
                {changeLog.map((c, i) => (
                  <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 text-xs">
                    <span className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center font-mono">{i + 1}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-700">
                        {c.action} — <span className="text-slate-500">{c.field_changed}</span>
                      </div>
                      <div className="text-slate-500">
                        {c.old_value && <span className="line-through">{c.old_value}</span>}
                        {c.old_value && c.new_value && ' → '}
                        {c.new_value && <span className="font-medium text-slate-700">{c.new_value}</span>}
                      </div>
                      <div className="text-slate-400 mt-1">
                        {c.actor_role || 'sistema'} · {fmtDate(c.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componentes ─────────────────────────────────────────────────────────────

function Field({
  icon: Icon, label, value, sub, mono, children,
}: {
  icon?: any
  label: string
  value?: string | null
  sub?: string
  mono?: boolean
  children?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      {children ? (
        <div className="mt-1">{children}</div>
      ) : (
        <>
          <p className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value || '—'}</p>
          {sub && <p className="text-xs text-slate-400">{sub}</p>}
        </>
      )}
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{label}</div>
      <div className="text-sm text-slate-700 whitespace-pre-wrap">{value}</div>
    </div>
  )
}

function SummaryCard({
  icon: Icon, color, title, code, status, lines,
}: {
  icon: any
  color: 'cyan' | 'teal' | 'coral'
  title: string
  code: string | null
  status: React.ReactNode
  lines: Array<{ k: string; v: string }>
}) {
  const palette: Record<string, string> = {
    cyan: 'border-cyan-200 bg-cyan-50',
    teal: 'border-teal-200 bg-teal-50',
    coral: 'border-orange-200 bg-orange-50',
  }
  const iconColor: Record<string, string> = {
    cyan: 'text-cyan-600',
    teal: 'text-teal-600',
    coral: 'text-orange-600',
  }
  return (
    <div className={`rounded-xl border p-4 ${palette[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${iconColor[color]}`} />
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      {code && <div className="font-mono text-[11px] text-slate-700 mb-2">{code}</div>}
      <div className="mb-3">{status}</div>
      <dl className="space-y-1">
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">{l.k}</dt>
            <dd className="text-slate-800 font-medium text-right truncate">{l.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}
