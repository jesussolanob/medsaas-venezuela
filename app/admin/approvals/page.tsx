'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Eye, Loader2, ExternalLink, AlertCircle, CreditCard } from 'lucide-react'

type PendingPayment = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  plan: string
  amount_usd: number
  payment_method: string
  receipt_url: string | null
  submitted_at: string
  status: string
}

const MOCK_PENDING: PendingPayment[] = [
  { id: '1', doctor_id: 'abc', doctor_name: 'Dr. José Rodríguez', doctor_email: 'jose@gmail.com', plan: 'pro', amount_usd: 20, payment_method: 'pago_movil', receipt_url: null, submitted_at: new Date().toISOString(), status: 'pending' },
  { id: '2', doctor_id: 'def', doctor_name: 'Dra. Laura Pérez', doctor_email: 'laura@gmail.com', plan: 'pro', amount_usd: 20, payment_method: 'bank_transfer', receipt_url: null, submitted_at: new Date(Date.now() - 3600000).toISOString(), status: 'pending' },
  { id: '3', doctor_id: 'ghi', doctor_name: 'Dr. Carlos Méndez', doctor_email: 'carlos@gmail.com', plan: 'pro', amount_usd: 20, payment_method: 'zelle', receipt_url: null, submitted_at: new Date(Date.now() - 7200000).toISOString(), status: 'pending' },
]

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  pago_movil: 'Pago Móvil',
  bank_transfer: 'Transferencia',
  zelle: 'Zelle',
  otro: 'Otro',
}

export default function ApprovalsPage() {
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>(MOCK_PENDING)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [receiptModal, setReceiptModal] = useState<string | null>(null)

  function playBeep() {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 880
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
  }

  function handleApprove(paymentId: string) {
    setApprovingId(paymentId)
    playBeep()
    setTimeout(() => {
      setPendingPayments(prev => prev.filter(p => p.id !== paymentId))
      setApprovingId(null)
    }, 1000)
  }

  function handleReject(paymentId: string) {
    setPendingPayments(prev => prev.filter(p => p.id !== paymentId))
  }

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3600000)
    if (h < 1) return 'Hace menos de 1 hora'
    if (h < 24) return `Hace ${h} hora${h > 1 ? 's' : ''}`
    return `Hace ${Math.floor(h / 24)} día(s)`
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }`}</style>

      <div className="space-y-4 sm:space-y-6 w-full max-w-3xl px-4 sm:px-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Aprobaciones</h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">Médicos que subieron comprobante de pago y esperan activación</p>
          </div>
          {pendingPayments.length > 0 && (
            <span className="text-xs sm:text-sm font-bold text-white bg-amber-500 px-3 py-1 rounded-full whitespace-nowrap">
              {pendingPayments.length} pendiente{pendingPayments.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {pendingPayments.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 sm:py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-slate-600 font-semibold">Sin aprobaciones pendientes</p>
            <p className="text-slate-400 text-sm mt-1">Todas las solicitudes han sido procesadas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingPayments.map(payment => (
              <div key={payment.id} className="bg-white rounded-xl border border-amber-100 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold shrink-0">
                    {payment.doctor_name.split(' ').slice(0, 2).map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-0.5">
                      <p className="font-semibold text-slate-900 truncate">{payment.doctor_name}</p>
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">Pendiente</span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">{payment.doctor_email}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {ACCOUNT_TYPE_LABELS[payment.payment_method] ?? payment.payment_method}
                      </span>
                      <span className="text-xs font-bold text-emerald-600">${payment.amount_usd} USD</span>
                      <span className="text-xs text-slate-400">{timeAgo(payment.submitted_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                    {payment.receipt_url ? (
                      <button
                        onClick={() => setReceiptModal(payment.receipt_url)}
                        className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-slate-500 hover:text-teal-600 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:border-teal-300 transition-colors bg-white whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" /> Comprobante
                      </button>
                    ) : (
                      <span className="flex items-center justify-center gap-1 text-xs text-slate-400">
                        <AlertCircle className="w-3.5 h-3.5" /> Sin comprobante
                      </span>
                    )}
                    <button
                      onClick={() => handleReject(payment.id)}
                      className="flex items-center justify-center gap-1.5 text-xs text-red-500 hover:text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Rechazar
                    </button>
                    <button
                      onClick={() => handleApprove(payment.id)}
                      disabled={approvingId === payment.id}
                      className="flex items-center justify-center gap-1.5 text-xs text-white bg-teal-500 hover:bg-teal-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
                    >
                      {approvingId === payment.id ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" />Activando...</>
                      ) : (
                        <><CheckCircle2 className="w-3.5 h-3.5" />Aprobar</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal comprobante */}
        {receiptModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReceiptModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex-shrink-0">
                <h4 className="text-sm font-semibold text-slate-900">Comprobante de pago</h4>
                <button onClick={() => setReceiptModal(null)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
              <div className="p-3 sm:p-4 overflow-y-auto flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receiptModal} alt="Comprobante" className="w-full rounded-xl" />
              </div>
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex justify-end flex-shrink-0">
                <a href={receiptModal} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-teal-600 font-semibold hover:text-teal-700">
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir en nueva pestaña
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
