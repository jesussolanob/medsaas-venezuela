/**
 * GET /api/doctor/patients/:id — detalle de un paciente del doctor autenticado.
 *
 * Thin-proxy al backend NestJS `GET /api/patients/:id` (owner-scoped, PII descifrada
 * para el doctor dueño). Lo consume el header del consultorio para mostrar el nombre
 * del paciente. Devuelve `{ data }` (el cliente acepta `j.data` o `j`).
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const result = await backendGet<unknown>(`/api/patients/${id}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ data: result.value });
}
