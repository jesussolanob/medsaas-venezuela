'use client';

/**
 * /patient-requests/[token] — Portal público para responder solicitudes del médico.
 *
 * PÚBLICA: sin auth, sin layout de doctor/admin.
 * El token identifica la solicitud de documentos del médico.
 *
 * Máquina de estados:
 *   input     → paciente ingresa cédula + código de 6 dígitos
 *   verified  → puede subir archivos y escribir una respuesta opcional, luego enviar
 *   blocked   → demasiados intentos fallidos; puede solicitar nuevo código
 *   submitted → solicitud enviada correctamente
 *
 * SEGURIDAD:
 *   - sessionToken se guarda SOLO en estado React; NUNCA en localStorage.
 *   - Validación de MIME y tamaño se hace client-side antes del fetch
 *     (defensa en profundidad; el BFF y el backend también validan).
 */

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Stethoscope,
  Upload,
  X,
  FileText,
  Send,
  Lock,
} from 'lucide-react';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface StagedFile {
  id: string;
  file: File;
}

type PageState = 'input' | 'verified' | 'blocked' | 'submitted';

// ─── Constantes ──────────────────────────────────────────────────────────────

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function validateFileClientSide(file: File): string | null {
  if (!ALLOWED_MIMES.includes(file.type)) {
    return `Tipo no permitido: ${file.type || 'desconocido'}. Acepta: JPEG, PNG, WebP o PDF.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `El archivo "${file.name}" supera el límite de ${MAX_SIZE_MB} MB.`;
  }
  return null;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function PatientRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [pageState, setPageState] = useState<PageState>('input');

  // Etapa input
  const [cedula, setCedula] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // sessionToken: NUNCA en localStorage
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Metadata de la solicitud (qué pide el doctor), revelada tras el 2FA.
  const [requestTitle, setRequestTitle] = useState<string | null>(null);
  const [requestDescription, setRequestDescription] = useState<string | null>(null);

  // Solicitar nuevo código
  const [requestingCode, setRequestingCode] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Etapa verified — upload + respuesta
  // Archivos preparados localmente; se suben recién al enviar (así "Quitar"
  // realmente los descarta y no quedan adjuntos huérfanos si el paciente
  // abandona la sesión sin enviar).
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Verificación ────────────────────────────────────────────────────────────

  async function handleVerify() {
    const trimmedCode = code.replace(/\s/g, '');
    const trimmedCedula = cedula.trim();
    if (trimmedCode.length !== 6 || trimmedCedula.length < 5 || verifying) return;

    setVerifying(true);
    setVerifyError(null);

    try {
      const res = await fetch(`/api/patient-requests/${token}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmedCode, cedula: trimmedCedula }),
      });

      const json = (await res.json()) as
        | {
            success: true;
            data: {
              sessionToken: string;
              expiresAt: string;
              title: string;
              description: string | null;
            };
          }
        | { error: string };

      if (!res.ok || !('success' in json)) {
        if (res.status === 429 || res.status === 403) {
          setPageState('blocked');
          return;
        }
        const msg = 'error' in json ? json.error : 'Código o cédula incorrectos.';
        setVerifyError(msg);
        setCode('');
        codeInputRef.current?.focus();
        return;
      }

      setSessionToken(json.data.sessionToken);
      setRequestTitle(json.data.title);
      setRequestDescription(json.data.description);
      setPageState('verified');
    } catch {
      setVerifyError(
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.',
      );
    } finally {
      setVerifying(false);
    }
  }

  // ── Solicitar nuevo código ──────────────────────────────────────────────────

  async function handleRequestCode() {
    if (requestingCode) return;
    setRequestingCode(true);
    setRequestError(null);
    setRequestSuccess(false);

    try {
      const res = await fetch(`/api/patient-requests/${token}/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = (await res.json()) as { success?: true } | { error: string };

      if (!res.ok || !('success' in json)) {
        setRequestError('error' in json ? json.error : 'No se pudo enviar el código.');
        return;
      }

      setRequestSuccess(true);
      setTimeout(() => {
        setPageState('input');
        setCode('');
        setVerifyError(null);
        setRequestSuccess(false);
        codeInputRef.current?.focus();
      }, 3000);
    } catch {
      setRequestError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setRequestingCode(false);
    }
  }

  // ── Subida de archivos ─────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // reset para permitir re-selección del mismo archivo
    if (files.length === 0) return;

    for (const file of files) {
      const err = validateFileClientSide(file);
      if (err) {
        setUploadError(err);
        return;
      }
    }

    // Solo se preparan localmente; la subida ocurre al enviar.
    setUploadError(null);
    setStagedFiles((prev) => [
      ...prev,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  // ── Envío ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (submitting || !sessionToken) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Subir los adjuntos preparados (recién ahora, para que "Quitar" descarte
      //    de verdad y no queden huérfanos si el paciente abandona sin enviar).
      for (const staged of stagedFiles) {
        const formData = new FormData();
        formData.append('file', staged.file);
        const up = await fetch(`/api/patient-requests/${token}/upload`, {
          method: 'POST',
          headers: { 'X-Session-Token': sessionToken },
          body: formData,
        });
        const upJson = (await up.json()) as { success?: true } | { error: string };
        if (!up.ok || !('success' in upJson)) {
          setSubmitError(
            'error' in upJson
              ? `No se pudo subir "${staged.file.name}": ${upJson.error}`
              : `No se pudo subir "${staged.file.name}".`,
          );
          return;
        }
      }

      // 2. Enviar la respuesta y marcar la solicitud como cumplida.
      const res = await fetch(`/api/patient-requests/${token}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': sessionToken,
        },
        body: JSON.stringify({ responseText: responseText.trim() || null }),
      });

      const json = (await res.json()) as { success?: true } | { error: string };

      if (!res.ok || !('success' in json)) {
        setSubmitError('error' in json ? json.error : 'No se pudo enviar la respuesta.');
        return;
      }

      setPageState('submitted');
    } catch {
      setSubmitError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Cabecera */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
        >
          <Stethoscope className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-bold text-slate-700">Delta Salud</span>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* ── INPUT ── */}
          {pageState === 'input' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div
                className="px-6 py-5 text-white"
                style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-bold">Responder solicitud médica</h1>
                <p className="text-sm text-white/70 mt-1">
                  Ingresa tu cédula y el código de 6 dígitos que recibiste por email.
                </p>
              </div>

              <div className="px-6 py-6 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="pr-cedula"
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    Cédula
                  </label>
                  <input
                    id="pr-cedula"
                    type="text"
                    inputMode="text"
                    maxLength={30}
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleVerify();
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
                    htmlFor="pr-code"
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    Código de acceso
                  </label>
                  <input
                    ref={codeInputRef}
                    id="pr-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleVerify();
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
                  onClick={() => void handleVerify()}
                  disabled={code.length !== 6 || cedula.trim().length < 5 || verifying}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Verificar acceso'
                  )}
                </button>

                <div className="text-center pt-1">
                  <p className="text-xs text-slate-400">
                    ¿No recibiste el código?{' '}
                    <button
                      onClick={() => void handleRequestCode()}
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

          {/* ── VERIFIED ── */}
          {pageState === 'verified' && (
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
                  Tu médico te pide lo siguiente. Sube los documentos y/o escribe una respuesta.
                </p>
              </div>

              <div className="px-6 py-6 space-y-5">
                {/* Lo que pide el doctor */}
                <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3">
                  <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                    Solicitud
                  </p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">
                    {requestTitle ?? 'Solicitud de documentos'}
                  </p>
                  {requestDescription && (
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                      {requestDescription}
                    </p>
                  )}
                </div>

                {/* Upload */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Documentos adjuntos
                  </p>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    className="w-full flex flex-col items-center gap-2 px-4 py-6 border-2 border-dashed border-slate-200 rounded-xl hover:border-teal-300 hover:bg-teal-50/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">
                      Toca para seleccionar archivos
                    </span>
                    <span className="text-xs text-slate-400">
                      JPEG, PNG, WebP o PDF · máx. {MAX_SIZE_MB} MB
                    </span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    aria-hidden="true"
                    onChange={(e) => void handleFileSelect(e)}
                  />

                  {stagedFiles.length > 0 && (
                    <ul className="space-y-2">
                      {stagedFiles.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                        >
                          <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                          <span className="text-sm text-slate-700 flex-1 truncate min-w-0">
                            {f.file.name}
                          </span>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() =>
                              setStagedFiles((prev) => prev.filter((x) => x.id !== f.id))
                            }
                            className="shrink-0 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                            aria-label={`Quitar ${f.file.name}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {uploadError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{uploadError}</p>
                    </div>
                  )}
                </div>

                {/* Respuesta textual */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="pr-response"
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                  >
                    Respuesta escrita{' '}
                    <span className="normal-case font-normal text-slate-400">(opcional)</span>
                  </label>
                  <textarea
                    id="pr-response"
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Escribe aquí si deseas agregar un comentario o aclaración..."
                    rows={4}
                    maxLength={5000}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-300 text-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 transition-shadow"
                  />
                  {responseText.length > 4500 && (
                    <p className="text-xs text-amber-600 text-right">
                      {5000 - responseText.length} caracteres restantes
                    </p>
                  )}
                </div>

                {submitError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{submitError}</p>
                  </div>
                )}

                <button
                  onClick={() => void handleSubmit()}
                  disabled={
                    submitting || (stagedFiles.length === 0 && responseText.trim().length === 0)
                  }
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar respuesta
                    </>
                  )}
                </button>

                <p className="text-xs text-slate-400 text-center">
                  Debes adjuntar al menos un archivo o escribir una respuesta para poder enviar.
                </p>
              </div>
            </div>
          )}

          {/* ── BLOCKED ── */}
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
                  Por seguridad, el acceso fue bloqueado tras varios intentos incorrectos. Solicita
                  un nuevo código para intentarlo de nuevo.
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
                    onClick={() => void handleRequestCode()}
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

          {/* ── SUBMITTED ── */}
          {pageState === 'submitted' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div
                className="px-6 py-5 text-white"
                style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-bold">Solicitud enviada</h1>
                <p className="text-sm text-white/70 mt-1">Tu médico recibió tu respuesta.</p>
              </div>

              <div className="px-6 py-6 space-y-3">
                <p className="text-sm text-slate-600">
                  La información fue enviada correctamente. Tu médico la revisará a la brevedad.
                </p>
                {stagedFiles.length > 0 && (
                  <p className="text-sm text-slate-500">
                    {stagedFiles.length} archivo
                    {stagedFiles.length !== 1 ? 's' : ''} adjunto
                    {stagedFiles.length !== 1 ? 's' : ''} enviado
                    {stagedFiles.length !== 1 ? 's' : ''}.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="py-4 text-center">
        <p className="text-xs text-slate-400">Delta Salud · Plataforma médica para Venezuela</p>
      </footer>
    </div>
  );
}
