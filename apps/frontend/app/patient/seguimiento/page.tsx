'use client';

/**
 * /patient/seguimiento — Seguimiento del Paciente (Shared Health Space)
 *
 * Muestra el feed de tareas, instrucciones y archivos compartidos entre el
 * médico y el paciente. El paciente puede responder con comentarios y subir
 * archivos directamente desde esta pantalla.
 *
 * Flujo de datos:
 *   - GET  /api/patient/shared-files    → lista todos los items
 *   - POST /api/patient/shared-files/mark-read → marca leídos al montar
 *   - POST /api/storage/upload          → sube archivo al storage (multipart)
 *   - POST /api/patient/shared-files    → crea respuesta/comentario/archivo
 */

import { useEffect, useState, useRef, useTransition } from 'react';
import {
  FolderHeart,
  Stethoscope,
  User,
  FileText,
  Image as ImageIcon,
  FlaskConical,
  ClipboardList,
  MessageCircle,
  Paperclip,
  Send,
  CheckCircle2,
  Clock,
  Download,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { reportError } from '@/lib/report-error';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type SharedFileCategory =
  | 'instruction'
  | 'file'
  | 'recipe'
  | 'lab_result'
  | 'image'
  | 'other'
  | 'comment';

type SharedFileStatus = 'pending' | 'completed' | 'reviewed';

interface SharedFileItem {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileSizeBytes: number | null;
  category: SharedFileCategory;
  status: SharedFileStatus;
  createdBy: 'doctor' | 'patient';
  parentTaskId: string | null;
  readByDoctor: boolean;
  readByPatient: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORY_LABELS: Record<SharedFileCategory, string> = {
  instruction: 'Instrucción',
  file: 'Archivo',
  recipe: 'Receta',
  lab_result: 'Resultado de laboratorio',
  image: 'Imagen',
  other: 'Otro',
  comment: 'Comentario',
};

const STATUS_LABELS: Record<SharedFileStatus, string> = {
  pending: 'Pendiente',
  completed: 'Completada',
  reviewed: 'Revisada',
};

function CategoryIcon({ category }: { category: SharedFileCategory }) {
  const cls = 'w-4 h-4 shrink-0';
  switch (category) {
    case 'instruction':
      return <ClipboardList className={cls} />;
    case 'recipe':
      return <FileText className={cls} />;
    case 'lab_result':
      return <FlaskConical className={cls} />;
    case 'image':
      return <ImageIcon className={cls} />;
    case 'comment':
      return <MessageCircle className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}

// ---------------------------------------------------------------------------
// Componente de item del feed
// ---------------------------------------------------------------------------

interface FeedItemProps {
  item: SharedFileItem;
  replies: SharedFileItem[];
  onReply: (parentTaskId: string) => void;
}

function FeedItem({ item, replies, onReply }: FeedItemProps) {
  const [expanded, setExpanded] = useState(true);
  const isFromDoctor = item.createdBy === 'doctor';
  const isTask = item.category === 'instruction';
  const hasReplies = replies.length > 0;

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Header del item */}
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          {/* Avatar / ícono del emisor */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
            style={{
              background: isFromDoctor ? 'var(--dh-turquoise-50)' : 'var(--dh-coral-50, #FFF5F3)',
              color: isFromDoctor ? 'var(--dh-turquoise-700)' : 'var(--dh-coral, #FF6B6B)',
            }}
          >
            {isFromDoctor ? <Stethoscope className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </div>

          <div className="flex-1 min-w-0">
            {/* Autor + fecha */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
              <span
                className="text-xs font-semibold"
                style={{ color: isFromDoctor ? 'var(--dh-turquoise-700)' : 'var(--dh-ink)' }}
              >
                {isFromDoctor ? 'Tu médico' : 'Tú'}
              </span>
              <span className="text-xs" style={{ color: 'var(--dh-gray-400)' }}>
                {formatDate(item.createdAt)}
              </span>

              {/* Badge de categoría */}
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: 'var(--dh-gray-50)',
                  color: 'var(--dh-gray-600)',
                  border: '1px solid var(--dh-gray-100)',
                }}
              >
                <CategoryIcon category={item.category} />
                {CATEGORY_LABELS[item.category]}
              </span>

              {/* Badge de estado para tareas */}
              {isTask && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: item.status === 'completed' ? '#F0FDF4' : '#FFFBEB',
                    color: item.status === 'completed' ? '#16A34A' : '#D97706',
                    border: item.status === 'completed' ? '1px solid #BBF7D0' : '1px solid #FDE68A',
                  }}
                >
                  {item.status === 'completed' ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                  {STATUS_LABELS[item.status]}
                </span>
              )}
            </div>

            {/* Título */}
            <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>

            {/* Descripción */}
            {item.description && (
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.description}</p>
            )}

            {/* Archivo adjunto */}
            {item.fileUrl && (
              <a
                href={item.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: 'var(--dh-turquoise-50)',
                  color: 'var(--dh-turquoise-700)',
                  border: '1px solid var(--dh-turquoise-100, #CCFBF1)',
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Ver archivo
                {item.fileSizeBytes && (
                  <span style={{ color: 'var(--dh-gray-400)' }}>
                    ({formatFileSize(item.fileSizeBytes)})
                  </span>
                )}
              </a>
            )}
          </div>

          {/* Toggle de respuestas */}
          {hasReplies && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors shrink-0"
              style={{
                color: 'var(--dh-gray-500)',
                border: '1px solid var(--dh-gray-100)',
              }}
              aria-label={expanded ? 'Ocultar respuestas' : 'Ver respuestas'}
            >
              {replies.length} resp.
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Botón responder (solo tareas e instrucciones del doctor) */}
        {isFromDoctor && isTask && (
          <div className="mt-3 ml-12">
            <button
              onClick={() => onReply(item.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: 'var(--dh-turquoise-50)',
                color: 'var(--dh-turquoise-700)',
                border: '1px solid var(--dh-turquoise-100, #CCFBF1)',
              }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Responder a esta tarea
            </button>
          </div>
        )}
      </div>

      {/* Respuestas anidadas */}
      {hasReplies && expanded && (
        <div
          className="border-t px-4 py-3 space-y-3"
          style={{ background: 'var(--dh-gray-50)', borderColor: 'var(--dh-gray-100)' }}
        >
          {replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  background:
                    reply.createdBy === 'doctor'
                      ? 'var(--dh-turquoise-50)'
                      : 'var(--dh-coral-50, #FFF5F3)',
                  color:
                    reply.createdBy === 'doctor'
                      ? 'var(--dh-turquoise-700)'
                      : 'var(--dh-coral, #FF6B6B)',
                }}
              >
                {reply.createdBy === 'doctor' ? (
                  <Stethoscope className="w-3.5 h-3.5" />
                ) : (
                  <User className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color:
                        reply.createdBy === 'doctor' ? 'var(--dh-turquoise-700)' : 'var(--dh-ink)',
                    }}
                  >
                    {reply.createdBy === 'doctor' ? 'Tu médico' : 'Tú'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--dh-gray-400)' }}>
                    {formatDate(reply.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{reply.title}</p>
                {reply.description && (
                  <p className="text-xs text-slate-500 mt-0.5">{reply.description}</p>
                )}
                {reply.fileUrl && (
                  <a
                    href={reply.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--dh-turquoise-700)' }}
                  >
                    <Download className="w-3 h-3" />
                    Ver archivo
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de respuesta
// ---------------------------------------------------------------------------

interface ReplyFormProps {
  replyToTaskId: string | null;
  replyToTitle: string;
  onCancel: () => void;
  onSubmitted: (item: SharedFileItem) => void;
}

function ReplyForm({ replyToTaskId, replyToTitle, onCancel, onSubmitted }: ReplyFormProps) {
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const hasComment = comment.trim().length > 0;
    const hasFile = file !== null;

    if (!hasComment && !hasFile) {
      showToast({ type: 'error', message: 'Escribe un comentario o selecciona un archivo.' });
      return;
    }

    startTransition(async () => {
      try {
        let filePath: string | null = null;
        let fileType: string | null = null;
        let fileSizeBytes: number | null = null;

        // 1. Subir archivo al storage si hay uno
        if (hasFile && file) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('kind', 'document');

          const uploadRes = await fetch('/api/storage/upload', {
            method: 'POST',
            body: formData,
          });

          const uploadJson = (await uploadRes.json()) as {
            success: boolean;
            data?: { url: string; path: string };
            error?: { message?: string };
          };

          if (!uploadRes.ok || !uploadJson.success) {
            showToast({
              type: 'error',
              message: uploadJson.error?.message ?? 'Error al subir el archivo.',
            });
            return;
          }

          filePath = uploadJson.data?.path ?? null;
          fileType = file.type || null;
          fileSizeBytes = file.size;
        }

        // 2. Crear el item en shared-files
        const title = hasComment ? comment.trim() : (file?.name ?? 'Archivo adjunto');
        const category: SharedFileCategory = hasFile ? 'file' : 'comment';

        const res = await fetch('/api/patient/shared-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description: hasComment && hasFile ? comment.trim() : null,
            category,
            filePath,
            fileType,
            fileSizeBytes,
            parentTaskId: replyToTaskId,
          }),
        });

        const json = (await res.json()) as {
          success: boolean;
          data?: SharedFileItem;
          error?: string;
        };

        if (!res.ok || !json.success) {
          showToast({ type: 'error', message: json.error ?? 'Error al enviar la respuesta.' });
          return;
        }

        if (json.data) {
          onSubmitted(json.data);
        }

        showToast({ type: 'success', message: 'Respuesta enviada.' });
        setComment('');
        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      } catch (err) {
        reportError('patient/seguimiento', 'ReplyForm.handleSubmit', err);
        showToast({ type: 'error', message: 'Error inesperado. Intenta de nuevo.' });
      }
    });
  };

  return (
    <div
      className="bg-white border rounded-xl p-4"
      style={{ borderColor: 'var(--dh-turquoise-200, #99F6E4)' }}
    >
      {replyToTaskId && (
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--dh-turquoise-700)' }}>
          Respondiendo a: <span className="font-semibold">{replyToTitle}</span>
        </p>
      )}

      {!replyToTaskId && (
        <p className="text-xs font-medium mb-3 text-slate-600">Nueva respuesta general</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Escribe tu comentario o respuesta aquí..."
          rows={3}
          disabled={isPending}
          className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{
            borderColor: 'var(--dh-gray-200)',
            color: 'var(--dh-ink)',
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de archivo */}
          <label
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg cursor-pointer transition-colors"
            style={{
              background: 'var(--dh-gray-50)',
              color: 'var(--dh-gray-600)',
              border: '1px solid var(--dh-gray-200)',
            }}
          >
            <Paperclip className="w-3.5 h-3.5" />
            {file ? file.name : 'Adjuntar archivo'}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              disabled={isPending}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Quitar
            </button>
          )}

          <div className="flex-1" />

          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="text-xs px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{
              color: 'var(--dh-gray-500)',
              border: '1px solid var(--dh-gray-200)',
            }}
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{
              background: 'var(--dh-turquoise)',
              color: '#fff',
            }}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {isPending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function PatientSeguimientoPage() {
  const [items, setItems] = useState<SharedFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ taskId: string; title: string } | null>(null);
  const [showNewReply, setShowNewReply] = useState(false);

  // Carga inicial + mark-read
  useEffect(() => {
    const init = async () => {
      try {
        // Cargar items y marcar como leídos en paralelo
        const [listRes] = await Promise.all([
          fetch('/api/patient/shared-files'),
          fetch('/api/patient/shared-files/mark-read', { method: 'POST' }),
        ]);

        const listJson = (await listRes.json()) as {
          success: boolean;
          data?: SharedFileItem[];
          error?: string;
        };

        if (!listRes.ok || !listJson.success) {
          setError(listJson.error ?? 'No se pudo cargar el seguimiento.');
          return;
        }

        const data = Array.isArray(listJson.data) ? listJson.data : [];
        // Ordenar más reciente primero
        const sorted = [...data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setItems(sorted);
      } catch (err) {
        reportError('patient/seguimiento', 'init', err);
        setError('Error al cargar. Intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleItemSubmitted = (newItem: SharedFileItem) => {
    setItems((prev) => [newItem, ...prev]);
    setReplyTo(null);
    setShowNewReply(false);
  };

  const handleReply = (taskId: string) => {
    const task = items.find((i) => i.id === taskId);
    setReplyTo({ taskId, title: task?.title ?? '' });
    setShowNewReply(true);
  };

  const handleCancelReply = () => {
    setReplyTo(null);
    setShowNewReply(false);
  };

  // Separar items raíz (sin parentTaskId) de respuestas
  const rootItems = items.filter((i) => !i.parentTaskId);
  const repliesMap = items
    .filter((i) => i.parentTaskId)
    .reduce<Record<string, SharedFileItem[]>>((acc, reply) => {
      const key = reply.parentTaskId!;
      return { ...acc, [key]: [...(acc[key] ?? []), reply] };
    }, {});

  // ---------------------------------------------------------------------------
  // Estados de carga / error / vacío
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <PageHeader />
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <Loader2
              className="w-8 h-8 mx-auto animate-spin"
              style={{ color: 'var(--dh-turquoise)' }}
            />
            <p className="text-sm font-medium" style={{ color: 'var(--dh-gray-500)' }}>
              Cargando seguimiento...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <PageHeader />
        <div className="bg-white border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'var(--dh-turquoise-50)',
              color: 'var(--dh-turquoise-700)',
              border: '1px solid var(--dh-turquoise-200, #99F6E4)',
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader />

      {/* Barra de acción */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--dh-gray-500)' }}>
          {rootItems.length === 0
            ? 'Sin actividad todavía'
            : `${rootItems.length} ${rootItems.length === 1 ? 'elemento' : 'elementos'}`}
        </p>

        {!showNewReply && (
          <button
            onClick={() => {
              setReplyTo(null);
              setShowNewReply(true);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'var(--dh-turquoise)',
              color: '#fff',
            }}
          >
            <MessageCircle className="w-4 h-4" />
            Nueva respuesta
          </button>
        )}
      </div>

      {/* Formulario de respuesta */}
      {showNewReply && (
        <ReplyForm
          replyToTaskId={replyTo?.taskId ?? null}
          replyToTitle={replyTo?.title ?? ''}
          onCancel={handleCancelReply}
          onSubmitted={handleItemSubmitted}
        />
      )}

      {/* Estado vacío */}
      {rootItems.length === 0 && !showNewReply && (
        <div
          className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
            <div className="p-4 rounded-2xl" style={{ background: 'var(--dh-turquoise-50)' }}>
              <FolderHeart className="w-10 h-10" style={{ color: 'var(--dh-turquoise)' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Sin actividad todavía</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Cuando tu médico envíe tareas, instrucciones o archivos, aparecerán aquí. También
                puedes enviar una respuesta o adjuntar un archivo tú mismo.
              </p>
            </div>
            <div
              className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
              style={{
                color: 'var(--dh-gray-400)',
                background: 'var(--dh-gray-50)',
                border: '1px solid var(--dh-gray-100)',
              }}
            >
              <Stethoscope className="w-3.5 h-3.5 shrink-0" />
              <span>Consulta directamente con tu médico mientras tanto.</span>
            </div>
          </div>
        </div>
      )}

      {/* Feed de items */}
      {rootItems.length > 0 && (
        <div className="space-y-3">
          {rootItems.map((item) => (
            <FeedItem
              key={item.id}
              item={item}
              replies={repliesMap[item.id] ?? []}
              onReply={handleReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente encabezado de página
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <div className="flex items-start gap-3">
      <div>
        <h1
          className="font-semibold tracking-tight flex items-center gap-2"
          style={{
            fontFamily: 'var(--dh-font-display)',
            fontSize: 'clamp(22px, 3.2vw, 32px)',
            color: 'var(--dh-ink)',
          }}
        >
          <FolderHeart className="w-6 h-6" style={{ color: 'var(--dh-turquoise)' }} />
          Mi Seguimiento
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-500)' }}>
          Tareas, instrucciones y archivos compartidos con tus médicos.
        </p>
      </div>
    </div>
  );
}
