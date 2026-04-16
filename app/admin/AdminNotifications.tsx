'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function AdminNotifications() {
  const [newDoctorsCount, setNewDoctorsCount] = useState(0)
  const [newDoctors, setNewDoctors] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function loadNewDoctors() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, created_at')
          .eq('role', 'doctor')
          .eq('reviewed_by_admin', false)
          .order('created_at', { ascending: false })

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = column doesn't exist, fallback to last 24h
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          const { data: fallbackData } = await supabase
            .from('profiles')
            .select('id, full_name, email, created_at')
            .eq('role', 'doctor')
            .gte('created_at', oneDayAgo)
            .order('created_at', { ascending: false })

          setNewDoctorsCount(fallbackData?.length || 0)
          setNewDoctors(fallbackData || [])
        } else {
          setNewDoctorsCount(data?.length || 0)
          setNewDoctors(data || [])
        }
      } catch (err) {
        console.error('Error loading new doctors:', err)
      }
    }

    loadNewDoctors()

    // Poll every 60 seconds
    const interval = setInterval(loadNewDoctors, 60000)
    return () => clearInterval(interval)
  }, [])

  async function markAsReviewed(doctorId: string) {
    try {
      await supabase
        .from('profiles')
        .update({ reviewed_by_admin: true })
        .eq('id', doctorId)

      setNewDoctors(prev => prev.filter(d => d.id !== doctorId))
      setNewDoctorsCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Error marking as reviewed:', err)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {newDoctorsCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full">
            {newDoctorsCount > 9 ? '9+' : newDoctorsCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg border border-slate-200 shadow-lg z-50">
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">Médicos nuevos</h3>
            <p className="text-xs text-slate-500 mt-1">{newDoctorsCount} sin revisar</p>
          </div>

          {newDoctorsCount === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No hay médicos nuevos
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {newDoctors.map((doctor) => (
                <div
                  key={doctor.id}
                  className="px-4 py-3 border-b border-slate-100 last:border-b-0 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-xs flex-shrink-0">
                      {doctor.full_name?.charAt(0) ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{doctor.full_name}</p>
                      <p className="text-xs text-slate-400 truncate">{doctor.email}</p>
                    </div>
                  </div>
                  <Link
                    href={`/admin/doctors?focus=${doctor.id}`}
                    className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium ml-2"
                    onClick={() => {
                      setIsOpen(false)
                      markAsReviewed(doctor.id)
                    }}
                  >
                    Ver
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
