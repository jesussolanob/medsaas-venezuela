/**
 * GET /api/public/seller-code/:code — valida un código de vendedor.
 *
 * Público a propósito: se usa en el registro del especialista, cuando todavía
 * no hay sesión. Devuelve SOLO `{ valid, sellerName }` — lo justo para
 * confirmar visualmente a quién se le va a acreditar la venta, sin exponer
 * nada más del perfil del vendedor.
 *
 * Existe porque el código se dicta por teléfono y se tipea a mano: sin esta
 * verificación, un error de una letra deja la venta sin acreditar y el
 * vendedor se entera semanas después.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface SellerCodeCheck {
  valid: boolean;
  sellerName: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;

  if (!code?.trim()) {
    return NextResponse.json({ valid: false, sellerName: null });
  }

  // `anonymous` es OBLIGATORIO acá: sin eso el cliente resuelve identidad y
  // devuelve 401 al visitante deslogueado — que es el ÚNICO que usa esta ruta,
  // porque el código se valida durante el registro. El 401 caía en el `if
  // (!result.ok)` de abajo y salía como "código inválido", indistinguible de un
  // error de tipeo: el especialista que llegaba por el enlace de un vendedor
  // veía "este enlace no es válido" y la venta quedaba sin acreditar.
  const result = await backendGet<SellerCodeCheck>(
    `/api/public/seller-code/${encodeURIComponent(code.trim().toUpperCase())}`,
    { anonymous: true },
  );

  // Un código inválido NO es un error de la app: se responde 200 con
  // valid:false para que el formulario lo muestre como aviso y no como falla.
  if (!result.ok) {
    return NextResponse.json({ valid: false, sellerName: null });
  }

  return NextResponse.json({
    valid: Boolean(result.value?.valid),
    sellerName: result.value?.sellerName ?? null,
  });
}
