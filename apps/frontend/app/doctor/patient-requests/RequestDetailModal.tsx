'use client';

/**
 * RequestDetailModal — muestra el detalle de una solicitud de documentos.
 *
 * Carga los datos desde /api/doctor/patient-requests/:id al abrir el modal.
 * Incluye adjuntos con signed URLs descargables (TTL 1 hora).
 */

import { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  AlertCircle,
  FileText,
  Download,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  MessageSquare,
} from 'lucide-react';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Attachment {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  signedUrl: string;
  uploadedAt: string;
}

interface RequestDetail {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string | null;
  responseText: string | null;
  status: 'pending' | 'fulfilled' | 'revoked';
  createdAt: string;
  fulfilledAt: string | null;
  attachments: Attachment[];
}

interface RequestDetailModalProps {
  requestId: string;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function fileSizeLabel(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pendiente',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  fulfilled: {
    label: 'Respondida',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  revoked: {
    label: 'Revocada',
    className: 'bg-slate-100 text-slate-500 border border-slate-200',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
} as const;

// ─── Componente ──────────────────────────────────────────────────────────────

export default function RequestDetailModal({ requestId, onClose }: RequestDetailModalProps) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/doctor/patient-requests/${requestId}`);
        const json = (await res.json()) as
          | { success: true; data: RequestDetail }
          | { error: string };

        if (cancelled) return;

        if (!res.ok || !('success' in json)) {
          setError('error' in json ? json.error : 'No se pudo cargar el detalle.');
          return;
        }

        setDetail(json.data);
      } catch {
        if (!cancelled) setError('No se pudo conectar con el servidor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const status = detail ? STATUS_CONFIG[detail.status] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 id="detail-modal-title" className="text-sm font-bold text-slate-800">
            Detalle de solicitud
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando...
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : detail ? (
            <>
              {/* Info del paciente + estado */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                    <span className="text-teal-600 font-bold text-sm">
                      {detail.patientName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {detail.patientName}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(detail.createdAt)}</p>
                  </div>
                </div>
                {status && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${status.className}`}
                  >
                    {status.icon}
                    {status.label}
                  </span>
                )}
              </div>

              {/* Título + descripción */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Solicitud
                </p>
                <p className="text-sm font-semibold text-slate-800">{detail.title}</p>
                {detail.description && (
                  <p className="text-sm text-slate-500 whitespace-pre-line">{detail.description}</p>
                )}
              </div>

              {/* Respuesta del paciente */}
              {detail.responseText && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Respuesta del paciente
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-slate-700 whitespace-pre-line">
                      {detail.responseText}
                    </p>
                  </div>
                  {detail.fulfilledAt && (
                    <p className="text-xs text-slate-400">
                      Respondida el {formatDate(detail.fulfilledAt)}
                    </p>
                  )}
                </div>
              )}

              {/* Adjuntos */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Adjuntos ({detail.attachments.length})
                  </p>
                </div>

                {detail.attachments.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm text-slate-400">
                    <User className="w-3.5 h-3.5" />
                    El paciente no adjuntó archivos.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {detail.attachments.map((att) => (
                      <li
                        key={att.id}
                        className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5"
                      >
                        <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {att.fileName}
                          </p>
                          {att.sizeBytes !== null && (
                            <p className="text-xs text-slate-400">{fileSizeLabel(att.sizeBytes)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={att.signedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-teal-600 border border-teal-200 hover:bg-teal-50 transition-colors"
                            title="Ver archivo"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Ver
                          </a>
                          <a
                            href={att.signedUrl}
                            download={att.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
                            title="Descargar archivo"
                          >
                            <Download className="w-3 h-3" />
                            Descargar
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Estado pendiente — sin respuesta aún */}
              {detail.status === 'pending' && (
                <div className="flex items-center gap-2 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-700">
                    El paciente aún no ha respondido a esta solicitud.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
