/**
 * components/dh/StatusPill.tsx
 *
 * Pill de estado consistente con el design system Delta Health Tech.
 * Cada status tiene su par bg/fg + dot indicador color.
 *
 * Estados soportados (extensible):
 *   - active      ✅ verde
 *   - pending     ⏳ amber
 *   - suspended   ⛔ rojo
 *   - paid        💰 verde
 *   - processing  ⏱ turquesa
 *   - failed      ❌ rojo
 *   - approved    ✅ verde
 *   - rejected    ❌ rojo
 *   - cancelled   ⏸ gris
 *   - completed   ✅ verde
 *   - trial       🧪 azul
 *   - past_due    ⚠️ naranja
 *   - scheduled   📅 azul
 *   - confirmed   ✅ verde
 *   - no_show     ❌ rojo
 */

type StatusKey =
  | 'active' | 'pending' | 'suspended' | 'paid' | 'processing' | 'failed'
  | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'trial' | 'past_due'
  | 'scheduled' | 'confirmed' | 'no_show' | 'in_progress'

type StatusMeta = { label: string; bg: string; fg: string; dot: string }

const STATUS_MAP: Record<StatusKey, StatusMeta> = {
  active:      { label: 'Activo',      bg: '#D1FAE5',                fg: '#047857',                dot: '#10B981' },
  pending:     { label: 'Pendiente',   bg: '#FEF3C7',                fg: '#92400E',                dot: '#F59E0B' },
  suspended:   { label: 'Suspendido',  bg: '#FEE2E2',                fg: '#B91C1C',                dot: '#EF4444' },
  paid:        { label: 'Pagado',      bg: '#D1FAE5',                fg: '#047857',                dot: '#10B981' },
  processing:  { label: 'Procesando',  bg: 'var(--dh-turquoise-50)', fg: 'var(--dh-turquoise-700)',dot: 'var(--dh-turquoise)' },
  failed:      { label: 'Fallido',     bg: '#FEE2E2',                fg: '#B91C1C',                dot: '#EF4444' },
  approved:    { label: 'Aprobado',    bg: '#D1FAE5',                fg: '#047857',                dot: '#10B981' },
  rejected:    { label: 'Rechazado',   bg: '#FEE2E2',                fg: '#B91C1C',                dot: '#EF4444' },
  cancelled:   { label: 'Cancelado',   bg: 'var(--dh-gray-100)',     fg: 'var(--dh-gray-600)',     dot: 'var(--dh-gray-400)' },
  completed:   { label: 'Atendida',    bg: '#D1FAE5',                fg: '#047857',                dot: '#10B981' },
  trial:       { label: 'Prueba',      bg: '#DBEAFE',                fg: '#1E40AF',                dot: '#3B82F6' },
  past_due:    { label: 'Vencido',     bg: '#FED7AA',                fg: '#9A3412',                dot: '#EA580C' },
  scheduled:   { label: 'Agendada',    bg: '#DBEAFE',                fg: '#1E40AF',                dot: '#3B82F6' },
  confirmed:   { label: 'Confirmada',  bg: '#D1FAE5',                fg: '#047857',                dot: '#10B981' },
  no_show:     { label: 'No asistió',  bg: '#FEE2E2',                fg: '#B91C1C',                dot: '#EF4444' },
  in_progress: { label: 'En curso',    bg: 'var(--dh-turquoise-50)', fg: 'var(--dh-turquoise-700)',dot: 'var(--dh-turquoise)' },
}

type Props = {
  status: StatusKey | string
  /** Label custom que sobrescribe el default */
  label?: string
  /** Tamaño del pill */
  size?: 'sm' | 'md'
  className?: string
}

export function StatusPill({ status, label, size = 'md', className = '' }: Props) {
  const meta = STATUS_MAP[status as StatusKey] || {
    label: status,
    bg: 'var(--dh-gray-100)',
    fg: 'var(--dh-gray-600)',
    dot: 'var(--dh-gray-400)',
  }
  const sizeClasses = size === 'sm'
    ? 'text-[10px] px-2 py-0.5 gap-1'
    : 'text-[11px] px-2.5 py-1 gap-1.5'
  const dotSize = size === 'sm' ? 5 : 6

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeClasses} ${className}`}
      style={{ background: meta.bg, color: meta.fg }}
    >
      <span style={{ width: dotSize, height: dotSize, borderRadius: 999, background: meta.dot, flex: '0 0 auto' }} />
      {label || meta.label}
    </span>
  )
}
