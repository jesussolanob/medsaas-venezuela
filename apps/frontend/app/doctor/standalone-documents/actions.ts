'use server';

/**
 * app/doctor/standalone-documents/actions.ts
 *
 * Server actions for standalone documents (récipes / paraclínicos / reposos sin consulta).
 * ETAPA 1 — thin-proxy to NestJS backend via BFF server-only client.
 *
 * Endpoints (contract F of docs/plan-plantillas-y-documentos.md):
 *   GET  /api/doctor/standalone-documents?patient_id=&type=&status=  — list
 *   POST /api/doctor/standalone-documents                             — create draft
 *   GET  /api/doctor/standalone-documents/:id                         — get one
 *   PATCH /api/doctor/standalone-documents/:id { content }            — update draft
 *   DELETE /api/doctor/standalone-documents/:id                       — delete draft
 *   POST /api/doctor/standalone-documents/:id/issue                   — draft → issued
 *   POST /api/doctor/standalone-documents/:id/void { reason? }        — issued → voided
 *   POST /api/standalone-documents/:id/share                          — share issued doc
 *
 * camelCase↔snake_case mapping (response → frontend type):
 *   patientId    ← patient_id (input)
 *   patientName  ← patientName (response)
 *   issuedAt     ← issuedAt (response)
 *   voidedAt     ← voidedAt (response)
 *   voidReason   ← voidReason (response)
 *   createdAt    ← createdAt (response)
 */

import { backendGet, backendPost, backendPatch, backendDelete } from '@/lib/api-client.server';
import { log } from '@/lib/logger';
import type {
  RecipeTemplateContent,
  ParaclinicalTemplateContent,
} from '@/app/doctor/templates/content-actions';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type StandaloneDocumentType = 'recipe' | 'paraclinical' | 'reposo';
export type StandaloneDocumentStatus = 'draft' | 'issued' | 'voided';

/** Content for a reposo document (has from/to unlike the template version). */
export interface ReposoDocumentContent {
  diagnosis: string;
  days: number;
  from: string; // YYYY-MM-DD (Caracas)
  to: string; // YYYY-MM-DD (Caracas)
  comments: string;
}

export type StandaloneDocumentContent =
  | RecipeTemplateContent
  | ParaclinicalTemplateContent
  | ReposoDocumentContent;

export interface StandaloneDocumentSummary {
  id: string;
  type: StandaloneDocumentType;
  code: string | null;
  status: StandaloneDocumentStatus;
  patientId: string;
  patientName: string;
  createdAt: string;
  issuedAt: string | null;
  voidedAt: string | null;
}

export interface StandaloneDocumentPatient {
  id: string;
  fullName: string;
  cedula: string | null;
  age: number | null;
}

export interface StandaloneDocument extends StandaloneDocumentSummary {
  content: StandaloneDocumentContent;
  voidReason: string | null;
  patient: StandaloneDocumentPatient;
}

export interface ShareResult {
  url: string;
  code: string;
  expiresAt: string;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Lists standalone documents for the authenticated doctor.
 * Optionally filtered by patient_id, type, or status.
 */
export async function listStandaloneDocuments(filters?: {
  patient_id?: string;
  type?: StandaloneDocumentType;
  status?: StandaloneDocumentStatus;
}): Promise<StandaloneDocumentSummary[]> {
  const result = await backendGet<StandaloneDocumentSummary[]>(
    `/api/doctor/standalone-documents${qs({
      patient_id: filters?.patient_id,
      type: filters?.type,
      status: filters?.status,
    })}`,
  );

  if (!result.ok) {
    log.error('[listStandaloneDocuments] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
}

/**
 * Gets a single standalone document by ID.
 */
export async function getStandaloneDocument(id: string): Promise<StandaloneDocument | null> {
  const result = await backendGet<StandaloneDocument>(
    `/api/doctor/standalone-documents/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    log.error('[getStandaloneDocument] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return null;
  }

  return result.value;
}

/**
 * Creates a new draft standalone document.
 */
export async function createDraftStandaloneDocument(input: {
  patient_id: string;
  type: StandaloneDocumentType;
  content: StandaloneDocumentContent;
}): Promise<MutationResult & { document?: StandaloneDocument }> {
  const result = await backendPost<StandaloneDocument>('/api/doctor/standalone-documents', input);

  if (!result.ok) {
    log.error('[createDraftStandaloneDocument] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true, document: result.value };
}

/**
 * Updates the content of a draft document.
 * Returns 409 if status is not 'draft'.
 */
export async function updateDraftStandaloneDocument(
  id: string,
  content: StandaloneDocumentContent,
): Promise<MutationResult & { document?: StandaloneDocument }> {
  const result = await backendPatch<StandaloneDocument>(
    `/api/doctor/standalone-documents/${encodeURIComponent(id)}`,
    { content },
  );

  if (!result.ok) {
    log.error('[updateDraftStandaloneDocument] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true, document: result.value };
}

/**
 * Deletes a draft document.
 * Returns 409 if status is not 'draft'.
 */
export async function deleteDraftStandaloneDocument(id: string): Promise<MutationResult> {
  const result = await backendDelete<{ success: boolean }>(
    `/api/doctor/standalone-documents/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    log.error('[deleteDraftStandaloneDocument] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

/**
 * Issues a draft document: assigns a code (REC/PAR/REP-YYYYMM-NNNN), sets status to 'issued'.
 * Returns 409 if status is not 'draft'.
 */
export async function issueStandaloneDocument(
  id: string,
): Promise<MutationResult & { document?: StandaloneDocument }> {
  const result = await backendPost<StandaloneDocument>(
    `/api/doctor/standalone-documents/${encodeURIComponent(id)}/issue`,
    {},
  );

  if (!result.ok) {
    log.error('[issueStandaloneDocument] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true, document: result.value };
}

/**
 * Voids an issued document. Optional reason.
 * Returns 409 if status is not 'issued'.
 */
export async function voidStandaloneDocument(
  id: string,
  reason?: string,
): Promise<MutationResult & { document?: StandaloneDocument }> {
  const result = await backendPost<StandaloneDocument>(
    `/api/doctor/standalone-documents/${encodeURIComponent(id)}/void`,
    { reason: reason ?? null },
  );

  if (!result.ok) {
    log.error('[voidStandaloneDocument] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true, document: result.value };
}

/**
 * Shares an issued standalone document. Returns a public URL, code, and expiry.
 * Only 'issued' documents can be shared.
 *
 * NOTE: the backend builds docSelection from the document type server-side
 * and ignores any body payload — we POST an empty body.
 */
export async function shareStandaloneDocument(
  id: string,
): Promise<MutationResult & { data?: ShareResult }> {
  const result = await backendPost<ShareResult>(
    `/api/standalone-documents/${encodeURIComponent(id)}/share`,
    {},
  );

  if (!result.ok) {
    log.error('[shareStandaloneDocument] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true, data: result.value };
}
