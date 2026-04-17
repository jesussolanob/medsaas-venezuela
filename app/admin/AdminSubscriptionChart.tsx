'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const chartData = [
  { month: 'Nov', count: 12 },
  { month: 'Dic', count: 18 },
  { month: 'Ene', count: 25 },
  { month: 'Feb', count: 32 },
  { month: 'Mar', count: 38 },
  { month: 'Abr', count: 45 },
]

export default function AdminSubscriptionChart() {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
      >
        <defs>
          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '12px' }} />
        <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          labelStyle={{ color: '#1e293b' }}
        />
        <Area type="monotone" dataKey="count" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
