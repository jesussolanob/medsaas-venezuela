'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface ChartDataPoint {
  month: string
  count: number
}

interface SubscriptionStats {
  chartData: ChartDataPoint[]
  momGrowth: number
  newThisMonth: number
}

interface AdminSubscriptionChartProps {
  onStatsLoaded?: (stats: SubscriptionStats) => void
}

export default function AdminSubscriptionChart({ onStatsLoaded }: AdminSubscriptionChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/admin/subscription-stats')
        if (!response.ok) {
          throw new Error('Failed to fetch subscription stats')
        }
        const data: SubscriptionStats = await response.json()
        setChartData(data.chartData)
        if (onStatsLoaded) {
          onStatsLoaded(data)
        }
      } catch (err) {
        console.error('Error fetching stats:', err)
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [onStatsLoaded])

  if (loading) {
    return (
      <div className="w-full h-[250px] flex items-center justify-center">
        <p className="text-slate-400 text-sm">Cargando datos...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-[250px] flex items-center justify-center">
        <p className="text-red-400 text-sm">Error: {error}</p>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="w-full h-[250px] flex items-center justify-center">
        <p className="text-slate-400 text-sm">No hay datos disponibles</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
      >
        <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '12px' }} />
        <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          labelStyle={{ color: '#1e293b' }}
          cursor={{ fill: '#14b8a606' }}
        />
        <Bar dataKey="count" fill="#14b8a6" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
