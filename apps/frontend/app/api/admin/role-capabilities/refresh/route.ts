import { NextResponse } from 'next/server';
import { backendPost, type AppError } from '@/lib/api-client.server';

function fail(error: AppError) {
  return NextResponse.json({ error: error.message }, { status: error.status || 500 });
}

export async function POST() {
  const result = await backendPost<{ keysDeleted: number }>(
    '/api/admin/role-capabilities/refresh',
    {},
  );
  if (!result.ok) return fail(result.error);
  return NextResponse.json(result.value);
}
