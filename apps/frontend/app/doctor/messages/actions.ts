'use server';

/**
 * app/doctor/messages/actions.ts
 *
 * Server actions for the doctor messages module.
 * ETAPA 1 — thin-proxy to NestJS backend via the BFF server-only client.
 * No Supabase. No Realtime. Identity (doctorId) resolved by backend from dev-auth header.
 *
 * NOTE: Realtime (postgres_changes subscription) that existed in the legacy
 * page has been REMOVED with no WS replacement. Auto-refresh is not implemented
 * in this iteration; the UI shows messages as-of the last server action call.
 * A future iteration may add polling via setInterval or SSE.
 *
 * Endpoints:
 *   GET  /api/doctor/messages/threads       — list threads (patientName masked as "Juan P.")
 *   GET  /api/doctor/messages?patientId=    — full thread (decrypted body, marks msgs read)
 *   POST /api/doctor/messages               — send doctor_to_patient message
 *
 * camelCase↔ mapping:
 *   Backend field     →  Frontend field
 *   patientId         →  patient_id
 *   patientName       →  patient_name (already masked by backend mapper)
 *   lastMessageAt     →  last_message_time (ISO string)
 *   unreadCount       →  unread_count
 *   direction         →  direction (already string, no transform needed)
 *   readAt            →  read_at
 *   createdAt         →  created_at
 */

import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Camelcase shape from backend mapper (ThreadListItem). */
interface BackendThreadListItem {
  patientId: string;
  patientName: string;    // already masked: "Juan P."
  lastMessageAt: string;  // ISO date string
  unreadCount: number;
}

/** Camelcase shape from backend mapper (MessageItem). */
interface BackendMessageItem {
  id: string;
  doctorId: string;
  patientId: string;
  body: string;
  direction: string;      // 'doctor_to_patient' | 'patient_to_doctor'
  readAt: string | null;  // ISO date string or null
  createdAt: string;      // ISO date string
}

/** Thread summary shape consumed by the UI (Conversation interface in page.tsx). */
export interface ConversationView {
  patient_id: string;
  patient_name: string;
  last_message_time: string;
  unread_count: number;
}

/** Message shape consumed by the UI (Message interface in page.tsx). */
export interface MessageView {
  id: string;
  body: string;
  direction: string;
  created_at: string;
  read_at: string | null;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toConversationView(t: BackendThreadListItem): ConversationView {
  return {
    patient_id: t.patientId,
    patient_name: t.patientName,
    last_message_time: t.lastMessageAt,
    unread_count: t.unreadCount,
  };
}

function toMessageView(m: BackendMessageItem): MessageView {
  return {
    id: m.id,
    body: m.body,
    direction: m.direction,
    created_at: m.createdAt,
    read_at: m.readAt,
  };
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Lists all message threads for the authenticated doctor.
 * Patient names are already masked by the backend mapper layer ("Juan P.").
 * Returns an empty array on error (non-critical for UI — shows empty state).
 */
export async function listMessageThreads(): Promise<ConversationView[]> {
  const result = await backendGet<BackendThreadListItem[]>('/api/doctor/messages/threads');

  if (!result.ok) {
    log.error('[listMessageThreads] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const threads = Array.isArray(result.value) ? result.value : [];
  return threads.map(toConversationView);
}

/**
 * Fetches all messages in the thread with a given patient.
 * The backend decrypts PHI before returning — the doctor is the authorized owner.
 * Also marks patient_to_doctor messages as read server-side.
 * Returns 404 from backend if patient does not belong to this doctor (anti-IDOR).
 */
export async function getMessageThread(patientId: string): Promise<{
  messages: MessageView[];
  error?: string;
}> {
  const result = await backendGet<BackendMessageItem[]>(
    `/api/doctor/messages?patientId=${encodeURIComponent(patientId)}`,
  );

  if (!result.ok) {
    log.error('[getMessageThread] backend error', {
      code: result.error.code,
      status: result.error.status,
      patientId,
    });
    return { messages: [], error: result.error.message };
  }

  const messages = Array.isArray(result.value) ? result.value : [];
  return { messages: messages.map(toMessageView) };
}

/**
 * Sends a doctor_to_patient message.
 * Body: { patient_id, body } — matches SendMessageDtoSchema from shared-types.
 * Returns 404 from backend if patient does not belong to this doctor (anti-IDOR).
 */
export async function sendMessage(
  patientId: string,
  body: string,
): Promise<{ message?: MessageView; error?: string }> {
  if (!body.trim()) {
    return { error: 'El mensaje no puede estar vacío' };
  }
  if (body.length > 4000) {
    return { error: 'El mensaje no puede superar 4000 caracteres' };
  }

  const result = await backendPost<BackendMessageItem>('/api/doctor/messages', {
    patient_id: patientId,
    body: body.trim(),
  });

  if (!result.ok) {
    log.error('[sendMessage] backend error', {
      code: result.error.code,
      status: result.error.status,
      patientId,
    });
    return { error: result.error.message };
  }

  return { message: toMessageView(result.value) };
}
