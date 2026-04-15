'use client'

import { useState, useEffect, useRef } from 'react'
import { Receipt, Plus, X, Printer, Send, FileText, DollarSign, Search, User, Calendar, Trash2, ArrowLeft, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type LineItem = { id: string; description: string; qty: number; unit_price: number }
type Consultation = { id: string; consultation_code: string; consultation_date: string; patient_name: string; patient_phone: string | null; patient_email: string | null }
type DocType = 'receipt' | 'estimate'
type DoctorProfile = { full_name: string; specialty: string; phone: string; email: string }
type GenericPatient = { name: string; phone: string; email: string }

function genDocNumber(type: DocType): string {
  const prefix = type === 'receipt' ? 'REC' : 'PRE'
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
  return `${prefix}-${date}-${Math.floor(1000 + Math.random() * 9000)}`
}

export default function BillingPage() {
  const [view, setView] = useState<'list' | 'new'>('list')
  const [docType, setDocType] = useState<DocType>('receipt')
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [selectedConsult, setSelectedConsult] = useState<Consultation | null>(null)
  const [genericMode, setGenericMode] = useState(false)
  const [genericPatient, setGenericPatient] = useState<GenericPatient>({ name: '', phone: '', email: '' })
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<LineItem[]>([{ id: '1', description: 'Honorarios médicos', qty: 1, unit_price: 20 }])
  const [notes, setNotes] = useState('')
  const [bcvRate, setBcvRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [docStats, setDocStats] = useState({ facturas: 0, recibos: 0, presupuestos: 0, totalFacturas: 0, totalRecibos: 0, totalPresupuestos: 0 })
  const printRef = useRef<HTMLDivElement>(null)

  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const today = new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
  const currentDocNumber = genDocNumber(docType)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      // Get doctor profile
      const { data: profile } = await supabase.from('profiles').select('full_name, specialty, phone, email').eq('id', user.id).single()
      if (profile) setDoctorProfile(profile as DoctorProfile)

      // Get consultations with patient info
      const { data } = await supabase
        .from('consultations')
        .select('id, consultation_code, consultation_date, patients(full_name, phone, email)')
        .eq('doctor_id', user.id)
        .order('consultation_date', { ascending: false })

      setConsultations((data ?? []).map(c => ({
        id: c.id,
        consultation_code: c.consultation_code,
        consultation_date: c.consultation_date,
        patient_name: (!Array.isArray(c.patients) && c.patients) ? (c.patients as { full_name: string }).full_name : 'Paciente',
        patient_phone: (!Array.isArray(c.patients) && c.patients) ? (c.patients as { phone: string | null }).phone : null,
        patient_email: (!Array.isArray(c.patients) && c.patients) ? (c.patients as { email: string | null }).email : null,
      })))

      // Load billing document stats
      const { data: docs } = await supabase
        .from('billing_documents')
        .select('doc_type, total')
        .eq('doctor_id', user.id)

      const stats = {
        facturas: (docs ?? []).filter(d => d.doc_type === 'factura').length,
        recibos: (docs ?? []).filter(d => d.doc_type === 'recibo').length,
        presupuestos: (docs ?? []).filter(d => d.doc_type === 'presupuesto').length,
        totalFacturas: (docs ?? []).filter(d => d.doc_type === 'factura').reduce((s, d) => s + (d.total || 0), 0),
        totalRecibos: (docs ?? []).filter(d => d.doc_type === 'recibo').reduce((s, d) => s + (d.total || 0), 0),
        totalPresupuestos: (docs ?? []).filter(d => d.doc_type === 'presupuesto').reduce((s, d) => s + (d.total || 0), 0),
      }
      setDocStats(stats)
      setLoading(false)
    })

    // BCV rate
    fetch('https://ve.dolarapi.com/v1/dolares/oficial')
      .then(r => r.json()).then(d => { const rate = d.promedio ?? d.precio ?? null; if (rate) setBcvRate(parseFloat(rate)) })
      .catch(() => {})
  }, [])

  function addItem() {
    setItems(prev => [...prev, { id: Date.now().toString(), description: '', qty: 1, unit_price: 0 }])
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function updateItem(id: string, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  function printDocument() {
    if (!printRef.current) return
    const content = printRef.current.innerHTML
    const printWindow = window.open('', '_blank', 'width=800,height=900')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${docType === 'receipt' ? 'Recibo' : 'Presupuesto'} - ${currentDocNumber}</title>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', Arial, sans-serif; }
          body { padding: 40px; color: #1e293b; background: white; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; }
          .logo { display: flex; align-items: center; gap: 12px; }
          .logo-icon { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg,#00C4CC,#0891b2); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; }
          .brand { font-size: 18px; font-weight: 800; color: #00C4CC; }
          .brand-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
          .doc-info { text-align: right; }
          .doc-type { font-size: 22px; font-weight: 800; color: #1e293b; text-transform: uppercase; }
          .doc-number { font-size: 12px; color: #64748b; margin-top: 4px; font-family: monospace; }
          .doc-date { font-size: 11px; color: #94a3b8; margin-top: 2px; }
          .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
          .party-box { background: #f8fafc; border-radius: 12px; padding: 16px; }
          .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 8px; }
          .party-name { font-size: 14px; font-weight: 700; color: #1e293b; }
          .party-detail { font-size: 11px; color: #64748b; margin-top: 2px; }
          .consult-box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 16px; }
          .consult-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #14b8a6; margin-bottom: 2px; }
          .consult-val { font-size: 12px; font-weight: 600; color: #0f766e; font-family: monospace; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          thead { background: linear-gradient(135deg,#00C4CC,#0891b2); }
          thead th { color: white; padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
          thead th:last-child { text-align: right; }
          tbody tr { border-bottom: 1px solid #f1f5f9; }
          tbody td { padding: 10px 12px; font-size: 12px; color: #475569; }
          tbody td:last-child { text-align: right; font-weight: 600; color: #1e293b; }
          .totals { display: flex; justify-content: flex-end; }
          .totals-box { width: 280px; }
          .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; color: #64748b; border-bottom: 1px solid #f1f5f9; }
          .total-final { display: flex; justify-content: space-between; padding: 12px 14px; background: linear-gradient(135deg,#00C4CC,#0891b2); border-radius: 10px; color: white; margin-top: 8px; }
          .total-final-label { font-weight: 700; font-size: 13px; }
          .total-final-amount { font-weight: 800; font-size: 18px; }
          .bcv-note { font-size: 10px; color: #94a3b8; text-align: right; margin-top: 4px; }
          .notes { margin-top: 24px; background: #f8fafc; border-radius: 10px; padding: 14px; }
          .notes-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; letter-spacing: 0.1em; }
          .notes-text { font-size: 11px; color: #475569; line-height: 1.5; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; }
          .estimate-badge { background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; display: inline-block; margin-bottom: 8px; }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  // Effective patient info (from consultation or generic)
  const effectivePatient = genericMode
    ? { name: genericPatient.name || 'Paciente', phone: genericPatient.phone, email: genericPatient.email }
    : selectedConsult
      ? { name: selectedConsult.patient_name, phone: selectedConsult.patient_phone ?? '', email: selectedConsult.patient_email ?? '' }
      : null

  function sendViaWhatsApp() {
    const phone = (effectivePatient?.phone ?? '').replace(/\D/g, '')
    if (!phone) return
    const text = `Hola ${effectivePatient?.name}, te enviamos tu ${docType === 'receipt' ? 'recibo' : 'presupuesto'} N° ${currentDocNumber}.\n\nTotal: $${subtotal.toFixed(2)} USD${bcvRate ? ` (Bs. ${(subtotal * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })})` : ''}\n\nGracias por su preferencia. Delta Medical CRM`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const filteredConsults = consultations.filter(c =>
    !search || c.patient_name.toLowerCase().includes(search.toLowerCase()) || c.consultation_code.toLowerCase().includes(search.toLowerCase())
  )

  if (view === 'new') {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          * { font-family: 'Inter', sans-serif; }
          .g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}
          @media print { .no-print { display: none !important; } }
        `}</style>

        <div className="max-w-4xl space-y-5">
          <div className="no-print flex items-center gap-3">
            <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Volver
            </button>
            <h1 className="text-xl font-bold text-slate-900">{docType === 'receipt' ? 'Nuevo recibo' : 'Nuevo presupuesto'}</h1>
          </div>

          {/* Doc type selector with hover effects */}
          <div className="no-print flex gap-3">
            <button
              onClick={() => setDocType('receipt')}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                docType === 'receipt'
                  ? 'border-teal-400 bg-teal-50 text-teal-700 shadow-md'
                  : 'border-slate-200 text-slate-500 bg-white hover:shadow-lg hover:border-teal-300 hover:scale-[1.02]'
              }`}
            >
              <Receipt className="w-4 h-4" /> Recibo
            </button>
            <button
              onClick={() => setDocType('estimate')}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                docType === 'estimate'
                  ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-md'
                  : 'border-slate-200 text-slate-500 bg-white hover:shadow-lg hover:border-amber-300 hover:scale-[1.02]'
              }`}
            >
              <FileText className="w-4 h-4" /> Presupuesto
            </button>
          </div>

          {/* Mode toggle: consultation or generic */}
          {!selectedConsult && !genericMode && (
            <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-slate-700">¿Para quién es el documento?</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setGenericMode(true)}
                  className="flex items-center gap-3 p-4 border-2 border-slate-200 hover:border-teal-400 rounded-xl text-left transition-all hover:shadow-sm group">
                  <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-teal-500" /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-teal-700">Genérico</p>
                    <p className="text-xs text-slate-400">Sin asociar a consulta</p>
                  </div>
                </button>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-slate-500 mb-1">O selecciona una consulta:</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar paciente..." className={fi + ' pl-9 text-xs py-2'} />
                  </div>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredConsults.map(c => (
                  <button key={c.id} onClick={() => { setSelectedConsult(c); setItems([{ id: '1', description: 'Honorarios médicos', qty: 1, unit_price: 20 }]) }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-teal-50 border border-transparent hover:border-teal-200 transition-all text-left">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-teal-500" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{c.patient_name}</p>
                      <p className="text-xs text-slate-400 font-mono">{c.consultation_code} · {new Date(c.consultation_date).toLocaleDateString('es-VE')}</p>
                    </div>
                  </button>
                ))}
                {filteredConsults.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Sin consultas disponibles</p>}
              </div>
            </div>
          )}

          {/* Generic mode: enter patient manually */}
          {genericMode && !selectedConsult && (
            <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Datos del destinatario</p>
                <button onClick={() => setGenericMode(false)} className="text-xs text-slate-400 hover:text-slate-600">← Volver</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre <span className="text-red-400">*</span></label>
                  <input value={genericPatient.name} onChange={e => setGenericPatient(p => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" className={fi} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                  <input value={genericPatient.phone} onChange={e => setGenericPatient(p => ({ ...p, phone: e.target.value }))} placeholder="+58 412..." className={fi} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input type="email" value={genericPatient.email} onChange={e => setGenericPatient(p => ({ ...p, email: e.target.value }))} placeholder="email@ejemplo.com" className={fi} />
              </div>
            </div>
          )}

          {/* Document editor — shown when consultation selected OR generic mode with name */}
          {(selectedConsult || (genericMode && genericPatient.name.trim())) ? (
            <>
              {/* DOCUMENT PREVIEW */}
              <div ref={printRef} className="bg-white border border-slate-200 rounded-xl p-8">
                {/* Header */}
                <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', paddingBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
                  <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#00C4CC,#0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: 18 }}>Δ</div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#00C4CC' }}>Delta Medical CRM</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{doctorProfile?.specialty || 'Consulta Médica'}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {docType === 'estimate' && <div style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>PRESUPUESTO</div>}
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>{docType === 'receipt' ? 'Recibo' : 'Presupuesto'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>{currentDocNumber}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Fecha: {today}</div>
                  </div>
                </div>

                {/* Parties */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>Médico</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Dr. {doctorProfile?.full_name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{doctorProfile?.specialty}</div>
                    {doctorProfile?.phone && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{doctorProfile.phone}</div>}
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 8 }}>Paciente</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{effectivePatient?.name}</div>
                    {effectivePatient?.phone && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{effectivePatient.phone}</div>}
                    {effectivePatient?.email && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{effectivePatient.email}</div>}
                  </div>
                </div>

                {/* Consultation reference — only when linked to a consultation */}
                {selectedConsult && (
                <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 24 }}>
                  <div><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#14b8a6', marginBottom: 2 }}>Código consulta</div><div style={{ fontSize: 12, fontWeight: 600, color: '#0f766e', fontFamily: 'monospace' }}>{selectedConsult.consultation_code}</div></div>
                  <div><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#14b8a6', marginBottom: 2 }}>Fecha consulta</div><div style={{ fontSize: 12, fontWeight: 600, color: '#0f766e' }}>{new Date(selectedConsult.consultation_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
                </div>
                )}

                {/* Items table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg,#00C4CC,#0891b2)' }}>
                      {['Descripción', 'Cant.', 'P. Unitario', 'Total'].map(h => (
                        <th key={h} style={{ color: 'white', padding: '10px 12px', textAlign: h === 'Total' ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{item.description}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{item.qty}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>${item.unit_price.toFixed(2)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#1e293b', textAlign: 'right' }}>${(item.qty * item.unit_price).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: 280 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                      <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'linear-gradient(135deg,#00C4CC,#0891b2)', borderRadius: 10, color: 'white', marginTop: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Total USD</span>
                      <span style={{ fontWeight: 800, fontSize: 18 }}>${subtotal.toFixed(2)}</span>
                    </div>
                    {bcvRate && <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 4 }}>Equivalente: Bs. {(subtotal * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })} (Tasa BCV)</div>}
                  </div>
                </div>

                {/* Notes */}
                {notes && (
                  <div style={{ marginTop: 24, background: '#f8fafc', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6, letterSpacing: '0.1em' }}>Notas</div>
                    <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{notes}</div>
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>
                  Documento generado por Delta Medical CRM · {docType === 'estimate' ? 'Este presupuesto tiene validez de 30 días' : 'Gracias por su preferencia'}
                </div>
              </div>

              {/* Edit items (no-print) */}
              <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Ítems del documento</p>
                  <button onClick={addItem} className="g-bg flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:opacity-90"><Plus className="w-3.5 h-3.5" />Agregar ítem</button>
                </div>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Descripción" className={fi + ' flex-[3]'} />
                      <input type="number" min="1" value={item.qty} onChange={e => updateItem(item.id, 'qty', parseInt(e.target.value) || 1)} className={fi + ' flex-[1] text-center'} />
                      <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)} className={fi + ' flex-[1] text-right'} />
                      <span className="text-sm font-bold text-slate-600 w-20 text-right shrink-0">${(item.qty * item.unit_price).toFixed(2)}</span>
                      <button onClick={() => removeItem(item.id)} className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notas adicionales</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Indicaciones, condiciones de pago, validez del presupuesto..." className={fi + ' resize-none'} />
                </div>
              </div>

              {/* Actions */}
              <div className="no-print flex gap-3">
                <button
                  onClick={() => { setSelectedConsult(null); setGenericMode(false); setGenericPatient({ name: '', phone: '', email: '' }) }}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:shadow-lg hover:scale-[1.02] transition-all"
                >
                  Cambiar destinatario
                </button>
                <button
                  onClick={sendViaWhatsApp}
                  disabled={!effectivePatient?.phone}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 hover:shadow-lg hover:scale-[1.02] text-white rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:scale-100 disabled:shadow-none"
                >
                  <Send className="w-4 h-4" /> Enviar por WhatsApp
                </button>
                <button
                  onClick={printDocument}
                  className="flex items-center gap-2 g-bg px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 hover:shadow-lg hover:scale-[1.02] ml-auto transition-all"
                >
                  <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
                </button>
              </div>
            </>
          ) : null}
        </div>
      </>
    )
  }

  // LIST VIEW
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Facturación</h1>
            <p className="text-sm text-slate-500">Genera recibos y presupuestos en PDF para tus pacientes</p>
          </div>
          <button onClick={() => setView('new')} className="g-bg flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90">
            <Plus className="w-4 h-4" /> Nuevo documento
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><Receipt className="w-5 h-5 text-teal-600" /></div>
              <span className="text-xs font-bold text-slate-400 uppercase">Recibos</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{docStats.recibos}</p>
            <p className="text-xs text-slate-500 mt-1">${docStats.totalRecibos.toFixed(2)} USD</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><FileText className="w-5 h-5 text-amber-600" /></div>
              <span className="text-xs font-bold text-slate-400 uppercase">Presupuestos</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{docStats.presupuestos}</p>
            <p className="text-xs text-slate-500 mt-1">${docStats.totalPresupuestos.toFixed(2)} USD</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><DollarSign className="w-5 h-5 text-emerald-600" /></div>
              <span className="text-xs font-bold text-slate-400 uppercase">Facturas</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{docStats.facturas}</p>
            <p className="text-xs text-slate-500 mt-1">${docStats.totalFacturas.toFixed(2)} USD</p>
          </div>
        </div>

        {/* Type cards */}
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setView('new')} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-teal-300 hover:shadow-lg hover:scale-[1.02] transition-all text-left cursor-pointer">
            <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center mb-3"><Receipt className="w-5 h-5 text-white" /></div>
            <p className="font-bold text-slate-900">Recibo / Factura</p>
            <p className="text-xs text-slate-500 mt-1">Comprobante de pago de consulta con datos del médico, paciente, ítems y total en USD + Bs.</p>
          </button>
          <button onClick={() => setView('new')} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-amber-300 hover:shadow-lg hover:scale-[1.02] transition-all text-left cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3"><FileText className="w-5 h-5 text-amber-600" /></div>
            <p className="font-bold text-slate-900">Presupuesto</p>
            <p className="text-xs text-slate-500 mt-1">Cotización previa con procedimientos o tratamientos. Válido por 30 días.</p>
          </button>
        </div>

        {/* Recent consultations to bill */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Consultas disponibles para facturar</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-teal-400 bg-white" />
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Cargando consultas...</div>
          ) : filteredConsults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">Sin consultas disponibles</p>
            </div>
          ) : filteredConsults.map((c, i) => (
            <div key={c.id} className={`flex items-center gap-4 px-5 py-4 ${i < filteredConsults.length - 1 ? 'border-b border-slate-100' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-teal-500" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{c.patient_name}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1.5"><span className="font-mono">{c.consultation_code}</span> · <Calendar className="w-3 h-3" />{new Date(c.consultation_date).toLocaleDateString('es-VE')}</p>
              </div>
              <button onClick={() => { setSelectedConsult(c); setItems([{ id: '1', description: 'Honorarios médicos', qty: 1, unit_price: 20 }]); setView('new') }}
                className="flex items-center gap-1.5 px-3 py-1.5 g-bg text-white rounded-lg text-xs font-bold hover:opacity-90">
                <Receipt className="w-3.5 h-3.5" />Facturar
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
