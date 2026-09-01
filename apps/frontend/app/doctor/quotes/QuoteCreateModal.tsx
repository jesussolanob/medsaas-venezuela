'use client';

/**
 * QuoteCreateModal
 *
 * Full-form modal to create a new draft cotización.
 * Covers §8 of the spec: recipient picker, item builder, discount, notes (with
 * mandatory public-visibility warning per §4.1), and validity date.
 *
 * Recipient XOR rule (spec §3.1):
 *   - "Paciente existente": sets patient_id, leaves lead_id null.
 *   - "Prospecto nuevo": creates a lead first (POST /api/doctor/leads), then
 *     sets lead_id, leaves patient_id null.
 */

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, Info, Search } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import {
  getQuoteFormOptions,
  createQuote,
  createProspectLead,
  type QuoteItemInput,
  type QuoteFormOptions,
} from './actions';
import type { Patient } from '@/app/doctor/patients/actions';
import type { DoctorService } from '@/app/doctor/services-shared';
import type { ProductRow } from '@/app/doctor/inventory/actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecipientMode = 'patient' | 'prospect';

interface FormItem {
  _key: string;
  kind: 'service' | 'product';
  source_id: string | null;
  name: string;
  description: string;
  quantity: string;
  unit_price_usd: string;
}

function newItem(overrides: Partial<FormItem> = {}): FormItem {
  return {
    _key: Math.random().toString(36).slice(2),
    kind: 'service',
    source_id: null,
    name: '',
    description: '',
    quantity: '1',
    unit_price_usd: '',
    ...overrides,
  };
}

function itemToInput(item: FormItem, index: number): QuoteItemInput {
  return {
    kind: item.kind,
    source_id: item.source_id ?? null,
    name: item.name.trim(),
    description: item.description.trim() || undefined,
    quantity: parseFloat(item.quantity) || 1,
    unit_price_usd: parseFloat(item.unit_price_usd) || 0,
    sort_order: index,
  };
}

function computeTotal(items: FormItem[], discount: string): number {
  const subtotal = items.reduce((sum, it) => {
    const qty = parseFloat(it.quantity) || 0;
    const price = parseFloat(it.unit_price_usd) || 0;
    return sum + qty * price;
  }, 0);
  const disc = parseFloat(discount) || 0;
  return Math.max(0, subtotal - disc);
}

function usdFmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onClose: () => void;
  onCreated: (quoteId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuoteCreateModal({ onClose, onCreated }: Props) {
  // Options (services, products, patients, leads)
  const [options, setOptions] = useState<QuoteFormOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Recipient
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('patient');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [prospectLastName, setProspectLastName] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');

  // Items
  const [items, setItems] = useState<FormItem[]>([newItem()]);

  // Quote fields
  const [discount, setDiscount] = useState('0');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');

  // Submission
  const [saving, setSaving] = useState(false);

  // Load options on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingOptions(true);
      try {
        const opts = await getQuoteFormOptions();
        if (!cancelled) setOptions(opts);
      } catch {
        if (!cancelled) showToast({ type: 'error', message: 'Error al cargar opciones' });
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filtered patients
  const filteredPatients = (options?.patients ?? []).filter((p: Patient) =>
    patientSearch ? p.full_name.toLowerCase().includes(patientSearch.toLowerCase()) : true,
  );

  // ---------------------------------------------------------------------------
  // Item helpers
  // ---------------------------------------------------------------------------

  function addManualItem() {
    setItems((prev) => [...prev, newItem()]);
  }

  function addFromService(svc: DoctorService) {
    setItems((prev) => [
      ...prev,
      newItem({
        kind: 'service',
        source_id: svc.id,
        name: svc.name,
        description: svc.description ?? '',
        unit_price_usd: String(svc.price_usd),
      }),
    ]);
  }

  function addFromProduct(prod: ProductRow) {
    // Only auto-fill price for USD products; VES products need manual price
    const price = prod.sale_price_currency === 'USD' ? String(prod.sale_price_amount) : '';
    setItems((prev) => [
      ...prev,
      newItem({
        kind: 'product',
        source_id: prod.id,
        name: prod.name,
        description: prod.description ?? '',
        unit_price_usd: price,
      }),
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  function updateItem(key: string, patch: Partial<FormItem>) {
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate recipient
    if (recipientMode === 'patient' && !selectedPatientId) {
      showToast({ type: 'error', message: 'Seleccioná un paciente o elegí "Prospecto nuevo".' });
      return;
    }
    if (recipientMode === 'prospect') {
      if (!prospectName.trim()) {
        showToast({ type: 'error', message: 'El nombre del prospecto es requerido.' });
        return;
      }
      if (!prospectEmail.trim() || !prospectEmail.includes('@')) {
        showToast({ type: 'error', message: 'Ingresá un correo válido para el prospecto.' });
        return;
      }
    }

    // Validate items
    if (items.length === 0) {
      showToast({ type: 'error', message: 'Agregá al menos un ítem al presupuesto.' });
      return;
    }
    for (const it of items) {
      if (!it.name.trim()) {
        showToast({ type: 'error', message: 'Todos los ítems deben tener un nombre.' });
        return;
      }
      if (isNaN(parseFloat(it.quantity)) || parseFloat(it.quantity) <= 0) {
        showToast({ type: 'error', message: 'La cantidad debe ser mayor a cero.' });
        return;
      }
      if (isNaN(parseFloat(it.unit_price_usd)) || parseFloat(it.unit_price_usd) < 0) {
        showToast({ type: 'error', message: 'El precio unitario debe ser mayor o igual a cero.' });
        return;
      }
    }

    setSaving(true);
    try {
      let leadId: string | null = null;
      if (recipientMode === 'prospect') {
        const leadResult = await createProspectLead({
          name: prospectName.trim(),
          last_name: prospectLastName.trim(),
          email: prospectEmail.trim(),
        });
        if (leadResult.error || !leadResult.lead_id) {
          showToast({
            type: 'error',
            message: leadResult.error ?? 'No se pudo crear el cliente potencial.',
          });
          return;
        }
        leadId = leadResult.lead_id;
      }

      const result = await createQuote({
        patient_id: recipientMode === 'patient' ? selectedPatientId : null,
        lead_id: leadId,
        valid_until: validUntil || null,
        notes: notes.trim(),
        discount_usd: parseFloat(discount) || 0,
        items: items.map(itemToInput),
      });

      if (result.error || !result.quote) {
        showToast({ type: 'error', message: result.error ?? 'Error al crear la cotización.' });
        return;
      }

      showToast({ type: 'success', message: `Cotización ${result.quote.quote_number} creada` });
      onCreated(result.quote.id);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const total = computeTotal(items, discount);
  const subtotal = items.reduce((s, it) => {
    return s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price_usd) || 0);
  }, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-quote-title"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <h2 id="create-quote-title" className="text-sm font-bold text-slate-800">
            Nueva cotización
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loadingOptions ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
            {/* ── Recipient ── */}
            <section>
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">
                Destinatario
              </h3>

              {/* Mode selector */}
              <div className="flex gap-2 mb-4">
                {(['patient', 'prospect'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRecipientMode(mode)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      recipientMode === mode
                        ? 'border-teal-400 bg-teal-50 text-teal-700'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {mode === 'patient' ? 'Paciente existente' : 'Prospecto nuevo'}
                  </button>
                ))}
              </div>

              {recipientMode === 'patient' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar paciente..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 bg-white"
                    />
                  </div>
                  {filteredPatients.length > 0 && (
                    <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {filteredPatients.slice(0, 30).map((p: Patient) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPatientId(p.id)}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            selectedPatientId === p.id
                              ? 'bg-teal-50 text-teal-700 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {p.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredPatients.length === 0 && patientSearch && (
                    <p className="text-xs text-slate-400 px-1">
                      No se encontró ningún paciente con ese nombre
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                      placeholder="Ej. Carlos"
                      className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Apellido
                    </label>
                    <input
                      type="text"
                      value={prospectLastName}
                      onChange={(e) => setProspectLastName(e.target.value)}
                      placeholder="Ej. Rodríguez"
                      className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Correo electrónico <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={prospectEmail}
                      onChange={(e) => setProspectEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
                      required
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ── Items ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Ítems</h3>
                <div className="flex gap-1.5">
                  {/* Add from services dropdown */}
                  <details className="relative group">
                    <summary className="list-none cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      Servicio
                    </summary>
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
                      {options?.services.map((svc) => (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={(e) => {
                            addFromService(svc);
                            (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                          }}
                          className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 transition-colors"
                        >
                          <div className="font-semibold text-slate-800">{svc.name}</div>
                          <div className="text-slate-400">${svc.price_usd.toFixed(2)}</div>
                        </button>
                      ))}
                      {!options?.services.length && (
                        <p className="px-3 py-3 text-xs text-slate-400">Sin servicios</p>
                      )}
                    </div>
                  </details>

                  {/* Add from products dropdown */}
                  <details className="relative group">
                    <summary className="list-none cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      Producto
                    </summary>
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
                      {options?.products.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={(e) => {
                            addFromProduct(prod);
                            (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                          }}
                          className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 transition-colors"
                        >
                          <div className="font-semibold text-slate-800">{prod.name}</div>
                          <div className="text-slate-400">
                            {prod.sale_price_currency === 'USD'
                              ? `$${prod.sale_price_amount.toFixed(2)}`
                              : `Bs. ${prod.sale_price_amount.toFixed(2)} — ingresá precio USD`}
                          </div>
                        </button>
                      ))}
                      {!options?.products.length && (
                        <p className="px-3 py-3 text-xs text-slate-400">
                          Sin productos en inventario
                        </p>
                      )}
                    </div>
                  </details>

                  <button
                    type="button"
                    onClick={addManualItem}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Manual
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item._key}
                    className="grid grid-cols-12 gap-2 items-center p-3 border border-slate-100 rounded-xl bg-slate-50"
                  >
                    {/* Kind badge */}
                    <div className="col-span-1 flex justify-center">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          item.kind === 'service'
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-violet-50 text-violet-700'
                        }`}
                      >
                        {item.kind === 'service' ? 'S' : 'P'}
                      </span>
                    </div>
                    {/* Name */}
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(item._key, { name: e.target.value })}
                        placeholder="Nombre del ítem"
                        required
                        className="w-full text-xs border border-slate-200 rounded-lg py-2 px-2.5 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300"
                      />
                    </div>
                    {/* Quantity */}
                    <div className="col-span-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          updateItem(item._key, { quantity: v });
                        }}
                        placeholder="Cant."
                        className="w-full text-xs border border-slate-200 rounded-lg py-2 px-2.5 outline-none focus:border-teal-400 bg-white text-right"
                      />
                    </div>
                    {/* Unit price */}
                    <div className="col-span-3 relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.unit_price_usd}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          updateItem(item._key, { unit_price_usd: v });
                        }}
                        placeholder="0.00"
                        className="w-full text-xs border border-slate-200 rounded-lg py-2 pl-5 pr-2.5 outline-none focus:border-teal-400 bg-white text-right"
                      />
                    </div>
                    {/* Amount (computed) */}
                    <div className="col-span-1 text-right text-[11px] font-semibold text-slate-700">
                      {usdFmt(
                        (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price_usd) || 0),
                      )}
                    </div>
                    {/* Remove */}
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(item._key)}
                        disabled={items.length <= 1}
                        className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30"
                        aria-label="Eliminar ítem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals summary */}
              <div className="mt-3 flex justify-end">
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-between gap-8 text-xs text-slate-500">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-700">{usdFmt(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-8 text-xs text-slate-500">
                    <span>Descuento</span>
                    <span className="text-red-500">-{usdFmt(parseFloat(discount) || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-8 text-sm font-bold text-slate-800 pt-1 border-t border-slate-200">
                    <span>Total</span>
                    <span>{usdFmt(total)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Quote fields ── */}
            <section className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Descuento (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '');
                      setDiscount(v);
                    }}
                    placeholder="0.00"
                    className="w-full text-sm border border-slate-200 rounded-xl py-2.5 pl-7 pr-3 outline-none focus:border-teal-400 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Válido hasta
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white text-slate-600"
                />
              </div>
            </section>

            {/* ── Notes (with mandatory public visibility warning) ── */}
            <section>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
              {/* §4.1 MANDATORY warning: notes are visible to the recipient */}
              <div className="flex items-start gap-2 mb-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800">
                  <strong>El destinatario verá estas notas.</strong> Son las condiciones del
                  presupuesto — úsalas para términos, plazos de pago o indicaciones generales. Evitá
                  incluir información clínica sensible.
                </p>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Precio válido por 15 días. Incluye materiales."
                rows={3}
                maxLength={5000}
                className="w-full text-sm border border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-teal-400 bg-white placeholder:text-slate-300 resize-none"
              />
            </section>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white rounded-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Crear cotización
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
