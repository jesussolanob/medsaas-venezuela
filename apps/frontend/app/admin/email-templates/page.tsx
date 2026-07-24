'use client';

/**
 * /admin/email-templates — Editor de plantillas de correo electrónico (super_admin).
 *
 * ETAPA 1 — consume el BFF thin-proxy:
 *   GET  /api/admin/email-templates           → lista resumen (sin html/text)
 *   GET  /api/admin/email-templates/:name     → plantilla completa
 *   PUT  /api/admin/email-templates/:name     → actualización parcial
 *
 * Plantillas fijas (9): appointment_confirmed, doctor_pending_verification, invoice,
 * payment_approved, reminder_24h, reminder_3h, reminder_7d, shared_documents_code, welcome.
 * NO se crean ni eliminan plantillas desde esta UI.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mail,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Save,
  ArrowLeft,
  Eye,
  EyeOff,
  FileText,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';
import { reportError } from '@/lib/report-error';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailTemplateSummary {
  name: string;
  subject: string;
  description: string;
  isActive: boolean;
  updatedAt: string;
}

interface EmailTemplateDetail extends EmailTemplateSummary {
  html: string;
  text: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readErrorMsg(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const msg = (data as { error: unknown }).error;
    return typeof msg === 'string' ? msg : fallback;
  }
  return fallback;
}

/** Extrae todas las variables {{nombreVar}} del texto dado. Devuelve array sin duplicados. */
function extractVariables(text: string): string[] {
  const matches = text.matchAll(/\{\{([^{}]+?)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) {
    vars.add(`{{${m[1].trim()}}}`);
  }
  return Array.from(vars);
}

/** Mapa de nombres internos de plantillas a etiquetas legibles en español. */
const TEMPLATE_LABELS: Record<string, string> = {
  appointment_confirmed: 'Cita confirmada',
  doctor_pending_verification: 'Verificación de especialista pendiente',
  invoice: 'Factura',
  payment_approved: 'Pago aprobado',
  reminder_24h: 'Recordatorio 24h',
  reminder_3h: 'Recordatorio 3h',
  reminder_7d: 'Recordatorio 7 días',
  shared_documents_code: 'Código para compartir documentos',
  welcome: 'Bienvenida',
};

/** Devuelve el label en español de la plantilla o capitaliza el snake_case como respaldo. */
function formatTemplateName(name: string): string {
  if (name in TEMPLATE_LABELS) return TEMPLATE_LABELS[name];
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function VariableChips({ html, subject }: { html: string; subject: string }) {
  const vars = extractVariables(html + ' ' + subject);
  if (vars.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-xs font-medium text-slate-500">Variables:</span>
      {vars.map((v) => (
        <span
          key={v}
          className="inline-block px-2 py-0.5 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-mono rounded-md"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

// ─── Editor panel ─────────────────────────────────────────────────────────────

interface EditorProps {
  template: EmailTemplateDetail;
  onBack: () => void;
  onSaved: (updated: EmailTemplateSummary) => void;
}

function TemplateEditor({ template, onBack, onSaved }: EditorProps) {
  const [subject, setSubject] = useState(template.subject);
  const [html, setHtml] = useState(template.html);
  const [text, setText] = useState(template.text ?? '');
  const [isActive, setIsActive] = useState(template.isActive);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update iframe srcDoc when html changes and preview is open
  useEffect(() => {
    if (showPreview && iframeRef.current) {
      iframeRef.current.srcdoc = html;
    }
  }, [html, showPreview]);

  const isDirty =
    subject !== template.subject ||
    html !== template.html ||
    text !== (template.text ?? '') ||
    isActive !== template.isActive;

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (subject !== template.subject) payload.subject = subject;
      if (html !== template.html) payload.html = html;
      if (text !== (template.text ?? '')) payload.text = text || null;
      if (isActive !== template.isActive) payload.is_active = isActive;

      if (Object.keys(payload).length === 0) {
        showToast({ type: 'info', message: 'Sin cambios que guardar' });
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/admin/email-templates/${encodeURIComponent(template.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json: unknown = await res.json();

      if (!res.ok) {
        const isNotFound =
          typeof json === 'object' &&
          json !== null &&
          'code' in json &&
          (json as { code: unknown }).code === 'EMAIL_TEMPLATE_NOT_FOUND';
        showToast({
          type: 'error',
          message: isNotFound
            ? 'Plantilla no encontrada en el servidor'
            : readErrorMsg(json, 'Error al guardar la plantilla'),
        });
        return;
      }

      const envelope = json as { success: boolean; data: EmailTemplateDetail };
      showToast({ type: 'success', message: 'Plantilla actualizada correctamente' });

      // Propagate updated summary to parent list
      onSaved({
        name: template.name,
        subject: envelope.data?.subject ?? subject,
        description: template.description,
        isActive: envelope.data?.isActive ?? isActive,
        updatedAt: envelope.data?.updatedAt ?? new Date().toISOString(),
      });
    } catch (err) {
      reportError('admin/email-templates', 'handleSave', err);
      showToast({ type: 'error', message: 'Error de conexión al guardar la plantilla' });
    } finally {
      setSaving(false);
    }
  }

  const vars = extractVariables(html + ' ' + subject);

  return (
    <div className="space-y-5">
      {/* Topbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">
              {formatTemplateName(template.name)}
            </h3>
            <p className="text-xs text-slate-500 truncate">{template.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle active */}
          <button
            onClick={() => setIsActive((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isActive
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {isActive ? 'Activa' : 'Inactiva'}
          </button>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? 'Ocultar vista previa' : 'Vista previa'}
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-teal-500 text-white text-xs font-semibold rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Variables hint */}
      {vars.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <VariableChips html={html} subject={subject} />
        </div>
      )}

      {/* Layout: editor + preview side by side on lg */}
      <div className={`grid gap-5 ${showPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Editor column */}
        <div className="space-y-4">
          {/* Subject */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Asunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              placeholder="Asunto del correo"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none text-slate-800"
            />
            <p className="text-[11px] text-slate-400">{subject.length}/300 caracteres</p>
          </div>

          {/* HTML */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Contenido HTML
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={18}
              placeholder="<html>...</html>"
              spellCheck={false}
              className="w-full px-3 py-2.5 text-xs font-mono border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none resize-y text-slate-700 bg-slate-50 leading-relaxed"
            />
          </div>

          {/* Plain text */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Versión texto plano
              </label>
              <span className="text-[11px] text-slate-400">Opcional — respaldo sin HTML</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Versión en texto plano del correo..."
              className="w-full px-3 py-2.5 text-xs font-mono border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none resize-y text-slate-700 leading-relaxed"
            />
          </div>
        </div>

        {/* Preview column */}
        {showPreview && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
              <Eye className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Vista previa HTML
              </span>
              <span className="ml-auto text-[11px] text-slate-400 italic">
                Las variables se verán como texto literal
              </span>
            </div>
            {/*
              iframe con sandbox — no ejecuta JS externo ni tiene acceso al DOM principal.
              El HTML de email es contenido de confianza (solo super_admin) pero aislado
              en iframe para no inyectarlo directamente en el DOM de la app.
            */}
            <iframe
              ref={iframeRef}
              srcDoc={html}
              sandbox="allow-same-origin"
              title="Preview de la plantilla de email"
              className="flex-1 w-full border-0"
              style={{ minHeight: '520px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailTemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    void loadList();
  }, []);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-templates');
      const json: unknown = await res.json();
      if (!res.ok) {
        showToast({ type: 'error', message: readErrorMsg(json, 'Error al cargar plantillas') });
        setTemplates([]);
        return;
      }
      const envelope = json as { success: boolean; data: EmailTemplateSummary[] };
      setTemplates(Array.isArray(envelope.data) ? envelope.data : []);
    } catch (err) {
      reportError('admin/email-templates', 'loadList', err);
      showToast({ type: 'error', message: 'Error de conexión al cargar plantillas' });
    } finally {
      setLoading(false);
    }
  }

  const handleSelectTemplate = useCallback(async (name: string) => {
    setSelectedName(name);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${encodeURIComponent(name)}`);
      const json: unknown = await res.json();
      if (!res.ok) {
        const isNotFound =
          typeof json === 'object' &&
          json !== null &&
          'code' in json &&
          (json as { code: unknown }).code === 'EMAIL_TEMPLATE_NOT_FOUND';
        showToast({
          type: 'error',
          message: isNotFound
            ? 'Plantilla no encontrada'
            : readErrorMsg(json, 'Error al cargar la plantilla'),
        });
        setSelectedName(null);
        return;
      }
      const envelope = json as { success: boolean; data: EmailTemplateDetail };
      setDetail(envelope.data);
    } catch (err) {
      reportError('admin/email-templates', 'handleSelectTemplate', err);
      showToast({ type: 'error', message: 'Error de conexión al cargar la plantilla' });
      setSelectedName(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  function handleBack() {
    setSelectedName(null);
    setDetail(null);
  }

  function handleSaved(updated: EmailTemplateSummary) {
    setTemplates((prev) => prev.map((t) => (t.name === updated.name ? { ...t, ...updated } : t)));
  }

  // ─── Editor view ─────────────────────────────────────────────────────────────
  if (selectedName !== null) {
    return (
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Plantillas de Email</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Editando plantilla</p>
        </div>

        {loadingDetail || !detail ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
            <span className="text-slate-400 text-sm">Cargando plantilla...</span>
          </div>
        ) : (
          <TemplateEditor template={detail} onBack={handleBack} onSaved={handleSaved} />
        )}
      </div>
    );
  }

  // ─── List view ───────────────────────────────────────────────────────────────
  const activeCount = templates.filter((t) => t.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Plantillas de Email</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Edita el asunto y el contenido de los correos automáticos de la plataforma
          </p>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && templates.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-400">
            {templates.length} en total
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
          <span className="text-slate-400 text-sm">Cargando plantillas...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay plantillas disponibles</p>
          <p className="text-sm text-slate-400 mt-1">
            El backend aún no retorna plantillas configuradas
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_2fr_auto_auto_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Nombre</span>
            <span>Descripción</span>
            <span className="text-center w-24">Estado</span>
            <span className="text-right w-36">Actualizada</span>
            <span className="w-8" />
          </div>

          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.name}>
                <button
                  onClick={() => void handleSelectTemplate(t.name)}
                  className="w-full text-left px-4 sm:px-5 py-4 hover:bg-slate-50/70 transition-colors group"
                >
                  <div className="flex flex-col sm:grid sm:grid-cols-[1fr_2fr_auto_auto_auto] gap-2 sm:gap-4 sm:items-center">
                    {/* Name */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail
                        className={`w-4 h-4 shrink-0 ${t.isActive ? 'text-teal-500' : 'text-slate-300'}`}
                      />
                      <span
                        className={`text-sm font-medium truncate ${
                          t.isActive ? 'text-slate-800' : 'text-slate-400'
                        }`}
                      >
                        {formatTemplateName(t.name)}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-500 truncate">{t.description}</p>

                    {/* Status badge */}
                    <div className="sm:w-24 sm:flex sm:justify-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          t.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            t.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        {t.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>

                    {/* Updated at */}
                    <span className="text-xs text-slate-400 sm:w-36 sm:text-right whitespace-nowrap">
                      {formatDate(t.updatedAt)}
                    </span>

                    {/* Chevron */}
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-400 transition-colors shrink-0 hidden sm:block" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
