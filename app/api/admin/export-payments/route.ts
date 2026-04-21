import { NextResponse } from 'next/server'

// Endpoint eliminado — ya no exportamos pagos del flujo de aprobaciones.
export async function GET() {
  return NextResponse.json({ error: 'Endpoint eliminado.' }, { status: 410 })
}
