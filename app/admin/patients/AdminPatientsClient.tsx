'use client'

/**
 * AdminPatientsClient — tabla y filtros de pacientes (admin)
 * 2026-05-02: rediseño Delta Health Tech (tokens dh-*).
 */

import { useMemo, useState } from 'react'
import { Search, Download, Filter, X, ChevronDown } from 'lucide-react'
import { Card, Btn } from '@/components/dh'

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

type Props = { patients: PatientRow[] }

const AVATAR_COLORS = ['var(--dh-turquoise)', 'var(--dh-coral)', 'var(--dh-ink)', 'var(--dh-turquoise-700)']
function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name?: string | null): string {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase() || '').join('')
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
  const [showFilters, setShowFilters] = useState(false)

  const doctorOptions = useMemo(
    () => Array.from(new Set(patients.map(p => p.doctor_name).filter(Boolean))).sort(),
    [patients]
  )
  const specialtyOptions = useMemo(
    () => Array.from(new Set(patients.map(p => p.doctor_specialty).filter(Boolean))).sort(),
    [patients]
  )

  const filtered = useMemo(() => {
    return patients.filter(p => {
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
      p.full_name || '', p.email || '', p.phone || '', p.cedula || '',
      calcAge(p.birth_date), p.citas, p.atendidas,
      p.doctor_name || '', p.doctor_specialty || '',
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

  const hasFilters = !!(filterDoctor || filterSpecialty || filterFrom || filterTo)

  return (
    <>
      {/* Search bar pill + filtros toggle + export */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <div
          className="flex items-center gap-2.5 bg-white rounded-full px-4 py-2.5 flex-1 min-w-[260px] max-w-md"
          style={{ border: '1.5px solid var(--dh-gray-100)' }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--dh-gray-400)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cédula, email o teléfono..."
            className="flex-1 outline-none text-[13px] bg-transparent"
            style={{ color: 'var(--dh-ink)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="shrink-0">
              <X className="w-3.5 h-3.5" style={{ color: 'var(--dh-gray-400)' }} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(s => !s)}
          className="flex items-center gap-2 px-3.5 py-2.5 bg-white rounded-full text-[13px] font-medium cursor-pointer relative"
          style={{
            border: hasFilters ? '1.5px solid var(--dh-turquoise)' : '1.5px solid var(--dh-gray-100)',
            color: hasFilters ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-800)',
          }}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros {hasFilters && `(${[filterDoctor, filterSpecialty, filterFrom, filterTo].filter(Boolean).length})`}
          <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        <Btn
          variant="primary"
          size="sm"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={exportExcel}
          disabled={filtered.length === 0}
        >
          Exportar ({filtered.length})
        </Btn>
      </div>

      {/* Filters panel (collapsible) */}
      {showFilters && (
        <Card padding={20} className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--dh-gray-600)' }}>
                Médico
              </label>
              <select
                value={filterDoctor}
                onChange={e => setFilterDoctor(e.target.value)}
                className="px-3 py-2 rounded-[var(--dh-r-md)] text-sm outline-none bg-white"
                style={{ border: '1.5px solid var(--dh-gray-100)', color: 'var(--dh-ink)' }}
              >
                <option value="">Todos</option>
                {doctorOptions.map(d => <option key={d as string} value={d as string}>{d as string}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--dh-gray-600)' }}>
                Especialidad
              </label>
              <select
                value={filterSpecialty}
                onChange={e => setFilterSpecialty(e.target.value)}
                className="px-3 py-2 rounded-[var(--dh-r-md)] text-sm outline-none bg-white"
                style={{ border: '1.5px solid var(--dh-gray-100)', color: 'var(--dh-ink)' }}
              >
                <option value="">Todas</option>
                {specialtyOptions.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--dh-gray-600)' }}>
                Desde
              </label>
              <input
                type="date"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                className="px-3 py-2 rounded-[var(--dh-r-md)] text-sm outline-none bg-white"
                style={{ border: '1.5px solid var(--dh-gray-100)', color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-mono)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--dh-gray-600)' }}>
                Hasta
              </label>
              <input
                type="date"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                className="px-3 py-2 rounded-[var(--dh-r-md)] text-sm outline-none bg-white"
                style={{ border: '1.5px solid var(--dh-gray-100)', color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-mono)' }}
              />
            </div>
          </div>
          {hasFilters && (
            <div className="flex justify-end mt-3">
              <button
                onClick={clearFilters}
                className="text-xs font-semibold inline-flex items-center gap-1"
                style={{ color: 'var(--dh-gray-600)' }}
              >
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Tabla / cards mobile */}
      <Card padding={0}>
        <div
          className="px-6 py-4"
          style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>
            Listado
            <span className="ml-2 font-normal" style={{ color: 'var(--dh-gray-400)' }}>
              ({filtered.length} de {patients.length})
            </span>
          </h2>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: 'var(--dh-gray-50)' }}>
                {['Paciente', 'Cédula', 'Edad', 'Citas', 'Atendidas', 'Médico', 'Registrado'].map(h => (
                  <th
                    key={h}
                    className="text-left"
                    style={{
                      padding: '14px 20px', fontSize: 11, fontFamily: 'var(--dh-font-mono)',
                      color: 'var(--dh-gray-600)', textTransform: 'uppercase', letterSpacing: '.08em',
                      fontWeight: 500, borderBottom: '1px solid var(--dh-gray-100)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16" style={{ color: 'var(--dh-gray-400)' }}>
                    {hasFilters || search ? 'Sin resultados con esos filtros' : 'Sin pacientes registrados aún'}
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--dh-gray-100)' : 'none',
                    }}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                          style={{ background: avatarColor(p.id), fontFamily: 'var(--dh-font-display)' }}
                        >
                          {initials(p.full_name)}
                        </div>
                        <div>
                          <div className="font-semibold" style={{ color: 'var(--dh-ink)' }}>
                            {p.full_name || '—'}
                          </div>
                          {p.email && (
                            <div className="text-[11px]" style={{ color: 'var(--dh-gray-400)', marginTop: 2 }}>
                              {p.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: 'var(--dh-font-mono)', color: 'var(--dh-gray-600)' }}>
                      {p.cedula || '—'}
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: 'var(--dh-font-mono)' }}>
                      {calcAge(p.birth_date)}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span
                        className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: 'var(--dh-turquoise-50)',
                          color: 'var(--dh-turquoise-700)',
                          fontFamily: 'var(--dh-font-mono)',
                        }}
                      >
                        {p.citas}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span
                        className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: '#D1FAE5',
                          color: '#047857',
                          fontFamily: 'var(--dh-font-mono)',
                        }}
                      >
                        {p.atendidas}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      {p.doctor_name ? (
                        <div>
                          <div style={{ color: 'var(--dh-ink)', fontWeight: 500, fontSize: 12 }}>
                            {p.doctor_name}
                          </div>
                          {p.doctor_specialty && (
                            <div style={{ color: 'var(--dh-gray-400)', fontSize: 11 }}>
                              {p.doctor_specialty}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--dh-gray-400)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: 'var(--dh-font-mono)', color: 'var(--dh-gray-400)', fontSize: 12 }}>
                      {new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden divide-y" style={{ borderColor: 'var(--dh-gray-100)' }}>
          {filtered.length === 0 ? (
            <div className="p-12 text-center" style={{ color: 'var(--dh-gray-400)' }}>
              {hasFilters || search ? 'Sin resultados' : 'Sin pacientes'}
            </div>
          ) : (
            filtered.map(p => (
              <div key={p.id} className="p-4 flex items-center gap-3" style={{ borderColor: 'var(--dh-gray-100)' }}>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                  style={{ background: avatarColor(p.id), fontFamily: 'var(--dh-font-display)' }}
                >
                  {initials(p.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-sm" style={{ color: 'var(--dh-ink)' }}>
                    {p.full_name || '—'}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}>
                    {p.cedula || '—'} · {calcAge(p.birth_date)} años
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: 'var(--dh-turquoise-50)', color: 'var(--dh-turquoise-700)', fontFamily: 'var(--dh-font-mono)' }}
                  >
                    {p.citas} citas
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  )
}
