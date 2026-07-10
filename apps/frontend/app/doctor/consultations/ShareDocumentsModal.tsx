'use client';

/**
 * ShareDocumentsModal — v2 (2026-07)
 *
 * Reemplaza la selección de 3 secciones (report/prescriptions/ehr) por los
 * mismos 5 tipos que usa GenerateDocumentModal:
 *   recipe · paraclinical · history · rest · informe
 *
 * Al enviar, construye:
 *   - doc_selection: { types, informeBlockKeys, restContent }  (nuevo — para PDF branded)
 *   - sections: { report, prescriptions, ehr }                 (backward-compat)
 */

import { useState } from 'react';
import {
  Share2,
  X,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageCircle,
  ChevronDown,
} from 'lucide-react';
import { normalizePhoneVE } from '@/lib/phone-utils';
import type { ContentBlock } from '@/components/pdf/MedicalDocumentPdf';
import {
  type DocumentTypeKey,
  type SavedPrescription,
  computeAvailableDocTypes,
  INFORME_EXCLUDED_KEYS,
  INFORME_CHECKED_BY_DEFAULT,
} from './consultation-documents';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShareResult {
  url: string;
  code: string;
  expiresAt: string;
}

interface Props {
  consultationId: string;
  /** Teléfono del paciente para ofrecer envío por WhatsApp (opcional). */
  patientPhone?: string | null;
  /** Nombre del paciente para personalizar el mensaje de WhatsApp (opcional). */
  patientName?: string | null;
  /** Nombre del doctor para firmar el mensaje de WhatsApp (opcional). */
  doctorName?: string | null;
  /** Bloques de contenido de la consulta (necesario para computar tipos disponibles). */
  informeContent: ContentBlock[];
  /** Recetas guardadas de la consulta. */
  savedPrescriptions: SavedPrescription[];
  /** Total de consultas del paciente (habilita Historia clínica si > 1). */
  patientConsultationCount: number;
  /** Texto del reposo médico de la consulta; null si no hay reposo. */
  restContent: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DocTypeCardProps {
  label: string;
  description: string;
  enabled: boolean;
  checked: boolean;
  onChange: () => void;
  children?: React.ReactNode;
}

function DocTypeCard({
  label,
  description,
  enabled,
  checked,
  onChange,
  children,
}: DocTypeCardProps) {
  return (
    <div
      className={`rounded-xl border transition-colors ${
        !enabled
          ? 'opacity-45 bg-slate-50 border-slate-100 cursor-not-allowed'
          : checked
            ? 'bg-teal-50 border-teal-200'
            : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <label
        className={`flex items-start gap-3 p-3.5 ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={!enabled}
          className="mt-0.5 w-4 h-4 accent-teal-500 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${
              !enabled ? 'text-slate-400' : checked ? 'text-teal-800' : 'text-slate-700'
            }`}
          >
            {label}
          </p>
          <p className={`text-xs mt-0.5 ${!enabled ? 'text-slate-300' : 'text-slate-400'}`}>
            {description}
          </p>
        </div>
      </label>
      {children}
    </div>
  );
}

interface BlockSubSelectorProps {
  informeContent: ContentBlock[];
  checkedKeys: Set<string>;
  onToggle: (key: string) => void;
}

function BlockSubSelector({ informeContent, checkedKeys, onToggle }: BlockSubSelectorProps) {
  const eligibleBlocks = informeContent.filter((b) => !INFORME_EXCLUDED_KEYS.has(b.key));
  if (eligibleBlocks.length === 0) return null;

  return (
    <div className="px-3.5 pb-3.5 pt-0 border-t border-teal-100">
      <div className="flex items-center gap-1.5 mt-2 mb-2">
        <ChevronDown className="w-3 h-3 text-teal-500" />
        <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">
          Bloques a incluir
        </p>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {eligibleBlocks.map((block) => (
          <label
            key={block.key}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
              checkedKeys.has(block.key)
                ? 'bg-teal-100 border-teal-200 text-teal-800 font-medium'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              checked={checkedKeys.has(block.key)}
              onChange={() => onToggle(block.key)}
              className="w-3 h-3 accent-teal-500 shrink-0"
            />
            <span className="truncate">{block.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShareDocumentsModal({
  consultationId,
  patientPhone,
  patientName,
  doctorName,
  informeContent,
  savedPrescriptions,
  patientConsultationCount,
  restContent,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<DocumentTypeKey>>(new Set());
  const [informeCheckedKeys, setInformeCheckedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const availableTypes = computeAvailableDocTypes({
    informeContent,
    savedPrescriptions,
    patientConsultationCount,
    restContent,
  });

  function handleOpen() {
    setOpen(true);
    setError(null);
    setResult(null);
    setCopiedUrl(false);
    setCopiedCode(false);

    // Pre-seleccionar el primer tipo habilitado por defecto
    const firstEnabled = availableTypes.find((t) => t.enabled);
    setSelectedTypes(firstEnabled ? new Set([firstEnabled.key]) : new Set());

    // Inicializar sub-selector de bloques con los defaults
    const defaults = informeContent
      .filter((b) => !INFORME_EXCLUDED_KEYS.has(b.key) && INFORME_CHECKED_BY_DEFAULT.has(b.key))
      .map((b) => b.key);
    setInformeCheckedKeys(new Set(defaults));
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
  }

  function toggleType(key: DocumentTypeKey) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleInformeBlock(key: string) {
    setInformeCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasSelection = selectedTypes.size > 0;

  async function handleSubmit() {
    if (!hasSelection || loading) return;

    setLoading(true);
    setError(null);

    const types = Array.from(selectedTypes);
    const informeBlockKeys = Array.from(informeCheckedKeys);

    // doc_selection — para PDF branded (nuevo)
    const doc_selection = {
      types,
      informeBlockKeys,
      restContent: restContent ?? null,
    };

    // sections — backward-compat con el backend viejo
    const sections = {
      report: types.includes('informe'),
      prescriptions: types.includes('recipe'),
      ehr: types.includes('history'),
    };

    try {
      const res = await fetch(`/api/consultations/${consultationId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, doc_selection }),
      });

      const json = (await res.json()) as { success: true; data: ShareResult } | { error: string };

      if (!res.ok || !('success' in json)) {
        const errMsg = 'error' in json ? json.error : 'Error al generar el enlace';
        setError(errMsg);
        return;
      }

      setResult(json.data);
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function shareViaWhatsApp() {
    if (!result) return;
    const phone = normalizePhoneVE(patientPhone);
    const saludo = patientName ? `Hola ${patientName}, ` : 'Hola, ';
    const firma = doctorName ? `\n\n${doctorName}` : '';
    const message =
      `${saludo}aquí están los documentos de tu consulta.\n\n` +
      `Enlace: ${result.url}\n` +
      `Código de acceso: ${result.code}\n\n` +
      `El enlace vence el ${formatDate(result.expiresAt)}. Cualquier duda quedo a tu orden.${firma}`;
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  async function copyToClipboard(text: string, kind: 'url' | 'code') {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    } catch {
      /* ignore clipboard errors */
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Share2 className="w-4 h-4 text-teal-500" />
        Compartir documentos
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Share2 className="w-4 h-4 text-teal-600" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Compartir documentos</h2>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-5 overflow-y-auto">
              {!result ? (
                <>
                  <p className="text-sm text-slate-500">
                    Selecciona qué documentos quieres compartir. El paciente recibirá un PDF branded
                    con un enlace y código de acceso de 6 dígitos.
                  </p>

                  {/* Doc type cards */}
                  <div className="space-y-2">
                    {availableTypes.map((dt) => (
                      <DocTypeCard
                        key={dt.key}
                        label={dt.label}
                        description={dt.description}
                        enabled={dt.enabled}
                        checked={selectedTypes.has(dt.key)}
                        onChange={() => {
                          if (!dt.enabled) return;
                          toggleType(dt.key);
                        }}
                      >
                        {/* Sub-selector de bloques para el tipo informe */}
                        {dt.key === 'informe' && selectedTypes.has('informe') && dt.enabled ? (
                          <BlockSubSelector
                            informeContent={informeContent}
                            checkedKeys={informeCheckedKeys}
                            onToggle={toggleInformeBlock}
                          />
                        ) : null}
                      </DocTypeCard>
                    ))}
                  </div>

                  {/* Validation hint */}
                  {!hasSelection && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Selecciona al menos un tipo de documento
                    </p>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!hasSelection || loading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generando enlace...
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4" />
                        Generar enlace y enviar
                      </>
                    )}
                  </button>
                </>
              ) : (
                /* Success state */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <p className="text-sm font-medium">
                      Se envió un email al paciente con el enlace y el código.
                    </p>
                  </div>

                  {/* Link */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Enlace de descarga
                    </p>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-xs font-mono text-slate-700 break-all truncate">
                        {result.url}
                      </span>
                      <button
                        onClick={() => copyToClipboard(result.url, 'url')}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-200 transition-colors text-slate-600"
                      >
                        {copiedUrl ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedUrl ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Code */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Código de acceso
                    </p>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <span className="flex-1 font-mono text-xl font-bold tracking-widest text-slate-800">
                        {result.code}
                      </span>
                      <button
                        onClick={() => copyToClipboard(result.code, 'code')}
                        className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-200 transition-colors text-slate-600"
                      >
                        {copiedCode ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedCode ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Expiry */}
                  <p className="text-xs text-slate-400">
                    El enlace vence el{' '}
                    <span className="text-slate-600 font-medium">
                      {formatDate(result.expiresAt)}
                    </span>
                    . Pasada esa fecha el paciente deberá solicitar uno nuevo.
                  </p>

                  {/* WhatsApp */}
                  <button
                    onClick={shareViaWhatsApp}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white transition-colors"
                    style={{ background: '#25D366' }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Enviar por WhatsApp
                  </button>

                  {/* Close */}
                  <button
                    onClick={handleClose}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
