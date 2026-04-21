import { NextResponse } from 'next/server'

// Endpoint eliminado — el flujo de aprobaciones/extensión manual de suscripciones
// fue removido. En beta privada las suscripciones son trial activo por 1 año automático.
export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint eliminado.' },
    { status: 410 }
  )
}
