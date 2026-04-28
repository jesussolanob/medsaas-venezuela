'use client'

/**
 * MarkdownText — RONDA 46
 *
 * Renderer de markdown ligero para textos generados por LLMs (Gemini, etc.).
 * Soporta lo que GENERALMENTE llega del LLM:
 *   - **negritas**       → <strong>
 *   - *italica*          → <em>     (no choca con **)
 *   - `codigo inline`    → <code>
 *   - lineas que empiezan con "*   " o "-   " → bullet con •
 *   - lineas que empiezan con numero+punto    → enumeracion
 *   - "###" / "##" / "#" al inicio de linea   → headers (h3/h2/h1)
 *   - Saltos de linea preservados
 *
 * Sanitizacion: escapa &, <, > antes de aplicar transformaciones, asi nunca
 * se cuela HTML del LLM.
 */

type Props = {
  text: string
  className?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function applyInline(s: string): string {
  // El orden importa: bold (**) primero, luego italic (*), luego code (`).
  return s
    // Bold
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // Italic — solo cuando NO esta rodeado de otro asterisco (para no chocar con bold ya procesado)
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    // Code inline
    .replace(/`([^`\n]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 text-slate-800 rounded text-[0.85em]">$1</code>')
}

export default function MarkdownText({ text, className = '' }: Props) {
  if (!text) return null

  // Procesar linea por linea para detectar listas y headers
  const lines = text.split('\n')
  const out: string[] = []
  let inList: 'ul' | 'ol' | null = null

  function closeListIfNeeded() {
    if (inList) {
      out.push(`</${inList}>`)
      inList = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Lista no ordenada: "* item" o "- item" o "*   item"
    const ulMatch = line.match(/^[\s]*[*\-]\s+(.+)$/)
    // Lista ordenada: "1. item" o "1) item"
    const olMatch = line.match(/^[\s]*(\d+)[.)]\s+(.+)$/)
    // Headers: "# H1", "## H2", "### H3"
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/)

    if (hMatch) {
      closeListIfNeeded()
      const level = hMatch[1].length
      const tag = `h${level}`
      const cls = level === 1
        ? 'text-base font-bold text-slate-900 mt-3 mb-1.5'
        : level === 2
        ? 'text-sm font-bold text-slate-900 mt-2.5 mb-1'
        : 'text-sm font-semibold text-slate-800 mt-2 mb-1'
      out.push(`<${tag} class="${cls}">${applyInline(escapeHtml(hMatch[2]))}</${tag}>`)
      continue
    }

    if (ulMatch) {
      if (inList !== 'ul') {
        closeListIfNeeded()
        out.push('<ul class="list-disc pl-5 my-1 space-y-0.5">')
        inList = 'ul'
      }
      out.push(`<li>${applyInline(escapeHtml(ulMatch[1]))}</li>`)
      continue
    }

    if (olMatch) {
      if (inList !== 'ol') {
        closeListIfNeeded()
        out.push('<ol class="list-decimal pl-5 my-1 space-y-0.5">')
        inList = 'ol'
      }
      out.push(`<li>${applyInline(escapeHtml(olMatch[2]))}</li>`)
      continue
    }

    // Linea normal o vacia
    closeListIfNeeded()
    if (line === '') {
      out.push('<div class="h-2"></div>')
    } else {
      out.push(`<p class="my-1">${applyInline(escapeHtml(line))}</p>`)
    }
  }
  closeListIfNeeded()

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: out.join('') }}
    />
  )
}
