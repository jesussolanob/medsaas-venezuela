'use client'

import { useState, useEffect } from 'react'

type BcvRateData = {
  rate: number | null
  dateLabel: string
  /** Modo de conversión que el doctor eligió: 'usd_bcv' | 'eur_bcv' | 'custom' */
  mode: string
  /** Etiqueta corta del modo activo (ej: "USD → BsS BCV") */
  label: string
  loading: boolean
  refresh: () => void
  /** Convert amount (USD/EUR según modo) to Bs string */
  toBs: (amount: number) => string
  /** Convert amount to Bs number */
  toBsNum: (amount: number) => number
}

/**
 * Hook to fetch the doctor's configured exchange rate.
 * Respects profiles.currency_mode:
 *   - 'usd_bcv' → tasa oficial BCV USD (default)
 *   - 'eur_bcv' → tasa oficial BCV EUR
 *   - 'custom'  → tasa manual fijada por el doctor
 *
 * Fallback: si el doctor no está autenticado, consume /api/admin/bcv-rate (USD).
 */
export function useBcvRate(): BcvRateData {
  const [rate, setRate] = useState<number | null>(null)
  const [dateLabel, setDateLabel] = useState('')
  const [mode, setMode] = useState<string>('usd_bcv')
  const [label, setLabel] = useState<string>('USD → BsS')
  const [loading, setLoading] = useState(true)

  async function fetchRate() {
    setLoading(true)
    try {
      // Intentar primero con el endpoint específico del doctor
      let res = await fetch('/api/doctor/exchange-rate', { cache: 'no-store' })
      if (!res.ok) {
        // Fallback: admin/bcv-rate (público, no requiere auth)
        res = await fetch('/api/admin/bcv-rate', { cache: 'no-store' })
      }
      if (res.ok) {
        const data = await res.json()
        if (data.rate && data.rate > 0) {
          setRate(data.rate)
          setDateLabel(data.date || '')
          setMode(data.mode || 'usd_bcv')
          setLabel(data.label || 'USD → BsS')
        }
      }
    } catch (err) {
      console.error('Error fetching exchange rate:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRate()
  }, [])

  function toBs(amount: number): string {
    if (!rate) return '—'
    return `Bs. ${(amount * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function toBsNum(amount: number): number {
    if (!rate) return 0
    return amount * rate
  }

  return { rate, dateLabel, mode, label, loading, refresh: fetchRate, toBs, toBsNum }
}

/**
 * Inline component to display Bs equivalent in muted text.
 * Usage: <BsLabel usd={30} rate={bcvRate} />
 */
export function BsLabel({ usd, rate, className = '' }: { usd: number; rate: number | null; className?: string }) {
  if (!rate || !usd) return null
  const bs = (usd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <span className={`text-xs text-slate-400 ${className}`}>
      Bs. {bs}
    </span>
  )
}
