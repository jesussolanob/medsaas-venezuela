'use client'

import { useState, useEffect } from 'react'

type BcvRateData = {
  rate: number | null
  dateLabel: string
  loading: boolean
  refresh: () => void
  /** Convert USD amount to Bs string */
  toBs: (usd: number) => string
  /** Convert USD amount to Bs number */
  toBsNum: (usd: number) => number
}

/**
 * Hook to fetch BCV exchange rate and provide USD→Bs conversion.
 * Uses the centralized /api/admin/bcv-rate endpoint.
 */
export function useBcvRate(): BcvRateData {
  const [rate, setRate] = useState<number | null>(null)
  const [dateLabel, setDateLabel] = useState('')
  const [loading, setLoading] = useState(true)

  async function fetchRate() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bcv-rate')
      if (res.ok) {
        const data = await res.json()
        if (data.rate && data.rate > 0) {
          setRate(data.rate)
          setDateLabel(data.date || '')
        }
      }
    } catch (err) {
      console.error('Error fetching BCV rate:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRate()
  }, [])

  function toBs(usd: number): string {
    if (!rate) return '—'
    return `Bs. ${(usd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function toBsNum(usd: number): number {
    if (!rate) return 0
    return usd * rate
  }

  return { rate, dateLabel, loading, refresh: fetchRate, toBs, toBsNum }
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
