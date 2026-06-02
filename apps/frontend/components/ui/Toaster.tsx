'use client'

// AUDIT FIX 2026-04-28 (FASE 5C): Toaster propio sin dependencias.
// Reemplaza el `toast = { success: alert, error: alert }` de doctor/agenda.
//
// Uso:
//   import { showToast } from '@/components/ui/Toaster'
//   showToast({ type: 'success', message: 'Cita confirmada' })
//
// Y en algún lugar del layout (idealmente raíz):
//   import { Toaster } from '@/components/ui/Toaster'
//   <Toaster />
//
// Si <Toaster /> no se monta, showToast() cae silenciosamente con console.warn.

import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, X, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
type ToastItem = { id: number; type: ToastType; message: string }

let nextId = 1
const listeners = new Set<(item: ToastItem) => void>()

export function showToast(opts: { type?: ToastType; message: string }) {
  const item: ToastItem = {
    id: nextId++,
    type: opts.type ?? 'info',
    message: opts.message,
  }
  if (listeners.size === 0) {
    console.warn('[Toaster] no listener mounted; falling back to console.', item.message)
    return
  }
  listeners.forEach((fn) => fn(item))
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const fn = (item: ToastItem) => {
      setItems((prev) => [...prev, item])
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id))
      }, 4000)
    }
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto">
      {items.map((item) => {
        const tone =
          item.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : item.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-slate-200 bg-white text-slate-700'
        const Icon =
          item.type === 'success' ? CheckCircle : item.type === 'error' ? AlertCircle : Info
        return (
          <div
            key={item.id}
            role="status"
            className={`flex items-start gap-3 rounded-xl border shadow-md px-4 py-3 ${tone}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm font-medium flex-1 min-w-0">{item.message}</p>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
              aria-label="Cerrar"
              className="opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
