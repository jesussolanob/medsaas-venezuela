/**
 * app/api/storage/image-proxy/route.ts
 *
 * BFF image proxy — SERVER ONLY.
 *
 * @react-pdf/renderer fetches images via fetch() in the browser. GCS signed
 * URLs require the GCS bucket to have CORS configured for the frontend origin;
 * without that, browser fetch() fails (CORS) even though HTML <img> works.
 *
 * This proxy fetches the image server-side (no CORS restriction) and streams
 * it back to the browser so react-pdf can embed logos and signatures in PDFs.
 *
 * Security:
 *  - Only proxies URLs starting with https://storage.googleapis.com/ to prevent
 *    arbitrary SSRF.
 *  - No auth required — the GCS signed URL already authorises read access.
 *  - Response is cached for 1 hour (signed URLs have at least 1 h TTL).
 *
 * Usage (in react-pdf component):
 *   const proxied = url?.startsWith('https://storage.googleapis.com/')
 *     ? `/api/storage/image-proxy?url=${encodeURIComponent(url)}`
 *     : url;
 *   <Image src={proxied} />
 */

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_PREFIX = 'https://storage.googleapis.com/';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const urlParam = req.nextUrl.searchParams.get('url');

  if (!urlParam) {
    return NextResponse.json(
      { success: false, error: { message: 'Parámetro "url" requerido' } },
      { status: 400 },
    );
  }

  // SSRF guard: only allow GCS public/signed URLs.
  if (!urlParam.startsWith(ALLOWED_PREFIX)) {
    return NextResponse.json(
      { success: false, error: { message: 'URL no permitida' } },
      { status: 403 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(urlParam, {
      // Node.js fetch — no CORS restriction server-side.
      headers: { Accept: 'image/*' },
      // SSRF hardening: no seguir redirects (GCS sirve el objeto con 200; un 3xx
      // sería anómalo y podría apuntar a un destino interno).
      redirect: 'error',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error de red al obtener imagen';
    return NextResponse.json({ success: false, error: { message } }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { success: false, error: { message: `GCS devolvió ${upstream.status}` } },
      { status: upstream.status },
    );
  }

  const buffer = await upstream.arrayBuffer();
  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Evita sniffing de contenido (defensa anti-XSS si el objeto no fuese imagen).
      'X-Content-Type-Options': 'nosniff',
      // Cache for 1 h — matches the minimum TTL of private signed URLs.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
