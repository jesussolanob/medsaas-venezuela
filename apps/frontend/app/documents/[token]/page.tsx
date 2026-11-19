'use client';

/**
 * /documents/[token] — Página pública de descarga de documentos
 *
 * PÚBLICA: sin auth, sin layout de doctor/admin.
 * El token identifica el lote de documentos compartidos.
 *
 * Flujo:
 *   1. Paciente ingresa código de 6 dígitos + cédula → POST /api/documents/:token/verify-code
 *   2. Si OK: busca adjuntos + hasDocumentTypes → GET /api/documents/:token/attachments
 *   3. Muestra:
 *      - Botón "Descargar documentos de la consulta" solo si hasDocumentTypes
 *      - Sección "Archivos adjuntos" si hay adjuntos (descarga individual)
 *   4. Si error: mensaje claro + botón "Solicitar nuevo código"
 *
 * Signed URLs de adjuntos tienen TTL 10 min — si se detecta expiración se
 * vuelve a llamar a /attachments para obtener URLs frescas.
 */

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  FileDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileText,
  Pill,
  ClipboardList,
  Stethoscope,
  Paperclip,
  Image as ImageIcon,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VerifiedSession {
  sessionToken: string;
  sections: {
    report?: boolean;
    prescriptions?: boolean;
    ehr?: boolean;
  };
  doctorName: string;
  patientNameMasked: string;
  /** 15-min session token expiry — used internally. */
  expiresAt: string;
  /** 48h access-code expiry — displayed as "Enlace válido hasta". */
  codeExpiresAt: string;
}

interface AttachmentItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

interface AttachmentsData {
  attachments: AttachmentItem[];
  hasDocumentTypes: boolean;
}

type PageState = 'input' | 'verified' | 'blocked';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SECTION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  report: {
    label: 'Informe de consulta',
    icon: <FileText className="w-4 h-4 text-teal-600" />,
  },
  prescriptions: {
    label: 'Recetas',
    icon: <Pill className="w-4 h-4 text-violet-600" />,
  },
  ehr: {
    label: 'Historia clínica (EHR)',
    icon: <ClipboardList className="w-4 h-4 text-sky-600" />,
  },
};

/** Returns whether a file type icon should use the PDF or image variant. */
function AttachmentIcon({
  mimeType,
  className = 'w-4 h-4',
}: {
  mimeType: string;
  className?: string;
}) {
  if (mimeType === 'application/pdf') {
    return <FileText className={`${className} text-red-500`} />;
  }
  return <ImageIcon className={`${className} text-sky-500`} />;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DocumentDownloadPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [pageState, setPageState] = useState<PageState>('input');
  const [code, setCode] = useState('');
  const [cedula, setCedula] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [session, setSession] = useState<VerifiedSession | null>(null);

  // Attachments state
  const [attachmentsData, setAttachmentsData] = useState<AttachmentsData | null>(null);
  // attachmentsLoading: true only on the FIRST fetch (hides the list until ready).
  // attachmentsRefreshing: true on subsequent silent re-fetches (keeps list visible).
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsRefreshing, setAttachmentsRefreshing] = useState(false);
  const [downloadingAttachId, setDownloadingAttachId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Attachments fetch ─────────────────────────────────────────────────────

  async function fetchAttachments(
    sessionToken: string,
    options?: { silent?: boolean },
  ): Promise<AttachmentsData | null> {
    // Use the refreshing state for background re-fetches so the list stays visible.
    if (options?.silent) {
      setAttachmentsRefreshing(true);
    } else {
      setAttachmentsLoading(true);
    }
    try {
      const res = await fetch(
        `/api/documents/${token}/attachments?sessionToken=${encodeURIComponent(sessionToken)}`,
      );
      const json = (await res.json()) as
        | { success: true; data: AttachmentsData }
        | { error: string };
      if (!res.ok || !('success' in json)) return null;
      return json.data;
    } catch {
      return null;
    } finally {
      if (options?.silent) {
        setAttachmentsRefreshing(false);
      } else {
        setAttachmentsLoading(false);
      }
    }
  }

  // ── Verification ──────────────────────────────────────────────────────────

  async function handleVerify() {
    const trimmed = code.replace(/\s/g, '');
    const trimmedCedula = cedula.trim();
    if (trimmed.length !== 6 || trimmedCedula.length < 5 || verifying) return;

    setVerifying(true);
    setVerifyError(null);

    try {
      const res = await fetch(`/api/documents/${token}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, cedula: trimmedCedula }),
      });

      const json = (await res.json()) as
        | { success: true; data: VerifiedSession }
        | { error: string };

      if (!res.ok || !('success' in json)) {
        const msg = 'error' in json ? json.error : 'Código incorrecto o vencido.';

        if (res.status === 429 || res.status === 403) {
          setPageState('blocked');
          return;
        }

        setVerifyError(msg);
        setCode('');
        inputRef.current?.focus();
        return;
      }

      const verifiedSession = json.data;
      setSession(verifiedSession);
      setPageState('verified');

      // Load attachments + hasDocumentTypes in background
      const attachData = await fetchAttachments(verifiedSession.sessionToken);
      if (attachData) {
        setAttachmentsData(attachData);
      }
    } catch {
      setVerifyError(
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.',
      );
    } finally {
      setVerifying(false);
    }
  }

  // ── Download PDF ──────────────────────────────────────────────────────────

  async function handleDownload() {
    if (!session || downloading) return;

    setDownloading(true);
    try {
      const downloadUrl = `/api/documents/${token}/pdf?sessionToken=${encodeURIComponent(session.sessionToken)}`;

      const res = await fetch(downloadUrl);
      if (!res.ok) {
        let msg = 'No se pudo descargar el documento.';
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson?.error) msg = errJson.error;
        } catch {
          /* ignore */
        }
        setVerifyError(msg);
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'documentos-consulta.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setVerifyError('No se pudo descargar el documento. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  }

  // ── Download attachment ───────────────────────────────────────────────────

  async function handleDownloadAttachment(att: AttachmentItem) {
    if (!session) return;
    if (downloadingAttachId !== null) return;

    setDownloadingAttachId(att.id);

    // Always re-fetch to get fresh signed URLs (10-min TTL from backend).
    // Use silent=true so attachmentsLoading stays false and the list remains visible.
    // The row-level spinner is driven by downloadingAttachId.
    const fresh = await fetchAttachments(session.sessionToken, { silent: true });
    if (fresh) {
      setAttachmentsData(fresh);
    }

    const currentAttachments = fresh?.attachments ?? attachmentsData?.attachments ?? [];
    const target = currentAttachments.find((a) => a.id === att.id);

    if (target) {
      // Open the signed URL — the backend sets Content-Disposition: attachment
      // so the browser will download it with the correct filename.
      window.open(target.url, '_blank', 'noopener,noreferrer');
    }

    setDownloadingAttachId(null);
  }

  // ── Request new code ──────────────────────────────────────────────────────

  async function handleRequestCode() {
    if (requestingCode) return;

    setRequestingCode(true);
    setRequestError(null);
    setRequestSuccess(false);

    try {
      const res = await fetch(`/api/documents/${token}/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = (await res.json()) as { success?: true } | { error: string };

      if (!res.ok || !('success' in json)) {
        const msg = 'error' in json ? json.error : 'No se pudo enviar el código.';
        setRequestError(msg);
        return;
      }

      setRequestSuccess(true);
      setTimeout(() => {
        setPageState('input');
        setCode('');
        setVerifyError(null);
        setRequestSuccess(false);
        inputRef.current?.focus();
      }, 3000);
    } catch {
      setRequestError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setRequestingCode(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const hasDocumentTypes = attachmentsData?.hasDocumentTypes ?? true; // default true for backward-compat
  const attachments = attachmentsData?.attachments ?? [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
        >
          <Stethoscope className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-bold text-slate-700">Delta Salud</span>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* ── State: INPUT ─────────────────────────────────────────────── */}
          {pageState === 'input' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div
                className="px-6 py-5 text-white"
                style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                  <FileDown className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-bold">Descarga tus documentos</h1>
                <p className="text-sm text-white/70 mt-1">
                  Ingresa tu cédula y el código de 6 dígitos que recibiste por email. Ambos deben
                  coincidir.
                </p>
              </div>

              <div className="px-6 py-6 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="verify-cedula"
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    Cédula
                  </label>
                  <input
                    id="verify-cedula"
                    type="text"
                    inputMode="text"
                    maxLength={30}
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleVerify();
                    }}
                    placeholder="V-12345678"
                    autoComplete="off"
                    autoFocus
                    className={`w-full text-lg px-4 py-3 border rounded-xl bg-slate-50 placeholder-slate-300 text-slate-800 focus:outline-none focus:ring-2 transition-shadow ${
                      verifyError
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-slate-200 focus:ring-teal-200 focus:border-teal-400'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="verify-code"
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    Código de acceso
                  </label>
                  <input
                    ref={inputRef}
                    id="verify-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleVerify();
                    }}
                    placeholder="000000"
                    className={`w-full font-mono text-2xl tracking-[0.3em] text-center px-4 py-3 border rounded-xl bg-slate-50 placeholder-slate-300 text-slate-800 focus:outline-none focus:ring-2 transition-shadow ${
                      verifyError
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-slate-200 focus:ring-teal-200 focus:border-teal-400'
                    }`}
                  />
                </div>

                {verifyError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{verifyError}</p>
                  </div>
                )}

                <button
                  onClick={handleVerify}
                  disabled={code.length !== 6 || cedula.trim().length < 5 || verifying}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Verificar código'
                  )}
                </button>

                <div className="text-center pt-1">
                  <p className="text-xs text-slate-400">
                    ¿No recibiste el código?{' '}
                    <button
                      onClick={handleRequestCode}
                      disabled={requestingCode}
                      className="text-teal-600 font-semibold hover:underline disabled:opacity-60"
                    >
                      {requestingCode ? 'Enviando...' : 'Solicitar nuevo código'}
                    </button>
                  </p>
                  {requestError && <p className="text-xs text-red-500 mt-1">{requestError}</p>}
                  {requestSuccess && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Te enviamos un nuevo código por email
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── State: VERIFIED ──────────────────────────────────────────── */}
          {pageState === 'verified' && session && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div
                className="px-6 py-5 text-white"
                style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-bold">Acceso verificado</h1>
                <p className="text-sm text-white/70 mt-1">
                  Ya puedes descargar tus documentos médicos.
                </p>
              </div>

              <div className="px-6 py-6 space-y-5">
                {/* Info */}
                <div className="space-y-2">
                  <InfoRow label="Especialista" value={session.doctorName} />
                  <InfoRow label="Paciente" value={session.patientNameMasked} />
                  <InfoRow label="Enlace válido hasta" value={formatDate(session.codeExpiresAt)} />
                </div>

                {/* Sections included */}
                {Object.values(session.sections).some(Boolean) && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Secciones incluidas
                    </p>
                    <div className="space-y-1.5">
                      {(Object.entries(session.sections) as [string, boolean][])
                        .filter(([, enabled]) => enabled)
                        .map(([key]) => {
                          const info = SECTION_LABELS[key];
                          if (!info) return null;
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2.5 text-sm text-slate-700"
                            >
                              {info.icon}
                              {info.label}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {verifyError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{verifyError}</p>
                  </div>
                )}

                {/* PDF download — shown only when share includes ≥1 document type */}
                {!attachmentsLoading && hasDocumentTypes && (
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Descargando...
                      </>
                    ) : (
                      <>
                        <FileDown className="w-4 h-4" />
                        Descargar documentos de la consulta
                      </>
                    )}
                  </button>
                )}

                {attachmentsLoading && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando archivos adjuntos…
                  </div>
                )}

                {/* Attachments section — visible even while silently refreshing URLs */}
                {!attachmentsLoading && attachments.length > 0 && (
                  <div className="space-y-2" aria-busy={attachmentsRefreshing}>
                    <div className="flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                        Archivos adjuntos ({attachments.length})
                      </p>
                    </div>
                    <div className="space-y-2">
                      {attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50"
                        >
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                            <AttachmentIcon mimeType={att.mimeType} className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 line-clamp-2 break-words">
                              {att.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {att.mimeType === 'application/pdf' ? 'PDF' : 'Imagen'} ·{' '}
                              {formatBytes(att.sizeBytes)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDownloadAttachment(att)}
                            disabled={downloadingAttachId !== null}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold transition-colors disabled:opacity-60"
                          >
                            {downloadingAttachId === att.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileDown className="w-3.5 h-3.5" />
                            )}
                            Descargar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasDocumentTypes && (
                  <p className="text-xs text-slate-400 text-center">
                    El PDF se guardará en tu dispositivo.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── State: BLOCKED ───────────────────────────────────────────── */}
          {pageState === 'blocked' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 bg-red-500 text-white">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-bold">Acceso bloqueado</h1>
                <p className="text-sm text-white/80 mt-1">
                  Se alcanzó el límite de intentos permitidos.
                </p>
              </div>

              <div className="px-6 py-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Por seguridad, este enlace ha sido bloqueado tras múltiples intentos incorrectos.
                  Para acceder a tus documentos solicita un nuevo código.
                </p>

                {requestError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{requestError}</p>
                  </div>
                )}

                {requestSuccess ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-sm text-emerald-700">
                      Te enviamos un nuevo código por email. Revisa tu bandeja de entrada.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handleRequestCode}
                    disabled={requestingCode}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {requestingCode ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Solicitar nuevo código
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <p className="text-xs text-slate-400">Delta Salud · Plataforma médica para Venezuela</p>
      </footer>
    </div>
  );
}

// ─── Info Row helper ─────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-slate-700 font-medium">{value}</span>
    </div>
  );
}
