'use client';
import { useState, useEffect } from 'react';
import { Bell, ChevronRight, PhoneCall } from 'lucide-react';
import Link from 'next/link';

type RecentDoctor = { id: string; full_name: string; email: string; created_at: string };

/**
 * Notificaciones del admin — beta privada.
 * Muestra los médicos que se registraron en los últimos 7 días,
 * más el contador de solicitudes de contacto pendientes.
 *
 * Usa route handlers estables para evitar el UnrecognizedActionError que
 * rompía con pestañas viejas tras cada deploy.
 * El polling es best-effort: si falla, se ignora en silencio.
 */
export default function AdminNotifications() {
  const [recentDoctors, setRecentDoctors] = useState<RecentDoctor[]>([]);
  const [pendingContactCount, setPendingContactCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [doctorsRes, contactRes] = await Promise.all([
          fetch('/api/admin/recent-doctors?days=7', { cache: 'no-store' }),
          fetch('/api/admin/contact-requests/pending-count', { cache: 'no-store' }),
        ]);

        if (!cancelled && doctorsRes.ok) {
          const json = (await doctorsRes.json()) as { data?: RecentDoctor[] };
          setRecentDoctors(Array.isArray(json.data) ? json.data : []);
        }

        if (!cancelled && contactRes.ok) {
          const json = (await contactRes.json()) as { data?: { count?: number } };
          setPendingContactCount(json.data?.count ?? 0);
        }
      } catch {
        // Best-effort — el bell no es crítico.
      }
    }

    void loadData();
    const interval = setInterval(() => void loadData(), 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const doctorCount = recentDoctors.length;
  // Badge shows combined notification count
  const totalCount = doctorCount + (pendingContactCount > 0 ? 1 : 0);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        title="Notificaciones"
        aria-label="Notificaciones del administrador"
      >
        <Bell className="w-5 h-5" />
        {totalCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 bg-teal-500 text-white text-xs font-bold rounded-full">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-screen sm:w-80 sm:max-w-xs bg-white rounded-lg border border-slate-200 shadow-lg z-50 max-h-[60vh] sm:max-h-96 overflow-y-auto -mr-4 sm:mr-0">
          {/* Pending contact requests section */}
          {pendingContactCount > 0 && (
            <div className="border-b border-slate-100">
              <div className="px-3 sm:px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors gap-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                    <PhoneCall className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {pendingContactCount} solicitud{pendingContactCount !== 1 ? 'es' : ''} de
                      contacto pendiente{pendingContactCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-400">Especialistas que piden ser llamados</p>
                  </div>
                </div>
                <Link
                  href="/admin/contact-requests"
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium shrink-0 whitespace-nowrap"
                  onClick={() => setIsOpen(false)}
                >
                  Ver
                  <ChevronRight className="w-3 h-3 hidden sm:inline" />
                </Link>
              </div>
            </div>
          )}

          {/* Recent doctors section */}
          <div className="p-3 sm:p-4 border-b border-slate-200 sticky top-0 bg-white">
            <h3 className="font-semibold text-slate-900 text-sm">Especialistas recientes</h3>
            <p className="text-xs text-slate-500 mt-1">
              {doctorCount === 0 ? 'Sin registros' : `${doctorCount} en los últimos 7 días`}
            </p>
          </div>

          {doctorCount === 0 ? (
            <div className="p-6 sm:p-8 text-center text-slate-400 text-sm">
              No hay médicos nuevos esta semana
            </div>
          ) : (
            <>
              {recentDoctors.map((doctor) => (
                <div
                  key={doctor.id}
                  className="px-3 sm:px-4 py-3 border-b border-slate-100 last:border-b-0 flex items-center justify-between hover:bg-slate-50 transition-colors gap-2"
                >
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-xs flex-shrink-0">
                      {doctor.full_name?.charAt(0) ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                        {doctor.full_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{doctor.email}</p>
                    </div>
                  </div>
                  <Link
                    href={`/admin/doctors?focus=${doctor.id}`}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium flex-shrink-0 whitespace-nowrap"
                    onClick={() => setIsOpen(false)}
                  >
                    Ver
                    <ChevronRight className="w-3 h-3 hidden sm:inline" />
                  </Link>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  );
}
