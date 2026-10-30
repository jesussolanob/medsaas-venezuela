/**
 * POST /api/admin/release-notes/image-upload
 *
 * Multipart thin-proxy → NestJS POST /api/admin/release-notes/image-upload
 * Field: file (jpg/png/webp)
 * Response: { imageUrl: <signed url>, path: <storage path> }
 *
 * The caller must store `path` (not `imageUrl`) as the `imageUrl` field when
 * creating or updating a release note. The signed URL is only for preview.
 *
 * Roles: super_admin, admin
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/lib/auth-guards';
import { resolveIdentity } from '@/lib/identity.server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminOrSuperAdmin();
  if (!guard.ok) return guard.response;

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Cuerpo de la solicitud inválido (multipart esperado)' },
      },
      { status: 400 },
    );
  }

  const file = incoming.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: { message: 'Campo "file" requerido' } },
      { status: 400 },
    );
  }

  const identity = await resolveIdentity();

  const outgoing = new FormData();
  outgoing.append('file', file, file instanceof File ? file.name : 'upload');

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/admin/release-notes/image-upload`, {
      method: 'POST',
      headers: {
        'x-dev-user-id': identity.id,
        'x-dev-user-role': identity.role,
        // Do NOT set Content-Type — fetch adds multipart/form-data with boundary.
      },
      body: outgoing,
    });
  } catch (networkErr: unknown) {
    const message =
      networkErr instanceof Error ? networkErr.message : 'Error de red al contactar el backend';
    return NextResponse.json({ success: false, error: { message } }, { status: 502 });
  }

  let json: unknown;
  try {
    json = await backendRes.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Respuesta del backend no válida' } },
      { status: 502 },
    );
  }

  return NextResponse.json(json, { status: backendRes.status });
}
