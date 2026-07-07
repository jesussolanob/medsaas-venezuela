'use client';

import { useState } from 'react';
import {
  Share2,
  X,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Pill,
  ClipboardList,
  MessageCircle,
} from 'lucide-react';
import { normalizePhoneVE } from '@/lib/phone-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShareSections {
  report: boolean;
  prescriptions: boolean;
  ehr: boolean;
}

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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ShareDocumentsModal({
  consultationId,
  patientPhone,
  patientName,
  doctorName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<ShareSections>({
    report: true,
    prescriptions: false,
    ehr: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  function handleOpen() {
    setOpen(true);
    setError(null);
    setResult(null);
    setSections({ report: true, prescriptions: false, ehr: false });
    setCopiedUrl(false);
    setCopiedCode(false);
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
  }

  function toggleSection(key: keyof ShareSections) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const hasSelection = sections.report || sections.prescriptions || sections.ehr;

  async function handleSubmit() {
    if (!hasSelection || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/consultations/${consultationId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
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

  /**
   * Abre WhatsApp con un mensaje que SÍ incluye el enlace y el código de acceso
   * (el flujo viejo enviaba un mensaje sin enlace ni código). El teléfono se
   * normaliza a formato 58XXXXXXXXXX para wa.me.
   */
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
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
            <div className="px-5 py-5 space-y-5">
              {!result ? (
                <>
                  <p className="text-sm text-slate-500">
                    Selecciona qué secciones quieres compartir. El paciente recibirá un enlace por
                    email con un código de acceso de 6 dígitos.
                  </p>

                  {/* Section checkboxes */}
                  <div className="space-y-2.5">
                    <SectionCheckbox
                      icon={<FileText className="w-4 h-4 text-teal-600" />}
                      label="Informe de la consulta"
                      description="Diagnóstico, motivo y notas clínicas"
                      checked={sections.report}
                      onChange={() => toggleSection('report')}
                    />
                    <SectionCheckbox
                      icon={<Pill className="w-4 h-4 text-violet-600" />}
                      label="Recetas"
                      description="Medicamentos, dosis e indicaciones"
                      checked={sections.prescriptions}
                      onChange={() => toggleSection('prescriptions')}
                    />
                    <SectionCheckbox
                      icon={<ClipboardList className="w-4 h-4 text-sky-600" />}
                      label="Historia clínica / EHR"
                      description="Historial clínico electrónico del paciente"
                      checked={sections.ehr}
                      onChange={() => toggleSection('ehr')}
                    />
                  </div>

                  {/* Validation hint */}
                  {!hasSelection && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Selecciona al menos una sección
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

                  {/* Enviar por WhatsApp — incluye enlace + código en el mensaje */}
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

// ─── Section Checkbox ─────────────────────────────────────────────────────────

interface SectionCheckboxProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function SectionCheckbox({ icon, label, description, checked, onChange }: SectionCheckboxProps) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
        checked ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-200 hover:bg-slate-50'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-4 h-4 accent-teal-500 cursor-pointer"
      />
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${checked ? 'text-teal-800' : 'text-slate-700'}`}>
            {label}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
    </label>
  );
}
