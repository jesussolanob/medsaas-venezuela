'use server';

/**
 * app/doctor/templates/actions.ts
 *
 * Server actions for PDF template configuration (doctor-templates module).
 * ETAPA 1 — thin-proxy to NestJS backend via the BFF server-only client.
 * No Supabase. Identity (doctorId) resolved by the backend from dev-auth header.
 *
 * Endpoints:
 *   GET  /api/doctor/templates            — list all templates for doctor (may be [])
 *   PUT  /api/doctor/templates/:type      — upsert template config for a given type
 *
 * camelCase↔ mapping:
 *   Backend entity field  →  Frontend TemplateConfig field
 *   templateType          →  template_type
 *   logoUrl               →  logo_url
 *   signatureUrl          →  signature_url
 *   fontFamily            →  font_family
 *   headerText            →  header_text
 *   footerText            →  footer_text
 *   showLogo              →  show_logo
 *   showSignature         →  show_signature
 *   primaryColor          →  primary_color
 */

import { backendGet, backendPut } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Camelcase shape returned by the NestJS backend (domain entity serialized). */
interface BackendDoctorTemplate {
  id: string;
  doctorId: string;
  templateType: string;
  logoUrl: string | null;
  signatureUrl: string | null;
  fontFamily: string;
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showSignature: boolean;
  primaryColor: string;
  createdAt: string;
  updatedAt: string;
}

/** Snake_case shape consumed by the existing UI (TemplateConfig in page.tsx). */
export interface TemplateConfigView {
  template_type: string;
  logo_url: string | null;
  signature_url: string | null;
  font_family: string;
  header_text: string;
  footer_text: string;
  show_logo: boolean;
  show_signature: boolean;
  primary_color: string;
}

/** Input for upsert — mirrors UpsertDoctorTemplateDtoSchema from shared-types. */
export interface UpsertTemplateInput {
  logo_url?: string | null;
  signature_url?: string | null;
  font_family?: string;
  header_text?: string;
  footer_text?: string;
  show_logo?: boolean;
  show_signature?: boolean;
  primary_color?: string;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toView(t: BackendDoctorTemplate): TemplateConfigView {
  return {
    template_type: t.templateType,
    logo_url: t.logoUrl,
    signature_url: t.signatureUrl,
    font_family: t.fontFamily,
    header_text: t.headerText,
    footer_text: t.footerText,
    show_logo: t.showLogo,
    show_signature: t.showSignature,
    primary_color: t.primaryColor,
  };
}

/** Maps snake_case UI input to camelCase backend DTO. */
function toBackendDto(input: UpsertTemplateInput): Record<string, unknown> {
  const dto: Record<string, unknown> = {};
  if (input.logo_url !== undefined) dto.logo_url = input.logo_url;
  if (input.signature_url !== undefined) dto.signature_url = input.signature_url;
  if (input.font_family !== undefined) dto.font_family = input.font_family;
  if (input.header_text !== undefined) dto.header_text = input.header_text;
  if (input.footer_text !== undefined) dto.footer_text = input.footer_text;
  if (input.show_logo !== undefined) dto.show_logo = input.show_logo;
  if (input.show_signature !== undefined) dto.show_signature = input.show_signature;
  if (input.primary_color !== undefined) dto.primary_color = input.primary_color;
  return dto;
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Loads all saved template configs for the authenticated doctor.
 * Returns a map of templateType → TemplateConfigView for O(1) lookup.
 * Returns an empty map when no templates have been configured yet.
 */
export async function loadTemplateConfigs(): Promise<Record<string, TemplateConfigView>> {
  const result = await backendGet<BackendDoctorTemplate[]>('/api/doctor/templates');

  if (!result.ok) {
    log.error('[loadTemplateConfigs] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return {};
  }

  const templates = Array.isArray(result.value) ? result.value : [];
  const map: Record<string, TemplateConfigView> = {};
  for (const t of templates) {
    map[t.templateType] = toView(t);
  }
  return map;
}

/**
 * Upserts the template config for a single template type.
 * The backend creates the row if it does not exist; updates if it does.
 */
export async function saveTemplateConfig(
  templateType: string,
  input: UpsertTemplateInput,
): Promise<MutationResult> {
  const dto = toBackendDto(input);
  const result = await backendPut<BackendDoctorTemplate>(
    `/api/doctor/templates/${encodeURIComponent(templateType)}`,
    dto,
  );

  if (!result.ok) {
    log.error('[saveTemplateConfig] backend error', {
      code: result.error.code,
      status: result.error.status,
      templateType,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

/**
 * Applies the config of one template type to ALL other template types.
 * Sends one PUT per template type sequentially to avoid race conditions.
 * Returns first error encountered, or { ok: true } when all succeed.
 */
export async function applyTemplateConfigToAll(
  input: UpsertTemplateInput,
  allTemplateTypes: string[],
): Promise<MutationResult> {
  const dto = toBackendDto(input);

  for (const templateType of allTemplateTypes) {
    const result = await backendPut<BackendDoctorTemplate>(
      `/api/doctor/templates/${encodeURIComponent(templateType)}`,
      dto,
    );

    if (!result.ok) {
      log.error('[applyTemplateConfigToAll] backend error', {
        code: result.error.code,
        status: result.error.status,
        templateType,
      });
      return { ok: false, error: result.error.message };
    }
  }

  return { ok: true };
}
