'use client';
import { useState, useEffect } from 'react';
import { Bell, CheckCheck, FileText } from 'lucide-react';
import type { NotificationItem } from '@/app/api/doctor/notifications/route';

const POLL_MS = 60_000;

/**
 * DoctorNotifications — campana de notificaciones del especialista.
 *
 * Muestra un badge rojo con el conteo de no leídas. Al hacer clic abre un
 * dropdown con las 30 notificaciones más recientes. Cada notificación se puede
 * marcar como leída al hacer clic; también hay un botón "Marcar todo como leído".
 *
 * ADR-022: usa route handlers (/api/doctor/notifications/*) en lugar de Server
 * Actions para que el polling no truene "Server Action not found" luego de un
 * deploy.
 *
 * MVP: solo notificaciones de presupuestos (quote_accepted | quote_rejected).
 * Polling cada 60 s — best-effort, fallo de red se ignora silenciosamente.
 */
export default function DoctorNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);

  /*
    Toda escritura de estado vive dentro de `.then()`, nunca en el cuerpo del
    efecto: `react-hooks/set-state-in-effect` marca como error llamar desde el
    cuerpo a una función que setea estado. Es la misma forma que usa
    `RescheduleModal`, y por eso el fetch va escrito acá adentro en vez de
    extraído a un `useCallback`.
  */
  useEffect(() => {
    let cancelled = false;

    const traer = () =>
      fetch('/api/doctor/notifications', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { data?: { items: NotificationItem[]; unreadCount: number } } | null) => {
          if (cancelled || !json?.data) return;
          setItems(json.data.items);
          setUnreadCount(json.data.unreadCount);
        })
        .catch(() => {
          // Best-effort: la campana no es crítica — un fallo de red se ignora.
        });

    void traer();
    const interval = setInterval(() => void traer(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleMarkOne = async (id: string) => {
    if (marking) return;
    setMarking(id);
    try {
      const res = await fetch(`/api/doctor/notifications/${id}/read`, { method: 'POST' });
      if (res.ok) {
        setItems((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // Best-effort: ignorar
    } finally {
      setMarking(null);
    }
  };

  const handleMarkAll = async () => {
    try {
      const res = await fetch('/api/doctor/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
        setUnreadCount(0);
      }
    } catch {
      // Best-effort: ignorar
    }
  };

  const badge = Math.min(unreadCount, 99);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative p-2 rounded-full transition-colors"
        style={{ color: 'var(--dh-gray-600)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--dh-gray-50)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
        title="Notificaciones"
        aria-label={`Notificaciones${unreadCount > 0 ? ` — ${unreadCount} sin leer` : ''}`}
      >
        <Bell className="w-[18px] h-[18px]" />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-screen sm:w-80 sm:max-w-xs bg-white rounded-xl border border-slate-200 shadow-lg z-50 max-h-[70vh] flex flex-col -mr-4 sm:mr-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
            <h3 className="font-semibold text-slate-900 text-sm">Notificaciones</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors"
                title="Marcar todo como leído"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Leer todo
              </button>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                No hay notificaciones aún
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.readAt) {
                      void handleMarkOne(n.id);
                    }
                  }}
                  disabled={marking === n.id}
                  className={[
                    'w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0',
                    'flex items-start gap-3 transition-colors',
                    n.readAt ? 'hover:bg-slate-50' : 'bg-teal-50/60 hover:bg-teal-50',
                    marking === n.id ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {/* Icon */}
                  <div
                    className={[
                      'mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                      n.type === 'quote_accepted'
                        ? 'bg-teal-100 text-teal-600'
                        : 'bg-red-100 text-red-500',
                    ].join(' ')}
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-sm leading-snug truncate',
                        n.readAt ? 'text-slate-600 font-normal' : 'text-slate-900 font-semibold',
                      ].join(' ')}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {new Date(n.createdAt).toLocaleString('es-VE', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!n.readAt && (
                    <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-teal-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  );
}
