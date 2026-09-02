'use client';

/**
 * QuoteDetailClient
 *
 * Displays a single cotización with read + edit modes.
 * Status determines which actions are available:
 *   DRAFT  → edit items, discount, notes, validity; delete; send
 *   SENT   → mark as accepted / rejected; share link
 *   ACCEPTED/REJECTED/EXPIRED → read-only
 *
 * §4.1: the notes field always shows the public-visibility warning in edit mode.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Copy,
  Check,
  Plus,
  Loader2,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import {
  updateQuote,
  deleteQuote,
  sendQuote,
  updateQuoteStatus,
  type QuoteRow,
  type QuoteItemRow,
  type QuoteStatus,
  type QuoteItemInput,
} from '../actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-sky-50 text-sky-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
  expired: 'bg-amber-50 text-amber-700',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dateStr = iso.includes('T') ? (iso.split('T')[0] ?? iso) : iso;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function usdFmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Editable item state (local draft while in edit mode)
// ---------------------------------------------------------------------------

interface EditItem {
  _key: string;
  /** Existing item id (undefined for newly added rows). */
  id?: string;
  kind: 'service' | 'product';
  name: string;
  description: string;
  quantity: string;
  unit_price_usd: string;
}

function itemToInput(item: EditItem, index: number): QuoteItemInput {
  return {
    kind: item.kind,
    name: item.name.trim(),
    description: item.description.trim() || undefined,
    quantity: parseFloat(item.quantity) || 1,
    unit_price_usd: parseFloat(item.unit_price_usd) || 0,
    sort_order: index,
  };
}

function existingToEdit(row: QuoteItemRow): EditItem {
  return {
    _key: row.id,
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    quantity: String(row.quantity),
    unit_price_usd: String(row.unit_price_usd),
  };
}

function newEditItem(): EditItem {
  return {
    _key: Math.random().toString(36).slice(2),
    kind: 'service',
    name: '',
    description: '',
    quantity: '1',
    unit_price_usd: '',
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  initialQuote: QuoteRow;
}

// ---------------------------------------------------------------------------
// Send modal
// ---------------------------------------------------------------------------

interface SendModalProps {
  quoteId: string;
  onClose: () => void;
  onSent: (updated: QuoteRow) => void;
}

function SendModal({ quoteId, onClose, onSent }: SendModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await sendQuote(quoteId, {
        recipient_email: email.trim() || null,
        recipient_name: name.trim() || null,
      });
      if (result.error || !result.quote) {
        showToast({ type: 'error', message: result.error ?? 'Error al enviar la cotización' });
        return;
      }
      showToast({ type: 'success', message: 'Cotización enviada' });
      onSent(result.quote);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" role="dialog">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Enviar cotización</h2>
        <p className="text-xs text-slate-500 mb-4">
          Podés especificar el correo del destinatario. El sistema generará un enlace de acceso con
          el que podrá ver y descargar el presupuesto.
        </p>
        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Nombre del destinatario
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (opcional)"
              className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com (opcional)"
              className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuoteDetailClient({ initialQuote }: Props) {
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteRow>(initialQuote);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>(initialQuote.items.map(existingToEdit));
  const [editDiscount, setEditDiscount] = useState(String(initialQuote.discount_usd));
  const [editNotes, setEditNotes] = useState(initialQuote.notes);
  const [editValidUntil, setEditValidUntil] = useState(initialQuote.valid_until ?? '');

  // Action state
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const isDraft = quote.status === 'draft';
  const isSent = quote.status === 'sent';

  // share_url comes from the backend (set after send). null = not yet sent.
  const shareUrl = quote.share_url ?? null;

  // ---------------------------------------------------------------------------
  // Enter edit mode
  // ---------------------------------------------------------------------------

  function startEdit() {
    setEditItems(quote.items.map(existingToEdit));
    setEditDiscount(String(quote.discount_usd));
    setEditNotes(quote.notes);
    setEditValidUntil(quote.valid_until ?? '');
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  // ---------------------------------------------------------------------------
  // Save edits
  // ---------------------------------------------------------------------------

  async function saveEdits() {
    for (const it of editItems) {
      if (!it.name.trim()) {
        showToast({ type: 'error', message: 'Todos los ítems deben tener un nombre.' });
        return;
      }
    }
    if (editItems.length === 0) {
      showToast({ type: 'error', message: 'Debe haber al menos un ítem.' });
      return;
    }

    setSaving(true);
    try {
      const result = await updateQuote(quote.id, {
        valid_until: editValidUntil || null,
        notes: editNotes,
        discount_usd: parseFloat(editDiscount) || 0,
        items: editItems.map(itemToInput),
      });
      if (result.error || !result.quote) {
        showToast({ type: 'error', message: result.error ?? 'Error al guardar los cambios.' });
        return;
      }
      setQuote(result.quote);
      setEditMode(false);
      showToast({ type: 'success', message: 'Cambios guardados' });
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteQuote(quote.id);
      if (result.error) {
        showToast({ type: 'error', message: result.error });
        return;
      }
      showToast({ type: 'success', message: 'Cotización eliminada' });
      router.replace('/doctor/quotes');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Status updates
  // ---------------------------------------------------------------------------

  async function markStatus(status: 'accepted' | 'rejected' | 'expired') {
    setSaving(true);
    try {
      const result = await updateQuoteStatus(quote.id, status);
      if (result.error || !result.quote) {
        showToast({ type: 'error', message: result.error ?? 'Error al actualizar el estado.' });
        return;
      }
      setQuote(result.quote);
      showToast({
        type: 'success',
        message:
          status === 'accepted'
            ? 'Cotización marcada como aceptada'
            : status === 'rejected'
              ? 'Cotización marcada como rechazada'
              : 'Cotización marcada como vencida',
      });
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // PDF download — client-side via pdf().toBlob() (spec §5)
  // The server route /api/quotes/:token/pdf is only for the public share link.
  // ---------------------------------------------------------------------------

  async function downloadPdf() {
    showToast({ type: 'success', message: 'Generando PDF...' });
    try {
      const [{ pdf }, QuotePdfModule] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/QuotePdf'),
      ]);
      const QuotePdf = QuotePdfModule.default;

      const React = (await import('react')).default;
      const element = React.createElement(QuotePdf, {
        quoteNumber: quote.quote_number,
        status: quote.status,
        validUntil: quote.valid_until,
        notes: quote.notes,
        subtotal_usd: quote.subtotal_usd,
        discount_usd: quote.discount_usd,
        total_usd: quote.total_usd,
        bcv_rate: quote.bcv_rate,
        total_bs: quote.total_bs,
        created_at: quote.created_at,
        recipientName: quote.patient_id ? 'Paciente' : 'Prospecto',
        items: quote.items.map((it) => ({
          kind: it.kind,
          name: it.name,
          description: it.description,
          quantity: it.quantity,
          unit_price_usd: it.unit_price_usd,
          amount_usd: it.amount_usd,
        })),
        doctor: { fullName: '', specialty: null, licenseNumber: null },
        templateConfig: null,
      });

      const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `Cotizacion-${quote.quote_number}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(anchor);
      }, 1000);
    } catch {
      showToast({ type: 'error', message: 'No se pudo generar el PDF.' });
    }
  }

  // ---------------------------------------------------------------------------
  // Copy share link
  // ---------------------------------------------------------------------------

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast({ type: 'success', message: 'Enlace copiado' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({ type: 'error', message: 'No se pudo copiar el enlace.' });
    }
  }

  // ---------------------------------------------------------------------------
  // Edit mode: item helpers
  // ---------------------------------------------------------------------------

  function addEditItem() {
    setEditItems((prev) => [...prev, newEditItem()]);
  }

  function removeEditItem(key: string) {
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((it) => it._key !== key));
  }

  function updateEditItem(key: string, patch: Partial<EditItem>) {
    setEditItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  // ---------------------------------------------------------------------------
  // Computed totals
  // ---------------------------------------------------------------------------

  const subtotal = editMode
    ? editItems.reduce((s, it) => {
        return s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price_usd) || 0);
      }, 0)
    : quote.subtotal_usd;
  const discountVal = editMode ? parseFloat(editDiscount) || 0 : quote.discount_usd;
  const totalVal = Math.max(0, subtotal - discountVal);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="space-y-5 max-w-3xl mx-auto">
        {/* Back + header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/doctor/quotes')}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Volver a cotizaciones"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800 font-mono">{quote.quote_number}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[quote.status]}`}
            >
              {STATUS_LABELS[quote.status]}
            </span>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* PDF download — always available */}
            <button
              type="button"
              onClick={downloadPdf}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>

            {/* Share link — only when backend provides share_url */}
            {shareUrl && (
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Copiar enlace
              </button>
            )}

            {/* Draft actions */}
            {isDraft && !editMode && (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setShowSendModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar
                </button>
              </>
            )}

            {/* Edit mode actions */}
            {isDraft && editMode && (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveEdits}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Guardar
                </button>
              </>
            )}

            {/* Sent actions */}
            {isSent && (
              <>
                <button
                  type="button"
                  onClick={() => markStatus('accepted')}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Aceptado
                </button>
                <button
                  type="button"
                  onClick={() => markStatus('rejected')}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Rechazado
                </button>
                <button
                  type="button"
                  onClick={() => markStatus('expired')}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Vencido
                </button>
              </>
            )}
          </div>
        </div>

        {/* Meta card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Creado
            </p>
            <p className="text-slate-700 font-medium">{formatDate(quote.created_at)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Válido hasta
            </p>
            {editMode ? (
              <input
                type="date"
                value={editValidUntil}
                onChange={(e) => setEditValidUntil(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="text-sm border border-slate-200 rounded-lg py-1.5 px-2.5 outline-none focus:border-teal-400 bg-white text-slate-600 w-full"
              />
            ) : (
              <p className="text-slate-700 font-medium">{formatDate(quote.valid_until)}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Destinatario
            </p>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                quote.patient_id ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {quote.patient_id ? 'Paciente' : 'Prospecto'}
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              {quote.sent_at ? 'Enviado' : 'Estado'}
            </p>
            <p className="text-slate-700 font-medium">
              {quote.sent_at ? formatDate(quote.sent_at) : STATUS_LABELS[quote.status]}
            </p>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">Ítems</h2>
            {editMode && (
              <button
                type="button"
                onClick={addEditItem}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar ítem
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-8">
                    Tipo
                  </th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Nombre
                  </th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-20">
                    Cant.
                  </th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28">
                    Precio unit.
                  </th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28">
                    Subtotal
                  </th>
                  {editMode && <th className="px-4 py-2.5 w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {editMode
                  ? editItems.map((it) => (
                      <tr key={it._key} className="bg-white">
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              it.kind === 'service'
                                ? 'bg-teal-50 text-teal-700'
                                : 'bg-violet-50 text-violet-700'
                            }`}
                          >
                            {it.kind === 'service' ? 'S' : 'P'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={it.name}
                            onChange={(e) => updateEditItem(it._key, { name: e.target.value })}
                            placeholder="Nombre del ítem"
                            className="w-full text-xs border border-slate-200 rounded-lg py-1.5 px-2 outline-none focus:border-teal-400 bg-white"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={it.quantity}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9.]/g, '');
                              updateEditItem(it._key, { quantity: v });
                            }}
                            className="w-full text-xs border border-slate-200 rounded-lg py-1.5 px-2 outline-none focus:border-teal-400 bg-white text-right"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                              $
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={it.unit_price_usd}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.]/g, '');
                                updateEditItem(it._key, { unit_price_usd: v });
                              }}
                              placeholder="0.00"
                              className="w-full text-xs border border-slate-200 rounded-lg py-1.5 pl-4 pr-2 outline-none focus:border-teal-400 bg-white text-right"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-[12px] font-semibold text-slate-700">
                          {usdFmt(
                            (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price_usd) || 0),
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => removeEditItem(it._key)}
                            disabled={editItems.length <= 1}
                            className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30"
                            aria-label="Eliminar ítem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  : quote.items.map((it) => (
                      <tr key={it.id} className="bg-white hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              it.kind === 'service'
                                ? 'bg-teal-50 text-teal-700'
                                : 'bg-violet-50 text-violet-700'
                            }`}
                          >
                            {it.kind === 'service' ? 'S' : 'P'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800 text-[13px]">{it.name}</p>
                          {it.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{it.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          {it.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          {usdFmt(it.unit_price_usd)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                          {usdFmt(it.amount_usd)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
            <div className="space-y-1.5 min-w-48">
              <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-700 tabular-nums">
                  {usdFmt(subtotal)}
                </span>
              </div>
              {editMode ? (
                <div className="flex items-center justify-between gap-4 text-sm text-slate-500">
                  <span>Descuento</span>
                  <div className="relative w-32">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editDiscount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, '');
                        setEditDiscount(v);
                      }}
                      className="w-full text-xs border border-slate-200 rounded-lg py-1.5 pl-4 pr-2 outline-none focus:border-teal-400 bg-white text-right"
                    />
                  </div>
                </div>
              ) : discountVal > 0 ? (
                <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
                  <span>Descuento</span>
                  <span className="text-red-500 tabular-nums">-{usdFmt(discountVal)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-8 text-base font-bold text-slate-800 pt-1.5 border-t border-slate-200">
                <span>Total</span>
                <span className="tabular-nums" style={{ color: '#0891b2' }}>
                  {usdFmt(totalVal)}
                </span>
              </div>
              {!editMode && quote.total_bs && quote.bcv_rate && (
                <div className="flex items-center justify-between gap-8 text-xs text-slate-400">
                  <span>En bolívares (tasa {quote.bcv_rate.toFixed(2)})</span>
                  <span className="tabular-nums">
                    Bs.{' '}
                    {quote.total_bs.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-3">Notas y condiciones</h2>
          {editMode ? (
            <>
              {/* §4.1 mandatory public-visibility warning */}
              <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800">
                  <strong>El destinatario verá estas notas.</strong> Son las condiciones del
                  presupuesto — úsalas para términos, plazos de pago o indicaciones generales. Evitá
                  incluir información clínica sensible.
                </p>
              </div>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Ej: Precio válido por 15 días. Incluye materiales."
                rows={4}
                maxLength={5000}
                className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300 resize-none"
              />
            </>
          ) : quote.notes ? (
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
          ) : (
            <p className="text-sm text-slate-400 italic">Sin notas</p>
          )}
        </div>

        {/* Share link card — only when backend has issued a token */}
        {shareUrl && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sky-700 mb-0.5">Enlace de acceso</p>
              <p className="text-xs text-sky-600 truncate font-mono">{shareUrl}</p>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-700 border border-sky-300 bg-sky-100 rounded-lg hover:bg-sky-200 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}

        {/* Delete (DRAFT only) */}
        {isDraft && !editMode && (
          <div className="flex justify-end">
            {confirmDelete ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <p className="text-xs text-red-700 font-semibold">¿Eliminar esta cotización?</p>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Eliminar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar cotización
              </button>
            )}
          </div>
        )}
      </div>

      {/* Send modal */}
      {showSendModal && (
        <SendModal
          quoteId={quote.id}
          onClose={() => setShowSendModal(false)}
          onSent={(updated) => {
            setQuote(updated);
            setShowSendModal(false);
          }}
        />
      )}
    </>
  );
}
