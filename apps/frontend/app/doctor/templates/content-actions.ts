'use server';

/**
 * app/doctor/templates/content-actions.ts
 *
 * Server actions for content templates (plantillas de contenido).
 * ETAPA 1 — thin-proxy to NestJS backend via BFF server-only client.
 *
 * Endpoints:
 *   GET  /api/doctor/content-templates?type=  — list templates (optionally filtered by type)
 *   POST /api/doctor/content-templates        — create template
 *   GET  /api/doctor/content-templates/:id    — get one template
 *   PUT  /api/doctor/content-templates/:id    — update template (name and/or content)
 *   DELETE /api/doctor/content-templates/:id  — delete template
 *
 * camelCase↔ mapping:
 *   Backend response field  →  Frontend type field
 *   createdAt               →  createdAt
 *   updatedAt               →  updatedAt
 *   doctorId                →  (not exposed in frontend type)
 *
 * Content shapes per type (snake_case inside `content` per API contract F):
 *   recipe       → { medications: Medication[], notes: string }
 *   paraclinical → { items: { exam_name: string, notes: string }[] }
 *   reposo       → { diagnosis: string, days: number, comments: string }
 *   presupuesto  → { items: PresupuestoTemplateItem[] }
 */

import { backendGet, backendPost, backendPut, backendDelete } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type MedicationTemplate = {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  presentation: string;
  indications: string;
};

export type RecipeTemplateContent = {
  medications: MedicationTemplate[];
  notes: string;
};

export type ParaclinicalTemplateContent = {
  items: { exam_name: string; notes: string }[];
};

export type ReposoTemplateContent = {
  diagnosis: string;
  days: number;
  comments: string;
};

export type PresupuestoTemplateItem = {
  kind: 'service' | 'product' | 'manual';
  source_id: string | null;
  name: string;
  description: string;
  quantity: number;
  /** Only present for manual items — service/product price is resolved at apply time. */
  unit_price_usd?: number;
};

export type PresupuestoTemplateContent = {
  items: PresupuestoTemplateItem[];
};

export type ContentTemplateType = 'recipe' | 'paraclinical' | 'reposo' | 'presupuesto';

export type TemplateContent =
  | RecipeTemplateContent
  | ParaclinicalTemplateContent
  | ReposoTemplateContent
  | PresupuestoTemplateContent;

export interface ContentTemplate {
  id: string;
  type: ContentTemplateType;
  name: string;
  content: TemplateContent;
  createdAt: string;
  updatedAt: string;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Lists content templates for the authenticated doctor, optionally filtered by type.
 * Returns [] on any error (fail-safe: content templates are non-critical).
 */
export async function listContentTemplates(type?: ContentTemplateType): Promise<ContentTemplate[]> {
  const result = await backendGet<ContentTemplate[]>(
    `/api/doctor/content-templates${qs({ type })}`,
  );

  if (!result.ok) {
    log.error('[listContentTemplates] backend error', {
      code: result.error.code,
      status: result.error.status,
      type,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
}

/**
 * Creates a new content template.
 */
export async function createContentTemplate(input: {
  type: ContentTemplateType;
  name: string;
  content: TemplateContent;
}): Promise<MutationResult & { template?: ContentTemplate }> {
  const result = await backendPost<ContentTemplate>('/api/doctor/content-templates', input);

  if (!result.ok) {
    log.error('[createContentTemplate] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true, template: result.value };
}

/**
 * Updates an existing content template (name and/or content).
 * Template type is immutable per API contract.
 */
export async function updateContentTemplate(
  id: string,
  input: { name?: string; content?: TemplateContent },
): Promise<MutationResult & { template?: ContentTemplate }> {
  const result = await backendPut<ContentTemplate>(
    `/api/doctor/content-templates/${encodeURIComponent(id)}`,
    input,
  );

  if (!result.ok) {
    log.error('[updateContentTemplate] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true, template: result.value };
}

/**
 * Deletes a content template.
 */
export async function deleteContentTemplate(id: string): Promise<MutationResult> {
  const result = await backendDelete<{ success: boolean }>(
    `/api/doctor/content-templates/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    log.error('[deleteContentTemplate] backend error', {
      code: result.error.code,
      status: result.error.status,
      id,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}
