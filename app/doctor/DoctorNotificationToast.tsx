'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Bell, X, Calendar, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type NewBooking = {
  id: string
  patient_name: string
  scheduled_at: string
  plan_name: string | null
  plan_price: number | null
  type: 'appointment' | 'consultation'
}

type Toast = {
  id: string
  booking: NewBooking
  visible: boolean
}

export default function DoctorNotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const knownIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const soundEnabledRef = useRef(true)

  // Load sound preference
  useEffect(() => {
    const saved = localStorage.getItem('appt_sound_enabled')
    if (saved !== null) soundEnabledRef.current = saved === 'true'
  }, [])

  const playSound = useCallback(() => {
    if (!soundEnabledRef.current) return
    try {
      const ctx = new AudioContext()
      // Pleasant two-tone notification
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()
      osc1.type = 'sine'
      osc2.type = 'sine'
      osc1.frequency.value = 587.33 // D5
      osc2.frequency.value = 783.99 // G5
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8)
      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)
      osc1.start(ctx.currentTime)
      osc2.start(ctx.currentTime + 0.15)
      osc1.stop(ctx.currentTime + 0.4)
      osc2.stop(ctx.currentTime + 0.6)
    } catch {}
  }, [])

  const showToast = useCallback((booking: NewBooking) => {
    const toastId = `toast-${booking.id}-${Date.now()}`
    setToasts(prev => [...prev, { id: toastId, booking, visible: true }])
    playSound()

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === toastId ? { ...t, visible: false } : t))
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId))
      }, 500)
    }, 8000)
  }, [playSound])

  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev => prev.map(t => t.id === toastId ? { ...t, visible: false } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId))
    }, 500)
  }, [])

  // Poll for new appointments every 30 seconds
  useEffect(() => {
    const supabase = createClient()

    async function checkNewBookings() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Check recent appointments (last 2 minutes)
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

        const { data: recentAppts } = await supabase
          .from('appointments')
          .select('id, patient_name, scheduled_at, plan_name, plan_price, created_at')
          .eq('doctor_id', user.id)
          .gte('created_at', twoMinutesAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        const { data: recentConsults } = await supabase
          .from('consultations')
          .select('id, patients(full_name), consultation_date, plan_name, amount, created_at')
          .eq('doctor_id', user.id)
          .gte('created_at', twoMinutesAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        // On first load, just record existing IDs (don't toast)
        if (!initializedRef.current) {
          (recentAppts || []).forEach(a => knownIdsRef.current.add(`appt-${a.id}`))
          ;(recentConsults || []).forEach(c => knownIdsRef.current.add(`cons-${c.id}`))
          initializedRef.current = true
          return
        }

        // Check for new appointments
        for (const appt of (recentAppts || [])) {
          const key = `appt-${appt.id}`
          if (!knownIdsRef.current.has(key)) {
            knownIdsRef.current.add(key)
            showToast({
              id: appt.id,
              patient_name: appt.patient_name || 'Paciente',
              scheduled_at: appt.scheduled_at,
              plan_name: appt.plan_name,
              plan_price: appt.plan_price,
              type: 'appointment',
            })
          }
        }

        // Check for new consultations
        for (const cons of (recentConsults || [])) {
          const key = `cons-${cons.id}`
          if (!knownIdsRef.current.has(key)) {
            knownIdsRef.current.add(key)
            const patientName = !Array.isArray(cons.patients) && cons.patients
              ? (cons.patients as { full_name: string }).full_name
              : 'Paciente'
            showToast({
              id: cons.id,
              patient_name: patientName,
              scheduled_at: cons.consultation_date,
              plan_name: cons.plan_name,
              plan_price: cons.amount,
              type: 'consultation',
            })
          }
        }
      } catch (err) {
        console.error('Notification poll error:', err)
      }
    }

    // Initial check
    checkNewBookings()

    // Poll every 30 seconds
    const interval = setInterval(checkNewBookings, 30000)
    return () => clearInterval(interval)
  }, [showToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: '380px' }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto bg-white border border-teal-200 rounded-xl shadow-xl shadow-teal-100/50 p-4 transition-all duration-500 ${
            toast.visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-teal-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">Nueva consulta agendada</p>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <User className="w-3 h-3 text-slate-400" />
                <p className="text-sm text-slate-700 font-medium truncate">{toast.booking.patient_name}</p>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3 h-3 text-slate-400" />
                <p className="text-xs text-slate-500">
                  {new Date(toast.booking.scheduled_at).toLocaleDateString('es-VE', {
                    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              {toast.booking.plan_name && (
                <p className="text-xs text-teal-600 font-semibold mt-1">
                  {toast.booking.plan_name}
                  {toast.booking.plan_price ? ` · $${toast.booking.plan_price}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
