/**
 * app/api/suggestions/route.ts
 *
 * ETAPA 1 — thin-proxy to the NestJS `suggestions` module via api-client.server (BFF).
 * Replaces the direct Supabase (doctor_suggestions) queries.
 *
 * Role-aware routing (dev-auth stub):
 *   - super_admin → /api/admin/suggestions  (sees all doctors' suggestions, can respond)
 *   - doctor      → /api/doctor/suggestions (own mailbox: list + create)
 *
 * Status vocabulary differs between the legacy UI and the backend, so we map
 * both directions here WITHOUT touching the .tsx (data-layer only):
 *   UI       backend
 *   pending  pending
 *   in_progress  reviewed | planned
 *   resolved     done | rejected
 *
 * GAP (backend, Fase 5 / mejora): the backend does not join `profiles`
 * (doctor full_name/specialty), so the admin list shows those fields empty.
 */

import { NextResponse } from 'next/server';
import { backendGet, backendPost, backendPut } from '@/lib/api-client.server';
import { resolveIdentity } from '@/lib/identity.server';

type UiStatus = 'pending' | 'in_progress' | 'resolved';

interface SuggestionDto {
  id: string;
  doctor_id?: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  admin_response?: string | null;
  created_at: string;
  updated_at?: string;
}

/** Map a backend status to the legacy UI status the pages render. */
function backendToUiStatus(status: string): UiStatus {
  switch (status) {
    case 'reviewed':
    case 'planned':
      return 'in_progress';
    case 'done':
    case 'rejected':
      return 'resolved';
    default:
      return 'pending';
  }
}

/** Map a legacy UI status to the backend status the API accepts. */
function uiToBackendStatus(status: string): 'pending' | 'reviewed' | 'done' {
  switch (status) {
    case 'in_progress':
      return 'reviewed';
    case 'resolved':
      return 'done';
    default:
      return 'pending';
  }
}

function toUiSuggestion(s: SuggestionDto): SuggestionDto {
  return { ...s, status: backendToUiStatus(s.status) };
}

// GET: list suggestions (admin → all; doctor → own)
export async function GET() {
  let user: { id: string; role: string };
  try {
    user = await resolveIdentity();
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const isAdmin = user.role === 'super_admin';
  const path = isAdmin ? '/api/admin/suggestions' : '/api/doctor/suggestions';

  const result = await backendGet<SuggestionDto[]>(path);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const items = Array.isArray(result.value) ? result.value.map(toUiSuggestion) : [];
  return NextResponse.json(items);
}

// POST: doctor creates a suggestion
export async function POST(request: Request) {
  const body = await request.json();
  const { subject, message, category } = body ?? {};

  if (!subject || !message) {
    return NextResponse.json({ error: 'Subject and message required' }, { status: 400 });
  }

  const result = await backendPost<SuggestionDto>('/api/doctor/suggestions', {
    subject,
    message,
    category: category || 'general',
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json(toUiSuggestion(result.value));
}

// PATCH: admin updates status / responds
export async function PATCH(request: Request) {
  let user: { id: string; role: string };
  try {
    user = await resolveIdentity();
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  // Admin-only route — the backend also enforces @Roles('super_admin'); this is
  // defense in depth so a non-admin gets a clean 403 from the BFF.
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { id, status, admin_response } = body ?? {};

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const result = await backendPut<SuggestionDto>(`/api/admin/suggestions/${id}`, {
    status: uiToBackendStatus(status),
    admin_response: admin_response ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json(toUiSuggestion(result.value));
}
