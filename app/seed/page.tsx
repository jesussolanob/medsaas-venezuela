'use client'

import { useState } from 'react'

export default function SeedPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<string>('')

  const runSeed = async () => {
    setStatus('loading')
    setResult('')
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
        setResult(JSON.stringify(data, null, 2))
      } else {
        setStatus('error')
        setResult(JSON.stringify(data, null, 2))
      }
    } catch (err: any) {
      setStatus('error')
      setResult(err.message || 'Error desconocido')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-lg w-full text-center space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Seed de Datos de Prueba</h1>
        <p className="text-slate-500 text-sm">
          Esto creará pacientes, consultas y citas de prueba para el doctor de test.
        </p>

        <button
          onClick={runSeed}
          disabled={status === 'loading'}
          className="w-full py-3 bg-teal-500 text-white font-bold rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
        >
          {status === 'loading' ? 'Ejecutando...' : 'Ejecutar Seed'}
        </button>

        {status === 'success' && (
          <div className="text-left bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-700 font-semibold mb-2">✓ Seed completado</p>
            <pre className="text-xs text-green-600 overflow-auto max-h-60">{result}</pre>
          </div>
        )}

        {status === 'error' && (
          <div className="text-left bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 font-semibold mb-2">✗ Error</p>
            <pre className="text-xs text-red-600 overflow-auto max-h-60">{result}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
