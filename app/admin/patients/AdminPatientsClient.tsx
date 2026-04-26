'use client'

import { useMemo, useState } from 'react'
import { Search, Download, Filter, X } from 'lucide-react'

export type PatientRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  cedula: string | null
  birth_date: string | null
  created_at: string
  doctor_id: string | null
  doctor_name: string | null
  doctor_specialty: string | null
  citas: number
  atendidas: number
}

type Props = {
  patients: PatientRow[]
}

function calcAge(birth: string | null): string {
  if (!birth) return '—'
  const b = new Date(birth)
  if (isNaN(b.getTime())) return '—'
  const years = Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000))
  return years >= 0 && years < 130 ? `${years}` : '—'
}

export default function AdminPatientsClient({ patients }: Props) {
  const [search, setSearch] = useState('')
  const [filterDoctor, setFilterDoctor] = useState('')
  const [filterSpecialty, setFilterSpecialty] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Listas únicas para los selects
  const doctorOptions = useMemo(
    () => Array.from(new Set(patients.map(p => p.doctor_name).filter(Boolean))).sort(),
    [patients]
  )
  const specialtyOptions = useMemo(
    () => Array.from(new Set(patients.map(p => p.doctor_specialty).filter(Boolean))).sort(),
    [patients]
  )

  // Aplicar filtros
  const filtered = useMemo(() => {
    return patients.filter(p => {
      // Search en nombre / email / cédula
      if (search.trim()) {
        const s = search.toLowerCase()
        const match =
          p.full_name?.toLowerCase().includes(s) ||
          p.email?.toLowerCase().includes(s) ||
          p.cedula?.toLowerCase().includes(s) ||
          p.phone?.toLowerCase().includes(s)
        if (!match) return false
      }
      if (filterDoctor && p.doctor_name !== filterDoctor) return false
      if (filterSpecialty && p.doctor_specialty !== filterSpecialty) return false
      if (filterFrom && new Date(p.created_at) < new Date(filterFrom)) return false
      if (filterTo) {
        const to = new Date(filterTo)
        to.setHours(23, 59, 59, 999)
        if (new Date(p.created_at) > to) return false
      }
      return true
    })
  }, [patients, search, filterDoctor, filterSpecialty, filterFrom, filterTo])

  function clearFilters() {
    setSearch('')
    setFilterDoctor('')
    setFilterSpecialty('')
    setFilterFrom('')
    setFilterTo('')
  }

  function exportExcel() {
    const headers = ['Nombre', 'Email', 'Teléfono', 'Cédula', 'Edad', 'Citas', 'Atendidas', 'Médico', 'Especialidad', 'Registrado']
    const rows = filtered.map(p => [
      p.full_name || '',
      p.email || '',
      p.phone || '',
      p.cedula || '',
      calcAge(p.birth_date),
      p.citas,
      p.atendidas,
      p.doctor_name || '',
      p.doctor_specialty || '',
      new Date(p.created_at).toLocaleDateString('es-VE'),
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pacientes_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasFilters = !!(search || filterDoctor || filterSpecialty || filterFrom || filterTo)

  return (
    <>
      {/* Toolbar de filtros — grid responsivo, todos los campos del mismo tamaño */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Filtros</h3>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 ml-2">
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>
          <button
            onClick={exportExcel}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Excel ({filtered.length})
          </button>
        </div>

        {/* Búsqueda — fila completa */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nombre, email, cédula, teléfono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400"
          />
        </div>

        {/* Filtros — 4 columnas iguales en lg, 2 en md, 1 en sm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Médico</label>
            <select
              value={filterDoctor}
              onChange={e => setFilterDoctor(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400 bg-white"
            >
              <option value="">Todos</option>
              {doctorOptions.map(d => <option key={d as string} value={d as string}>{d as string}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Especialidad</label>
            <select
              value={filterSpecialty}
              onChange={e => setFilterSpecialty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400 bg-white"
            >
              <option value="">Todas</option>
              {specialtyOptions.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Desde</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Hasta</label>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-teal-400"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            Listado ({filtered.length} de {patients.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="text-left px-5 py-3">Nombre</th>
                <th className="text-left px-5 py-3">Email</th>
                <th className="text-left px-5 py-3">Teléfono</th>
                <th className="text-left px-5 py-3">Cédula</th>
                <th className="text-right px-5 py-3">Edad</th>
                <th className="text-right px-5 py-3">Citas</th>
                <th className="text-right px-5 py-3">Atendidas</th>
                <th className="text-left px-5 py-3">Médico</th>
                <th className="text-left px-5 py-3">Especialidad</th>
                <th className="text-left px-5 py-3">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-slate-400">
                    {hasFilters ? 'No se encontraron pacientes con esos filtros' : 'No hay pacientes registrados aún'}
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{p.full_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{p.email || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{p.phone || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{p.cedula || '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{calcAge(p.birth_date)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 text-xs font-semibold">
                        {p.citas}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
                        {p.atendidas}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 text-xs">{p.doctor_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 text-xs">{p.doctor_specialty || '—'}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {new Date(p.created_at).toLocaleDateString('es-VE')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
