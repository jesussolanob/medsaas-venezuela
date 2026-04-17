'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Eye, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import Image from 'next/image'

type PendingPayment = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  amount: number
  currency: string
  payment_method: string
  reference_number: string | null
  receipt_url: string | null
  created_at: string
  status: string
}

type ProcessedPayment = PendingPayment & {
  verified_at: string
  verified_by: string | null
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pago_movil: 'Pago Móvil',
  bank_transfer: 'Transferencia',
  zelle: 'Zelle',
  otro: 'Otro',
  direct_transfer: 'Transferencia Directa',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Hace menos de 1 hora'
  if (h < 24) return `Hace ${h} hora${h > 1 ? 's' : ''}`
  const d = Math.floor(h / 24)
  return `Hace ${d} día${d > 1 ? 's' : ''}`
}

function formatCurrency(amount: number, currency: string): string {
  if (currency === 'USD') {
    return `$${amount.toFixed(2)} USD`
  }
  return `${amount.toFixed(2)} ${currency}`
}

interface ApprovalsClientProps {
  pendingPayments: PendingPayment[]
  processedPayments: ProcessedPayment[]
}

export default function ApprovalsClient({ pendingPayments: initialPending, processedPayments: initialProcessed }: ApprovalsClientProps) {
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>(initialPending)
  const [processedPayments, setProcessedPayments] = useState<ProcessedPayment[]>(initialProcessed)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [receiptModal, setReceiptModal] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleApprove(paymentId: string) {
    setApprovingId(paymentId)
    setError(null)
    try {
      const res = await fetch('/api/admin/approve-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, action: 'approve' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al aprobar el pago')
        return
      }

      // Move from pending to processed
      const payment = pendingPayments.find(p => p.id === paymentId)
      if (payment) {
        setPendingPayments(prev => prev.filter(p => p.id !== paymentId))
        setProcessedPayments(prev => [
          {
            ...payment,
            status: 'approved',
            verified_at: new Date().toISOString(),
            verified_by: 'current_user',
          },
          ...prev,
        ])
      }
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setApprovingId(null)
    }
  }

  async function handleReject(paymentId: string) {
    setRejectingId(paymentId)
    setError(null)
    try {
      const res = await fetch('/api/admin/approve-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, action: 'reject' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al rechazar el pago')
        return
      }

      // Move from pending to processed
      const payment = pendingPayments.find(p => p.id === paymentId)
      if (payment) {
        setPendingPayments(prev => prev.filter(p => p.id !== paymentId))
        setProcessedPayments(prev => [
          {
            ...payment,
            status: 'rejected',
            verified_at: new Date().toISOString(),
            verified_by: 'current_user',
          },
          ...prev,
        ])
      }
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setRejectingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Aprobado</span>
      case 'rejected':
        return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Rechazado</span>
      case 'pending':
      default:
        return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pendiente</span>
    }
  }

  const getAvatarBg = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-500'
      case 'rejected':
        return 'bg-red-500'
      case 'pending':
      default:
        return 'bg-amber-500'
    }
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }`}</style>

      <div className="space-y-4 sm:space-y-6 w-full max-w-4xl px-4 sm:px-0">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Pending Payments Section */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Aprobaciones Pendientes</h2>
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
                    <div className={`w-10 h-10 rounded-full ${getAvatarBg(payment.status)} flex items-center justify-center text-white font-bold shrink-0`}>
                      {payment.doctor_name.split(' ').slice(0, 2).map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-0.5">
                        <p className="font-semibold text-slate-900 truncate">{payment.doctor_name}</p>
                        {getStatusBadge(payment.status)}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{payment.doctor_email}</p>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                        </span>
                        <span className="text-xs font-bold text-emerald-600">{formatCurrency(payment.amount, payment.currency)}</span>
                        {payment.reference_number && (
                          <span className="text-xs text-slate-400">Ref: {payment.reference_number}</span>
                        )}
                        <span className="text-xs text-slate-400">{timeAgo(payment.created_at)}</span>
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
                        disabled={rejectingId === payment.id || approvingId === payment.id}
                        className="flex items-center justify-center gap-1.5 text-xs text-red-500 hover:text-red-600 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap disabled:opacity-60"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Rechazar
                      </button>
                      <button
                        onClick={() => handleApprove(payment.id)}
                        disabled={approvingId === payment.id || rejectingId === payment.id}
                        className="flex items-center justify-center gap-1.5 text-xs text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap font-medium"
                      >
                        {approvingId === payment.id ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" />Aprobando...</>
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
        </div>

        {/* Processed Payments History */}
        {processedPayments.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-4">Histórico de Procesadas</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Médico</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Monto</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Método</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Estado</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {processedPayments.map(payment => (
                    <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-900">{payment.doctor_name}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{formatCurrency(payment.amount, payment.currency)}</td>
                      <td className="py-3 px-4 text-slate-600">{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</td>
                      <td className="py-3 px-4">{getStatusBadge(payment.status)}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{timeAgo(payment.verified_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Receipt Modal */}
        {receiptModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReceiptModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex-shrink-0">
                <h4 className="text-sm font-semibold text-slate-900">Comprobante de pago</h4>
                <button onClick={() => setReceiptModal(null)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>
              <div className="p-3 sm:p-4 overflow-y-auto flex-1">
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
