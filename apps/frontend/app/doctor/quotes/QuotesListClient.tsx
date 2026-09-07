'use client';

/**
 * QuotesListClient
 *
 * List view for /doctor/quotes.
 * Handles filtering (product name, supplier, patient name, status) via server actions,
 * and opens the QuoteCreateModal for new quotes.
 */

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, FileText, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { getQuotes, type QuoteRow, type QuoteStatus } from './actions';
import QuoteCreateModal from './QuoteCreateModal';

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
  const dateStr = iso.split('T')[0] ?? iso;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function recipientTag(q: QuoteRow): string {
  return q.patient_id ? 'Paciente' : 'Prospecto';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  initialQuotes: QuoteRow[];
  initialTotal: number;
  fetchError?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuotesListClient({ initialQuotes, initialTotal, fetchError }: Props) {
  const router = useRouter();

  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);
  const [total, setTotal] = useState(initialTotal);
  const [loadError, setLoadError] = useState<string | undefined>(fetchError);

  const [productFilter, setProductFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');

  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const loadQuotes = useCallback(
    (product: string, supplier: string, patient: string, status: QuoteStatus | '') => {
      startTransition(async () => {
        try {
          const result = await getQuotes({
            product_name: product || undefined,
            supplier: supplier || undefined,
            patient_name: patient || undefined,
            status: status || undefined,
            page: 1,
            limit: 20,
          });
          if (result.error) {
            setLoadError(result.error);
            showToast({ type: 'error', message: 'Error al cargar las cotizaciones' });
            return;
          }
          setLoadError(undefined);
          setQuotes(result.quotes);
          setTotal(result.total);
        } catch {
          setLoadError('Error de conexión al cargar las cotizaciones');
          showToast({ type: 'error', message: 'Error al cargar las cotizaciones' });
        }
      });
    },
    [],
  );

  function handleProductFilter(v: string) {
    setProductFilter(v);
    loadQuotes(v, supplierFilter, patientFilter, statusFilter);
  }

  function handleSupplierFilter(v: string) {
    setSupplierFilter(v);
    loadQuotes(productFilter, v, patientFilter, statusFilter);
  }

  function handlePatientFilter(v: string) {
    setPatientFilter(v);
    loadQuotes(productFilter, supplierFilter, v, statusFilter);
  }

  function handleStatusFilter(v: QuoteStatus | '') {
    setStatusFilter(v);
    loadQuotes(productFilter, supplierFilter, patientFilter, v);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cotizaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Presupuestos para pacientes y clientes potenciales
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)' }}
        >
          <Plus className="w-4 h-4" />
          Nueva cotización
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        {/* Product name */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por producto..."
            value={productFilter}
            onChange={(e) => handleProductFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors"
          />
        </div>

        {/* Supplier */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por proveedor..."
            value={supplierFilter}
            onChange={(e) => handleSupplierFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors"
          />
        </div>

        {/* Patient / recipient name */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por paciente..."
            value={patientFilter}
            onChange={(e) => handlePatientFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors"
          />
        </div>

        {/* Status */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value as QuoteStatus | '')}
            className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors text-slate-600"
          >
            <option value="">Todos los estados</option>
            {(Object.entries(STATUS_LABELS) as [QuoteStatus, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Error al cargar las cotizaciones. Revisá tu conexión y recargá la página.</span>
        </div>
      )}

      {/* Table */}
      {isPending ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FileText className="w-12 h-12 mb-4 opacity-30" />
          {loadError ? (
            <p className="font-medium">No se pudo cargar la lista</p>
          ) : (
            <>
              <p className="font-medium">Sin cotizaciones</p>
              <p className="text-sm mt-1">Creá tu primer presupuesto con el botón de arriba</p>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide">
                    N.°
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide">
                    Destinatario
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide hidden sm:table-cell">
                    Fecha
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide hidden md:table-cell">
                    Vigencia
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide">
                    Total
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wide">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/doctor/quotes/${q.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-slate-700 text-xs">
                        {q.quote_number}
                      </span>
                    </td>
                    {/*
                      Destinatario: primero A QUIÉN va dirigida, después de qué
                      tipo es. Antes solo se pintaba la etiqueta, así que todas
                      las filas decían "Paciente" y no se distinguía ninguna.
                      El nombre puede faltar si borraron al paciente/prospecto:
                      en ese caso queda solo la etiqueta, como antes.
                    */}
                    <td className="px-4 py-3">
                      {q.recipient_name ? (
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium text-slate-800 text-[13px] truncate">
                            {q.recipient_name}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                              q.patient_id ? 'text-violet-600' : 'text-amber-600'
                            }`}
                          >
                            {recipientTag(q)}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            q.patient_id
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {recipientTag(q)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[13px] hidden sm:table-cell">
                      {formatDate(q.created_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[13px] hidden md:table-cell">
                      {formatDate(q.valid_until)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-slate-800">{formatUsd(q.total_usd)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[q.status]}`}
                      >
                        {STATUS_LABELS[q.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > quotes.length && (
            <div className="px-4 py-3 border-t border-slate-100 text-center text-xs text-slate-400">
              Mostrando {quotes.length} de {total} cotizaciones
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <QuoteCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            router.push(`/doctor/quotes/${id}`);
          }}
        />
      )}
    </>
  );
}
