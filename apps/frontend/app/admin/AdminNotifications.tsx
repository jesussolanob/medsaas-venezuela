'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, ChevronRight } from 'lucide-react'
import Link from 'next/link'

/**
 * Notificaciones del admin — beta privada.
 * Muestra los médicos que se registraron en los últimos 7 días.
 * Ya NO maneja flujo de aprobaciones (eliminado).
 */
export default function AdminNotifications() {
  const [recentDoctors, setRecentDoctors] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function loadRecentDoctors() {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email, created_at')
          .eq('role', 'doctor')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(10)

        setRecentDoctors(data || [])
      } catch (err) {
        console.error('Error loading recent doctors:', err)
      }
    }

    loadRecentDoctors()
    const interval = setInterval(loadRecentDoctors, 60000)
    return () => clearInterval(interval)
  }, [])

  const count = recentDoctors.length

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        title="Médicos nuevos (últimos 7 días)"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 bg-teal-500 text-white text-xs font-bold rounded-full">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-screen sm:w-80 sm:max-w-xs bg-white rounded-lg border border-slate-200 shadow-lg z-50 max-h-[60vh] sm:max-h-96 overflow-y-auto -mr-4 sm:mr-0">
          <div className="p-3 sm:p-4 border-b border-slate-200 sticky top-0 bg-white">
            <h3 className="font-semibold text-slate-900 text-sm">Médicos recientes</h3>
            <p className="text-xs text-slate-500 mt-1">
              {count === 0 ? 'Sin registros' : `${count} en los últimos 7 días`}
            </p>
          </div>

          {count === 0 ? (
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
                      <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">{doctor.full_name}</p>
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

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
