import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/invoice-pdf?invoiceId=xxx — generación de PDF de factura.
 *
 * ETAPA 1: DESHABILITADO. La generación de PDF + storage es parte de la Fase 5
 * (storage GCS + plantillas). Supabase fue eliminado de este handler.
 *
 * El generador local (`./pdf-generator`) se conserva para reutilizarlo cuando se
 * cablee al backend (obtener la factura desde el módulo billing + tasa BCV) en Fase 5.
 */
export function GET(_req: NextRequest): NextResponse {
  return NextResponse.json(
    {
      error: 'La generación de facturas en PDF estará disponible en una próxima versión.',
      code: 'NOT_IMPLEMENTED',
    },
    { status: 501 },
  );
}
