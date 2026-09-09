import { NextResponse } from 'next/server'
import { fetchBcvRates } from '@/lib/bcv-rate'

// Force dynamic — never statically cache this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/bcv-rate
 *
 * Envoltura fina de `fetchBcvRates()`. La lógica vive en `lib/bcv-rate.ts` para
 * que quien la necesite del lado del servidor —la ruta del PDF público, sin ir
 * más lejos— la llame en proceso en vez de pedírsela a esta misma app por HTTP.
 */
export async function GET() {
  return NextResponse.json(await fetchBcvRates())
}
