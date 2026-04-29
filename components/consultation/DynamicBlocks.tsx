'use client'

/**
 * DynamicBlocks — renderiza los bloques de consulta según la configuración
 * personalizada del doctor, usando el snapshot congelado al momento de crear
 * la consulta.
 *
 * Uso:
 *   <DynamicBlocks
 *     blocks={consultation.blocks_snapshot}
 *     values={consultation.blocks_data || {}}
 *     onChange={(key, value) => ...}
 *     readOnly={false}
 *   />
 */

// L1 (2026-04-29): se eliminó el botón "Mejorar con IA" por bloque.
// La IA ahora vive en UN SOLO panel global "Asistente IA" en consultations/page.tsx
// con tres modos: resumir historial, mejorar redacción y resumir informe.

import { useState } from 'react'
import { Calendar, FileText, List as ListIcon, ChevronDown, ChevronUp } from 'lucide-react'

export type SnapshotBlock = {
  key: string
  label: string
  content_type: 'rich_text' | 'list' | 'date' | 'file' | 'structured' | 'numeric'
  sort_order: number
  printable: boolean
  send_to_patient: boolean
}

type Props = {
  blocks?: SnapshotBlock[] | null
  values?: Record<string, unknown>
  onChange?: (key: string, value: unknown) => void
  readOnly?: boolean
  onSave?: () => void
  saving?: boolean
}

export default function DynamicBlocks({ blocks, values = {}, onChange, readOnly = false, onSave, saving }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (!blocks || blocks.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg">
        No hay bloques configurados para esta consulta.
        {!readOnly && (
          <> Configura tus bloques en{' '}
            <a href="/doctor/settings/consultation-blocks" className="text-teal-600 font-semibold hover:underline">
              Configuración → Bloques de consulta
            </a>
            .
          </>
        )}
      </div>
    )
  }

  // Ordenar por sort_order
  const sorted = [...blocks].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-3">
      {sorted.map(block => {
        const value = values[block.key]
        const isCollapsed = collapsed[block.key]

        return (
          <div key={block.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
              <button
                type="button"
                onClick={() => setCollapsed(c => ({ ...c, [block.key]: !c[block.key] }))}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <BlockIcon type={block.content_type} />
                <span className="text-sm font-semibold text-slate-900 truncate">{block.label}</span>
                {!block.printable && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase tracking-wider">
                    Interno
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCollapsed(c => ({ ...c, [block.key]: !c[block.key] }))}
                  className="text-slate-400"
                  aria-label={isCollapsed ? 'Expandir bloque' : 'Colapsar bloque'}
                >
                  {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="p-4 space-y-3">
                <BlockEditor
                  block={block}
                  value={value}
                  onChange={v => onChange?.(block.key, v)}
                  readOnly={readOnly}
                />
              </div>
            )}
          </div>
        )
      })}

      {!readOnly && onSave && (
        <div className="sticky bottom-4 flex justify-end pt-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 shadow-sm"
          >
            {saving ? 'Guardando…' : 'Guardar consulta'}
          </button>
        </div>
      )}
    </div>
  )
}

function BlockIcon({ type }: { type: SnapshotBlock['content_type'] }) {
  if (type === 'date') return <Calendar className="w-4 h-4 text-teal-500" />
  if (type === 'list') return <ListIcon className="w-4 h-4 text-teal-500" />
  return <FileText className="w-4 h-4 text-teal-500" />
}

function BlockEditor({
  block, value, onChange, readOnly,
}: {
  block: SnapshotBlock
  value: unknown
  onChange: (v: unknown) => void
  readOnly: boolean
}) {
  switch (block.content_type) {
    case 'date': {
      const s = typeof value === 'string' ? value : ''
      if (readOnly) {
        return <p className="text-sm text-slate-700">{s ? new Date(s).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
      }
      return (
        <input
          type="date"
          value={s.slice(0, 10)}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
      )
    }

    case 'list': {
      const items = Array.isArray(value) ? (value as string[]) : []
      if (readOnly) {
        return items.length === 0
          ? <p className="text-sm text-slate-400 italic">Vacío</p>
          : <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
              {items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
      }
      return <ListEditor items={items} onChange={onChange} />
    }

    case 'numeric': {
      const n = typeof value === 'number' ? value : (typeof value === 'string' ? Number(value) : 0)
      if (readOnly) return <p className="text-sm text-slate-700">{Number.isFinite(n) ? n : '—'}</p>
      return (
        <input
          type="number"
          value={Number.isFinite(n) ? n : ''}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
      )
    }

    case 'structured':
    case 'rich_text':
    case 'file':
    default: {
      const s = typeof value === 'string' ? value : ''
      if (readOnly) {
        return s
          ? <div className="text-sm text-slate-700 whitespace-pre-wrap">{s}</div>
          : <p className="text-sm text-slate-400 italic">Sin información</p>
      }
      return (
        <textarea
          value={s}
          onChange={e => onChange(e.target.value)}
          rows={5}
          placeholder={`Escribe aquí: ${block.label.toLowerCase()}…`}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-vertical focus:border-teal-400 outline-none"
        />
      )
    }
  }
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={it}
            onChange={e => {
              const next = [...items]
              next[i] = e.target.value
              onChange(next)
            }}
            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-slate-400 hover:text-red-500 text-sm px-2"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault()
              onChange([...items, draft.trim()])
              setDraft('')
            }
          }}
          placeholder="Agregar ítem + Enter"
          className="flex-1 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={() => {
            if (draft.trim()) {
              onChange([...items, draft.trim()])
              setDraft('')
            }
          }}
          className="px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50 rounded"
        >
          + Agregar
        </button>
      </div>
    </div>
  )
}
