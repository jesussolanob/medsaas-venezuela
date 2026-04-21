import { NextResponse } from 'next/server'

// Endpoint eliminado — el flujo de aprobaciones de pagos fue removido en beta privada.
// Los médicos obtienen acceso inmediato al registrarse.
export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint eliminado. El flujo de aprobaciones ya no existe.' },
    { status: 410 } // 410 Gone
  )
}

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
