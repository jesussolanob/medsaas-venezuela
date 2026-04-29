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

import { useState } from 'react'
import { Calendar, FileText, List as ListIcon, ChevronDown, ChevronUp, Wand2, Loader2, Check, X as XIcon } from 'lucide-react'
// AUDIT FIX 2026-04-29 (IA-blocks): usamos createClient para obtener token de sesión
// y showToast para errores; ambos ya existen en el codebase.
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toaster'

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

// AUDIT FIX 2026-04-29 (IA-blocks): bloques sobre los que tiene sentido aplicar IA.
// `date`, `numeric` y `file` no contienen texto narrativo, así que el botón se oculta.
function blockSupportsAI(type: SnapshotBlock['content_type']): boolean {
  return type === 'rich_text' || type === 'list' || type === 'structured'
}

export default function DynamicBlocks({ blocks, values = {}, onChange, readOnly = false, onSave, saving }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // AUDIT FIX 2026-04-29 (IA-blocks): estado por-bloque para loading y resultado
  // sugerido de IA (el doctor puede aceptar o descartar antes de aplicar).
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({})
  const [aiSuggestion, setAiSuggestion] = useState<Record<string, string>>({})

  async function improveBlockWithAI(block: SnapshotBlock) {
    const raw = values[block.key]
    // Para listas, serializamos como bullet-list textual; el endpoint lo
    // procesa como texto plano y devuelve texto que volvemos a parsear si aplica.
    let content = ''
    if (block.content_type === 'list' && Array.isArray(raw)) {
      content = (raw as string[]).filter(Boolean).map(s => `- ${s}`).join('\n')
    } else if (typeof raw === 'string') {
      content = raw
    } else if (raw != null) {
      content = String(raw)
    }
    if (!content.trim()) {
      showToast({ type: 'error', message: `Escribe algo en "${block.label}" antes de mejorar con IA.` })
      return
    }
    setAiLoading(prev => ({ ...prev, [block.key]: true }))
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        showToast({ type: 'error', message: 'Sesión expirada. Recarga la página.' })
        return
      }
      const res = await fetch('/api/doctor/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'improve_block',
          content,
          block_key: block.key,
          block_label: block.label,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        showToast({ type: 'error', message: data.error || `Error de IA (${res.status})` })
        return
      }
      setAiSuggestion(prev => ({ ...prev, [block.key]: data.result || '' }))
    } catch (err: any) {
      showToast({ type: 'error', message: 'No se pudo conectar con la IA. Intenta de nuevo.' })
    } finally {
      setAiLoading(prev => ({ ...prev, [block.key]: false }))
    }
  }

  function applyAISuggestion(block: SnapshotBlock) {
    const suggestion = aiSuggestion[block.key]
    if (!suggestion) return
    if (block.content_type === 'list') {
      // Parseamos los bullets de vuelta a array. Aceptamos `- `, `* `, o líneas sueltas.
      const parsed = suggestion
        .split('\n')
        .map(l => l.replace(/^\s*[-*•]\s*/, '').trim())
        .filter(Boolean)
      onChange?.(block.key, parsed)
    } else {
      onChange?.(block.key, suggestion)
    }
    setAiSuggestion(prev => {
      const next = { ...prev }
      delete next[block.key]
      return next
    })
  }

  function discardAISuggestion(blockKey: string) {
    setAiSuggestion(prev => {
      const next = { ...prev }
      delete next[blockKey]
      return next
    })
  }

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
        // AUDIT FIX 2026-04-29 (IA-blocks): mostramos el botón "Mejorar con IA"
        // sólo en bloques con contenido textual y cuando la consulta no es read-only.
        const showAI = !readOnly && blockSupportsAI(block.content_type)
        const isAILoading = !!aiLoading[block.key]
        const suggestion = aiSuggestion[block.key]

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
                {showAI && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); improveBlockWithAI(block) }}
                    disabled={isAILoading}
                    title={`Mejorar "${block.label}" con IA`}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {isAILoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    {isAILoading ? 'Analizando…' : 'Mejorar con IA'}
                  </button>
                )}
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

                {/* AUDIT FIX 2026-04-29 (IA-blocks): preview de la sugerencia
                    de IA con botones de aceptar/descartar. El doctor revisa antes
                    de pisar su contenido original. */}
                {suggestion && (
                  <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                        <Wand2 className="w-3 h-3" /> Sugerencia de IA
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyAISuggestion(block)}
                          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                        >
                          <Check className="w-3 h-3" /> Aplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => discardAISuggestion(block.key)}
                          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                          <XIcon className="w-3 h-3" /> Descartar
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white rounded-lg p-2 border border-violet-100 max-h-72 overflow-y-auto">
                      {suggestion}
                    </div>
                  </div>
                )}
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
