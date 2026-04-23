// REMOVED 2026-04-22: tabla payment_accounts nunca existió en BD.
// Los métodos de pago viven en profiles.payment_methods (array) + profiles.payment_details (jsonb).
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ error: 'Endpoint deshabilitado: usa profiles.payment_methods' }, { status: 410 })
}
