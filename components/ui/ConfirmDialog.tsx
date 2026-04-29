'use client'

// AUDIT FIX 2026-04-28 (C-10): reemplazo branded de confirm() nativo.
// Diseño Tailwind alineado con el resto de la app (turquesa + slate).

import { AlertTriangle, X } from 'lucide-react'

export type ConfirmDialogProps = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title = '¿Estás seguro?',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  const confirmClasses =
    variant === 'danger'
      ? 'bg-red-500 hover:bg-red-600 text-white'
      : 'g-bg text-white'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={loading ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              variant === 'danger' ? 'bg-red-50' : 'bg-amber-50'
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 ${variant === 'danger' ? 'text-red-500' : 'text-amber-500'}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              id="confirm-dialog-title"
              className="text-sm font-bold text-slate-800"
            >
              {title}
            </p>
            <p className="text-sm text-slate-600 mt-1">{message}</p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            aria-label="Cerrar"
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 ${confirmClasses}`}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
