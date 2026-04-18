'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  ExternalLink,
  AlertCircle,
  Clock,
  AlertTriangle,
  FileText,
  Send,
  CheckCheck,
} from 'lucide-react'

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

type NewSubscription = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  specialty: string | null
  plan: string
  status: string
  started_at: string
  expires_at: string
}

type ExpiringSubscription = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  specialty: string | null
  plan: string
  status: string
  expires_at: string
  days_remaining: number
}

type ApprovedPayment = {
  id: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  amount: number
  currency: string
  payment_method: string
  created_at: string
}

type Invoice = {
  id: string
  invoice_number: string
  doctor_id: string
  doctor_name: string
  doctor_email: string
  amount: number
  currency: string
  description: string | null
  status: string
  issued_at: string
  sent_at: string | null
  paid_at: string | null
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

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('es-VE', { month: 'short', day: 'numeric', year: 'numeric' })
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
  newSubscriptions: NewSubscription[]
  expiringSubscriptions: ExpiringSubscription[]
  approvedPayments: ApprovedPayment[]
  invoices: Invoice[]
}

export default function ApprovalsClient({
  pendingPayments: initialPending,
  processedPayments: initialProcessed,
  newSubscriptions: initialNewSubs,
  expiringSubscriptions: initialExpiringSubs,
  approvedPayments: initialApprovedPayments,
  invoices: initialInvoices,
}: ApprovalsClientProps) {
  const [activeTab, setActiveTab] = useState<'payments' | 'new' | 'expiring' | 'billing'>('payments')
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>(initialPending)
  const [processedPayments, setProcessedPayments] = useState<ProcessedPayment[]>(initialProcessed)
  const [newSubscriptions, setNewSubscriptions] = useState<NewSubscription[]>(initialNewSubs)
  const [expiringSubscriptions, setExpiringSubscriptions] = useState<ExpiringSubscription[]>(
    initialExpiringSubs,
  )
  const [approvedPayments, setApprovedPayments] = useState<ApprovedPayment[]>(initialApprovedPayments)
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [receiptModal, setReceiptModal] = useState<string | null>(null)
  const [creatingInvoiceId, setCreatingInvoiceId] = useState<string | null>(null)
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Date filter for billing tab
  const today = new Date()
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const defaultDateFrom = firstDayOfMonth.toISOString().split('T')[0]
  const defaultDateTo = today.toISOString().split('T')[0]

  const [billingDateFrom, setBillingDateFrom] = useState<string>(defaultDateFrom)
  const [billingDateTo, setBillingDateTo] = useState<string>(defaultDateTo)

  async function handleApprovePayment(paymentId: string) {
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
        setSuccessMessage('Pago aprobado exitosamente. Suscripción extendida 30 días.')
        setTimeout(() => setSuccessMessage(null), 4000)
      }
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setApprovingId(null)
    }
  }

  async function handleRejectPayment(paymentId: string) {
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
        setSuccessMessage('Pago rechazado.')
        setTimeout(() => setSuccessMessage(null), 3000)
      }
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setRejectingId(null)
    }
  }

  async function handleActivatePro(subscriptionId: string) {
    setExtendingId(subscriptionId)
    setError(null)
    try {
      const res = await fetch('/api/admin/extend-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, days: 30, newPlan: 'pro' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al activar PRO')
        return
      }

      setNewSubscriptions(prev => prev.filter(s => s.id !== subscriptionId))
      setSuccessMessage('Plan PRO activado. Suscripción extendida 30 días.')
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setExtendingId(null)
    }
  }

  async function handleExtendSubscription(subscriptionId: string) {
    setExtendingId(subscriptionId)
    setError(null)
    try {
      const res = await fetch('/api/admin/extend-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, days: 30 }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al extender suscripción')
        return
      }

      setExpiringSubscriptions(prev => prev.filter(s => s.id !== subscriptionId))
      setSuccessMessage('Suscripción extendida 30 días exitosamente.')
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setExtendingId(null)
    }
  }

  async function handleCreateInvoice(paymentId: string) {
    setCreatingInvoiceId(paymentId)
    setError(null)
    try {
      const payment = approvedPayments.find(p => p.id === paymentId)
      if (!payment) {
        setError('Pago no encontrado')
        return
      }

      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: payment.doctor_id,
          amount: payment.amount,
          currency: payment.currency,
          description: `Pago de suscripción - ${payment.payment_method}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al crear factura')
        return
      }

      const data = await res.json()
      setInvoices(prev => [data.invoice, ...prev])
      setApprovedPayments(prev => prev.filter(p => p.id !== paymentId))
      setSuccessMessage(`Factura ${data.invoice.invoice_number} creada exitosamente.`)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setCreatingInvoiceId(null)
    }
  }

  async function handleSendInvoice(invoiceId: string) {
    setSendingInvoiceId(invoiceId)
    setError(null)
    try {
      const res = await fetch('/api/admin/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al enviar factura')
        return
      }

      const data = await res.json()
      setInvoices(prev =>
        prev.map(inv =>
          inv.id === invoiceId
            ? { ...inv, status: 'sent', sent_at: new Date().toISOString() }
            : inv
        )
      )
      setSuccessMessage(data.message)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setSendingInvoiceId(null)
    }
  }

  async function handleMarkInvoicePaid(invoiceId: string) {
    setMarkingPaidId(invoiceId)
    setError(null)
    try {
      const res = await fetch('/api/admin/mark-invoice-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al marcar factura como pagada')
        return
      }

      const data = await res.json()
      setInvoices(prev =>
        prev.map(inv =>
          inv.id === invoiceId
            ? { ...inv, status: 'paid', paid_at: new Date().toISOString() }
            : inv
        )
      )
      setSuccessMessage(data.message)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err) {
      setError('Error al conectar con el servidor')
      console.error(err)
    } finally {
      setMarkingPaidId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            Aprobado
          </span>
        )
      case 'rejected':
        return (
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            Rechazado
          </span>
        )
      case 'pending':
      default:
        return (
          <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
            Pendiente
          </span>
        )
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

  const getSubscriptionStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            Activa
          </span>
        )
      case 'trial':
        return (
          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            Trial
          </span>
        )
      case 'suspended':
        return (
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            Suspendida
          </span>
        )
      default:
        return (
          <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full">
            {status}
          </span>
        )
    }
  }

  const getExpiringBadge = (daysRemaining: number) => {
    if (daysRemaining <= 3) {
      return (
        <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
          {daysRemaining} día{daysRemaining !== 1 ? 's' : ''} restante
        </span>
      )
    } else if (daysRemaining <= 7) {
      return (
        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
          {daysRemaining} día{daysRemaining !== 1 ? 's' : ''} restante
        </span>
      )
    } else {
      return (
        <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
          {daysRemaining} día{daysRemaining !== 1 ? 's' : ''} restante
        </span>
      )
    }
  }

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'issued':
        return (
          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            Emitida
          </span>
        )
      case 'sent':
        return (
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            Enviada
          </span>
        )
      case 'paid':
        return (
          <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
            Pagada
          </span>
        )
      default:
        return (
          <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full">
            {status}
          </span>
        )
    }
  }

  const getAvatarInitials = (name: string) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0])
      .join('')
  }

  // Filter invoices by date range
  const filteredInvoices = invoices.filter(inv => {
    if (billingDateFrom && inv.issued_at < billingDateFrom) return false
    if (billingDateTo && inv.issued_at > billingDateTo + 'T23:59:59') return false
    return true
  })

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }`}</style>

      <div className="space-y-6 w-full max-w-5xl px-4 sm:px-0">
        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm text-emerald-700">{successMessage}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-200">
            <TabButton
              active={activeTab === 'payments'}
              onClick={() => setActiveTab('payments')}
              label="Pagos Pendientes"
              count={pendingPayments.length}
              badgeColor="red"
            />
            <TabButton
              active={activeTab === 'new'}
              onClick={() => setActiveTab('new')}
              label="Nuevas Suscripciones"
              count={newSubscriptions.length}
              badgeColor="teal"
            />
            <TabButton
              active={activeTab === 'expiring'}
              onClick={() => setActiveTab('expiring')}
              label="Próximas a Vencer"
              count={expiringSubscriptions.length}
              badgeColor="teal"
            />
            <TabButton
              active={activeTab === 'billing'}
              onClick={() => setActiveTab('billing')}
              label="Facturación"
            />
          </div>

          <div className="p-6">
            {/* Tab 1: Pending Payments */}
            {activeTab === 'payments' && (
              <div>
                {pendingPayments.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
                    title="Sin aprobaciones pendientes"
                    description="Todas las solicitudes de pago han sido procesadas."
                  />
                ) : (
                  <div className="space-y-4">
                    {pendingPayments.map(payment => (
                      <div key={payment.id} className="border border-amber-100 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          <div className={`w-10 h-10 rounded-full ${getAvatarBg(payment.status)} flex items-center justify-center text-white font-bold shrink-0`}>
                            {getAvatarInitials(payment.doctor_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                              <p className="font-semibold text-slate-900">{payment.doctor_name}</p>
                              {getStatusBadge(payment.status)}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">{payment.doctor_email}</p>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                              </span>
                              <span className="text-xs font-bold text-emerald-600">
                                {formatCurrency(payment.amount, payment.currency)}
                              </span>
                              {payment.reference_number && (
                                <span className="text-xs text-slate-400">
                                  Ref: {payment.reference_number}
                                </span>
                              )}
                              <span className="text-xs text-slate-400">{timeAgo(payment.created_at)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                            {payment.receipt_url ? (
                              <button
                                onClick={() => setReceiptModal(payment.receipt_url)}
                                className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-teal-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:border-teal-300 transition-colors whitespace-nowrap"
                              >
                                <Eye className="w-3.5 h-3.5" /> Ver comprobante
                              </button>
                            ) : (
                              <span className="flex items-center justify-center gap-1 text-xs text-slate-400">
                                <AlertCircle className="w-3.5 h-3.5" /> Sin comprobante
                              </span>
                            )}
                            <button
                              onClick={() => handleRejectPayment(payment.id)}
                              disabled={
                                rejectingId === payment.id || approvingId === payment.id
                              }
                              className="flex items-center justify-center gap-1.5 text-xs text-red-500 hover:text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap disabled:opacity-60"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Rechazar
                            </button>
                            <button
                              onClick={() => handleApprovePayment(payment.id)}
                              disabled={
                                approvingId === payment.id || rejectingId === payment.id
                              }
                              className="flex items-center justify-center gap-1.5 text-xs text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap font-medium"
                            >
                              {approvingId === payment.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Aprobando...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Aprobar
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* History */}
                {processedPayments.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      Histórico Reciente
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Médico
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Monto
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Método
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Estado
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Fecha
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {processedPayments.map(payment => (
                            <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-3 px-4 text-slate-900">{payment.doctor_name}</td>
                              <td className="py-3 px-4 font-semibold text-slate-900">
                                {formatCurrency(payment.amount, payment.currency)}
                              </td>
                              <td className="py-3 px-4 text-slate-600">
                                {PAYMENT_METHOD_LABELS[payment.payment_method] ??
                                  payment.payment_method}
                              </td>
                              <td className="py-3 px-4">{getStatusBadge(payment.status)}</td>
                              <td className="py-3 px-4 text-slate-500 text-xs">
                                {timeAgo(payment.verified_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: New Subscriptions */}
            {activeTab === 'new' && (
              <div>
                {newSubscriptions.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
                    title="Sin nuevas suscripciones"
                    description="No hay suscripciones creadas en los últimos 30 días."
                  />
                ) : (
                  <div className="space-y-4">
                    {newSubscriptions.map(sub => (
                      <div key={sub.id} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold shrink-0">
                            {getAvatarInitials(sub.doctor_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                              <p className="font-semibold text-slate-900">{sub.doctor_name}</p>
                              {getSubscriptionStatusBadge(sub.status)}
                            </div>
                            <p className="text-xs text-slate-400 mb-1">{sub.doctor_email}</p>
                            {sub.specialty && (
                              <p className="text-xs text-slate-500 mb-2">{sub.specialty}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                              <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                                Plan: {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}
                              </span>
                              <span className="text-xs text-slate-500">
                                Inicio: {formatDate(sub.started_at)}
                              </span>
                              <span className="text-xs text-slate-500">
                                Vence: {formatDate(sub.expires_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                            {sub.plan === 'free' && (
                              <button
                                onClick={() => handleActivatePro(sub.id)}
                                disabled={extendingId === sub.id}
                                className="flex items-center justify-center gap-1.5 text-xs text-white bg-teal-500 hover:bg-teal-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap font-medium"
                              >
                                {extendingId === sub.id ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Activando...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Activar PRO
                                  </>
                                )}
                              </button>
                            )}
                            <button className="flex items-center justify-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors whitespace-nowrap">
                              <Eye className="w-3.5 h-3.5" /> Ver perfil
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Expiring Subscriptions */}
            {activeTab === 'expiring' && (
              <div>
                {expiringSubscriptions.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" />}
                    title="Sin suscripciones por vencer"
                    description="No hay suscripciones próximas a vencer en los próximos 14 días."
                  />
                ) : (
                  <div className="space-y-4">
                    {expiringSubscriptions.map(sub => (
                      <div
                        key={sub.id}
                        className={`border rounded-lg p-4 ${
                          sub.days_remaining <= 3
                            ? 'border-red-100 bg-red-50'
                            : sub.days_remaining <= 7
                              ? 'border-amber-100 bg-amber-50'
                              : 'border-yellow-100 bg-yellow-50'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                            {getAvatarInitials(sub.doctor_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                              <p className="font-semibold text-slate-900">{sub.doctor_name}</p>
                              {getExpiringBadge(sub.days_remaining)}
                            </div>
                            <p className="text-xs text-slate-400 mb-1">{sub.doctor_email}</p>
                            {sub.specialty && (
                              <p className="text-xs text-slate-500 mb-2">{sub.specialty}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                              <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                                Plan: {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}
                              </span>
                              <span className="text-xs text-slate-500">
                                Vence: {formatDate(sub.expires_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                            <button
                              onClick={() => handleExtendSubscription(sub.id)}
                              disabled={extendingId === sub.id}
                              className="flex items-center justify-center gap-1.5 text-xs text-white bg-teal-500 hover:bg-teal-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap font-medium"
                            >
                              {extendingId === sub.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Extendiendo...
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3.5 h-3.5" />
                                  Extender 30 días
                                </>
                              )}
                            </button>
                            <button className="flex items-center justify-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors whitespace-nowrap">
                              <AlertTriangle className="w-3.5 h-3.5" /> Recordatorio
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Billing/Invoices */}
            {activeTab === 'billing' && (
              <div className="space-y-8">
                {/* Date Filter */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">Desde:</label>
                    <input
                      type="date"
                      value={billingDateFrom}
                      onChange={(e) => setBillingDateFrom(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">Hasta:</label>
                    <input
                      type="date"
                      value={billingDateTo}
                      onChange={(e) => setBillingDateTo(e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setBillingDateFrom(defaultDateFrom)
                      setBillingDateTo(defaultDateTo)
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Limpiar filtro
                  </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-100 rounded-lg p-4">
                    <p className="text-xs text-slate-600 font-medium mb-1">Total facturas emitidas</p>
                    <p className="text-2xl font-bold text-slate-900">{filteredInvoices.length}</p>
                  </div>
                  <div className="bg-gradient-to-br from-teal-50 to-slate-50 border border-teal-100 rounded-lg p-4">
                    <p className="text-xs text-slate-600 font-medium mb-1">Monto total facturado</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-slate-50 border border-amber-100 rounded-lg p-4">
                    <p className="text-xs text-slate-600 font-medium mb-1">Pendientes de envío</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {filteredInvoices.filter(inv => inv.sent_at === null).length}
                    </p>
                  </div>
                </div>

                {/* Approved Payments Section */}
                {approvedPayments.length > 0 && (
                  <div className="pt-6 border-t border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      Suscripciones Pagadas (Sin Factura)
                    </h3>
                    <div className="space-y-4">
                      {approvedPayments.map(payment => (
                        <div key={payment.id} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold shrink-0">
                              {getAvatarInitials(payment.doctor_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900">{payment.doctor_name}</p>
                              <p className="text-xs text-slate-400 mb-2">{payment.doctor_email}</p>
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <span className="text-xs font-bold text-emerald-600">
                                  {formatCurrency(payment.amount, payment.currency)}
                                </span>
                                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                  {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                                </span>
                                <span className="text-xs text-slate-400">{formatDate(payment.created_at)}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleCreateInvoice(payment.id)}
                              disabled={creatingInvoiceId === payment.id}
                              className="flex items-center justify-center gap-1.5 text-xs text-white bg-teal-500 hover:bg-teal-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap font-medium"
                            >
                              {creatingInvoiceId === payment.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Creando...
                                </>
                              ) : (
                                <>
                                  <FileText className="w-3.5 h-3.5" />
                                  Emitir Factura
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Issued Invoices Section */}
                {filteredInvoices.length > 0 ? (
                  <div className="pt-6 border-t border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Facturas Emitidas</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Nº Factura
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Médico
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Monto
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Estado
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Fecha Emisión
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Fecha Envío
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-slate-700">
                              Acciones
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInvoices.map(invoice => (
                            <tr key={invoice.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-3 px-4 font-mono text-xs font-semibold text-teal-600">
                                {invoice.invoice_number}
                              </td>
                              <td className="py-3 px-4 text-slate-900">
                                <div>
                                  <p className="font-medium">{invoice.doctor_name}</p>
                                  <p className="text-xs text-slate-400">{invoice.doctor_email}</p>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-900">
                                {formatCurrency(invoice.amount, invoice.currency)}
                              </td>
                              <td className="py-3 px-4">{getInvoiceStatusBadge(invoice.status)}</td>
                              <td className="py-3 px-4 text-slate-500 text-xs">
                                {formatDate(invoice.issued_at)}
                              </td>
                              <td className="py-3 px-4 text-slate-500 text-xs">
                                {invoice.sent_at ? formatDate(invoice.sent_at) : '-'}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {invoice.status === 'issued' && (
                                    <button
                                      onClick={() => handleSendInvoice(invoice.id)}
                                      disabled={sendingInvoiceId === invoice.id}
                                      className="flex items-center justify-center gap-1 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 px-2 py-1 rounded transition-colors disabled:opacity-60 whitespace-nowrap"
                                    >
                                      {sendingInvoiceId === invoice.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Send className="w-3 h-3" />
                                      )}
                                      Enviar
                                    </button>
                                  )}
                                  {['sent', 'issued'].includes(invoice.status) && (
                                      <button
                                        onClick={() => handleMarkInvoicePaid(invoice.id)}
                                        disabled={markingPaidId === invoice.id}
                                        className="flex items-center justify-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 px-2 py-1 rounded transition-colors disabled:opacity-60 whitespace-nowrap"
                                      >
                                        {markingPaidId === invoice.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <CheckCheck className="w-3 h-3" />
                                        )}
                                        Pagada
                                      </button>
                                    )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  approvedPayments.length === 0 && (
                    <EmptyState
                      icon={<FileText className="w-8 h-8 text-slate-400" />}
                      title="Sin facturas"
                      description="No hay facturas emitidas ni pagos pendientes de facturación."
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setReceiptModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h4 className="text-sm font-semibold text-slate-900">Comprobante de pago</h4>
              <button
                onClick={() => setReceiptModal(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <img src={receiptModal} alt="Comprobante" className="w-full rounded-xl" />
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end flex-shrink-0">
              <a
                href={receiptModal}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs text-teal-600 font-semibold hover:text-teal-700"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en nueva pestaña
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  badgeColor?: 'red' | 'teal'
}

function TabButton({ active, onClick, label, count, badgeColor = 'teal' }: TabButtonProps) {
  const badgeColorClass = badgeColor === 'red' ? 'bg-red-500' : 'bg-teal-500'

  return (
    <button
      onClick={onClick}
      className={`flex-1 py-4 px-4 text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'text-teal-600 border-teal-500 bg-teal-50'
          : 'text-slate-600 border-transparent hover:text-slate-900'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-2 ${badgeColorClass} text-white text-xs font-bold rounded-full px-2 py-0.5`}>
          {count}
        </span>
      )}
    </button>
  )
}

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <p className="text-slate-600 font-semibold">{title}</p>
      <p className="text-slate-400 text-sm mt-1">{description}</p>
    </div>
  )
}
