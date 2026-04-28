/**
 * ReportBlocksViewer — RONDA 36
 *
 * Renderiza el report_data inmutable en la vista del paciente y en el PDF.
 * Itera sobre report_data.blocks (que YA viene filtrado de vacios por el
 * helper buildReportData) y pinta cada uno segun su content_type.
 *
 * Uso:
 *   <ReportBlocksViewer report={consultation.report_data} forPatient />
 *
 * Props:
 *   - report: ReportData | null
 *   - forPatient: si true, solo muestra bloques con send_to_patient=true
 *   - className: estilos adicionales del container
 */

import { ReportData, ReportBlock, filterBlocksForPatient } from '@/lib/report-data'
import { Calendar, FileText, List as ListIcon, Hash } from 'lucide-react'

type Props = {
  report?: ReportData | null
  forPatient?: boolean
  className?: string
}

export default function ReportBlocksViewer({ report, forPatient = false, className = '' }: Props) {
  if (!report || !Array.isArray(report.blocks) || report.blocks.length === 0) {
    return null
  }

  const blocks = forPatient ? filterBlocksForPatient(report) : report.blocks

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        El médico aún no ha compartido contenido del informe.
      </p>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {blocks.map(block => (
        <BlockSection key={block.key} block={block} />
      ))}
    </div>
  )
}

function BlockSection({ block }: { block: ReportBlock }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <BlockIcon type={block.content_type} />
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          {block.label}
        </h3>
      </div>
      <BlockValue block={block} />
    </div>
  )
}

function BlockIcon({ type }: { type: ReportBlock['content_type'] }) {
  if (type === 'date') return <Calendar className="w-3.5 h-3.5 text-teal-500" />
  if (type === 'list') return <ListIcon className="w-3.5 h-3.5 text-teal-500" />
  if (type === 'numeric') return <Hash className="w-3.5 h-3.5 text-teal-500" />
  return <FileText className="w-3.5 h-3.5 text-teal-500" />
}

function BlockValue({ block }: { block: ReportBlock }) {
  const v = block.value

  switch (block.content_type) {
    case 'date': {
      const s = typeof v === 'string' ? v : ''
      const formatted = s
        ? new Date(s).toLocaleDateString('es-VE', {
            day: 'numeric', month: 'long', year: 'numeric',
          })
        : '—'
      return <p className="text-sm text-slate-700">{formatted}</p>
    }

    case 'list': {
      const items = Array.isArray(v) ? (v as unknown[]) : []
      const filtered = items.filter(it => typeof it === 'string' && it.trim() !== '') as string[]
      return (
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 bg-slate-50 rounded-lg p-3 sm:p-4">
          {filtered.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )
    }

    case 'numeric': {
      const n = typeof v === 'number' ? v : Number(v)
      return <p className="text-sm text-slate-700 font-mono">{Number.isFinite(n) ? n : '—'}</p>
    }

    case 'structured': {
      // Si vino como objeto, listar key:value. Si vino como string, render plano.
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const entries = Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== '')
        return (
          <div className="bg-slate-50 rounded-lg p-3 sm:p-4 space-y-1">
            {entries.map(([k, val]) => (
              <div key={k} className="flex flex-wrap gap-2 text-sm text-slate-700">
                <span className="font-semibold capitalize">{k.replace(/_/g, ' ')}:</span>
                <span>{String(val)}</span>
              </div>
            ))}
          </div>
        )
      }
      const s = typeof v === 'string' ? v : ''
      return (
        <div
          className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
          dangerouslySetInnerHTML={{ __html: s }}
        />
      )
    }

    case 'rich_text':
    case 'file':
    default: {
      const s = typeof v === 'string' ? v : ''
      // Si tiene tags HTML, usar dangerouslySetInnerHTML; si no, whitespace-pre-wrap
      const hasHtml = /<[a-z][\s\S]*>/i.test(s)
      if (hasHtml) {
        return (
          <div
            className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
            dangerouslySetInnerHTML={{ __html: s }}
          />
        )
      }
      return (
        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 sm:p-4">
          {s}
        </p>
      )
    }
  }
}
