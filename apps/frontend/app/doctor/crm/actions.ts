'use server';

/**
 * app/doctor/crm/actions.ts
 *
 * Server Actions for the CRM leads domain.
 * ETAPA 1 — thin-proxy to the NestJS `leads` module via api-client.server (BFF).
 * Replaces the direct Supabase queries (leads table) that lived in the page.
 *
 * Backend endpoints (doctorId derived from the dev-stub on the backend — anti-IDOR):
 *   GET  /api/doctor/leads
 *   POST /api/doctor/leads
 *   PUT  /api/doctor/leads/:id/stage
 *
 * DEFERRED — Fase 5 (no backend endpoint): lead_messages (chat) stays client-local.
 */

import { backendGet, backendPost, backendPut } from '@/lib/api-client.server';

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'appointment' | 'converted' | 'lost';
export type LeadChannel = 'whatsapp' | 'instagram' | 'facebook' | 'web' | 'llamada' | 'referido';

export interface LeadRow {
  id: string;
  doctor_id: string;
  name: string;
  last_name?: string;
  email?: string;
  phone: string;
  channel: LeadChannel;
  stage: LeadStage;
  message: string;
  created_at: string;
  last_activity?: string;
}

interface BackendLead {
  id: string;
  doctor_id: string;
  name: string;
  last_name?: string | null;
  email?: string | null;
  phone: string | null;
  channel: string | null;
  stage: LeadStage;
  message: string | null;
  created_at: string;
  last_activity?: string | null;
}

/** Coerce backend nulls to the non-null shape the UI renders. */
function toLeadRow(l: BackendLead): LeadRow {
  return {
    id: l.id,
    doctor_id: l.doctor_id,
    name: l.name,
    last_name: l.last_name ?? undefined,
    email: l.email ?? undefined,
    phone: l.phone ?? '',
    channel: (l.channel ?? 'web') as LeadChannel,
    stage: l.stage,
    message: l.message ?? '',
    created_at: l.created_at,
    last_activity: l.last_activity ?? undefined,
  };
}

/** Fetch the authenticated doctor's leads. */
export async function getLeads(): Promise<LeadRow[]> {
  const result = await backendGet<BackendLead[]>('/api/doctor/leads');
  if (!result.ok) return [];
  return Array.isArray(result.value) ? result.value.map(toLeadRow) : [];
}

/** Create a new lead. Returns the created row, or null on failure. */
export async function createLead(input: {
  name: string;
  last_name?: string;
  email?: string;
  phone: string;
  channel: LeadChannel;
  message: string;
  stage?: LeadStage;
}): Promise<LeadRow | null> {
  const result = await backendPost<BackendLead>('/api/doctor/leads', {
    name: input.name,
    ...(input.last_name ? { last_name: input.last_name } : {}),
    ...(input.email ? { email: input.email } : {}),
    phone: input.phone,
    channel: input.channel,
    stage: input.stage ?? 'new',
    message: input.message,
  });
  if (!result.ok) return null;
  return toLeadRow(result.value);
}

/** Update only the stage of a lead (kanban drag-and-drop). */
export async function updateLeadStage(id: string, stage: LeadStage): Promise<{ success: boolean }> {
  const result = await backendPut<BackendLead>(`/api/doctor/leads/${id}/stage`, { stage });
  return { success: result.ok };
}
