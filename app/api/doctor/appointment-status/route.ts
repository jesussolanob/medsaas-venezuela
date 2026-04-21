import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guards'

// POST /api/doctor/appointment-status
// Cambia el estado de una cita de forma segura (RPC con auditoría).
// body: { appointment_id, new_status, reason? }
//
// Estados permitidos:
//   scheduled | confirmed | completed | cancelled | no_show | pending | accepted
//
// Si el nuevo status es 'cancelled' y la cita usaba paquete, la sesión se
// restituye AUTOMÁTICAMENTE (dentro de la misma transacción).
export async function POST(req: NextRequest) {
  const guard = await requireRole(['doctor', 'super_admin'])
  if (!guard.ok) return guard.response
  const { admin } = guard

  const body = await req.json()
  const { appointment_id, new_status, reason } = body

  if (!appointment_id || !new_status) {
    return NextResponse.json(
      { error: 'appointment_id y new_status son requeridos' },
      { status: 400 }
    )
  }

  const valid = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'pending', 'accepted']
  if (!valid.includes(new_status)) {
    return NextResponse.json({ error: `Status inválido. Valores: ${valid.join(', ')}` }, { status: 400 })
  }

  const { error } = await admin.rpc('change_appointment_status', {
    p_appointment_id: appointment_id,
    p_new_status: new_status,
    p_reason: reason || null,
  })

  if (error) {
    const msg = error.message || ''
    if (msg.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'No tienes permiso para cambiar esta cita' }, { status: 403 })
    }
    if (msg.includes('APPOINTMENT_NOT_FOUND')) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    if (msg.includes('INVALID_STATUS')) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ success: true, new_status })
}
