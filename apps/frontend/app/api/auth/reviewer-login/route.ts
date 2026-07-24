import 'server-only';

/**
 * app/api/auth/reviewer-login/route.ts
 *
 * BFF endpoint for the reviewer access flow.
 *
 * POST /api/auth/reviewer-login
 *   Body: { email: string; password: string }
 *
 * Calls the backend POST /api/auth/reviewer-login. On success, stores the
 * HMAC token in a secure httpOnly cookie (reviewer_token) and returns
 * { success: true }. The cookie lifetime matches the backend's expiresInSeconds
 * (900 s = 15 min).
 *
 * On any auth failure (401/404) returns a generic "Credenciales inválidas"
 * message to avoid leaking whether the email exists.
 *
 * The feature is harmless when REVIEWER_ACCESS_ENABLED is off because the
 * backend will reject the login request itself. The cookie is only ever set
 * after a confirmed 200 from the backend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';
const COOKIE_NAME = 'reviewer_token';

interface BackendSuccessBody {
  success: true;
  data: {
    token: string;
    expiresInSeconds: number;
  };
}

interface BackendErrorBody {
  success: false;
  message?: string;
  code?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, error: 'Cuerpo de la solicitud inválido' },
      { status: 400 },
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: 'Email y contraseña son requeridos' },
      { status: 400 },
    );
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/auth/reviewer-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 503 },
    );
  }

  // 401 / 404 / 403 → generic credentials error (don't leak details)
  if (backendRes.status === 401 || backendRes.status === 404 || backendRes.status === 403) {
    return NextResponse.json({ success: false, error: 'Credenciales inválidas' }, { status: 401 });
  }

  if (backendRes.status === 503) {
    return NextResponse.json(
      { success: false, error: 'Acceso para revisión no disponible en este momento' },
      { status: 503 },
    );
  }

  if (!backendRes.ok) {
    let errBody: BackendErrorBody | null = null;
    try {
      errBody = (await backendRes.json()) as BackendErrorBody;
    } catch {
      // Ignore parse errors — fall through to generic message.
    }
    return NextResponse.json(
      { success: false, error: errBody?.message ?? 'Error al iniciar sesión' },
      { status: backendRes.status },
    );
  }

  let successBody: BackendSuccessBody;
  try {
    successBody = (await backendRes.json()) as BackendSuccessBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Respuesta inesperada del servidor' },
      { status: 502 },
    );
  }

  const { token, expiresInSeconds } = successBody.data;
  const maxAge =
    typeof expiresInSeconds === 'number' && expiresInSeconds > 0 ? expiresInSeconds : 900;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return NextResponse.json({ success: true });
}
