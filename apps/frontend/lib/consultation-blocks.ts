import 'server-only';

/**
 * lib/consultation-blocks.ts
 *
 * Resolución de los bloques de consulta activos para un doctor.
 * Sirve tanto al doctor (para pintar su UI de consulta) como al renderizador
 * de informes/PDFs/emails.
 *
 * ETAPA 1 — migrated from Supabase direct access.
 * Delegates to the NestJS consultation-blocks module via BFF.
 *
 * Backend endpoint:
 *   GET /api/doctor/consultation-blocks → {
 *     catalog, doctor_config, resolved, specialty_defaults, doctor_specialty
 *   }
 *
 * resolveBlocksForDoctor() calls GET /api/doctor/consultation-blocks and returns the
 * `resolved` field — the backend already applies the cascade logic (doctor > specialty > catalog).
 *
 * snapshotBlocksForConsultation() returns the same resolved blocks stripped of `value`
 * so they can be stored as a point-in-time snapshot in consultations.blocks_snapshot.
 *
 * NOTE: doctorId and specialty parameters are kept in the function signature for
 * backward compatibility, but in Etapa 1 the backend resolves the doctor identity
 * from the auth token (anti-IDOR). doctorId is unused here; specialty is also
 * resolved server-side from the doctor's profile.
 */

import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export type BlockContentType = 'rich_text' | 'list' | 'date' | 'file' | 'structured' | 'numeric';

export type ConsultationBlock = {
  key: string;
  label: string;
  content_type: BlockContentType;
  enabled: boolean;
  sort_order: number;
  printable: boolean;
  send_to_patient: boolean;
  /** Datos del bloque (contenido del doctor en la consulta). Opcional en resolución inicial. */
  value?: unknown;
};

export type ResolveArgs = {
  doctorId: string;
  specialty?: string | null;
};

/**
 * Shape of a resolved block AS THE BACKEND SERIALISES IT — camelCase.
 *
 * The domain type used across the frontend (`ConsultationBlock`) is snake_case,
 * so the two MUST be mapped explicitly. Declaring `resolved: ConsultationBlock[]`
 * directly made TypeScript trust an annotation that did not match the wire, so
 * `content_type` was silently `undefined` at runtime: every text block fell to the
 * default branch and rendered as a plain textarea instead of the rich-text editor,
 * and the frozen `blocks_snapshot` was persisted with undefined content types.
 */
interface ResolvedBlockWire {
  key: string;
  label: string;
  contentType: BlockContentType;
  enabled: boolean;
  sortOrder: number;
  printable: boolean;
  sendToPatient: boolean;
}

/** Backend response envelope for GET /api/doctor/consultation-blocks. */
interface BlocksApiResponse {
  catalog: unknown[];
  doctor_config: unknown[];
  resolved: ResolvedBlockWire[];
  specialty_defaults: unknown[];
  doctor_specialty: string | null;
}

/** Maps the backend's camelCase wire shape to the snake_case domain type. */
function toConsultationBlock(b: ResolvedBlockWire): ConsultationBlock {
  return {
    key: b.key,
    label: b.label,
    content_type: b.contentType,
    enabled: b.enabled,
    sort_order: b.sortOrder,
    printable: b.printable,
    send_to_patient: b.sendToPatient,
  };
}

/**
 * Resuelve el conjunto final de bloques para un doctor.
 * Retorna SOLO los bloques enabled=true, ordenados por sort_order.
 *
 * The backend applies the cascade: doctor config > specialty defaults > global catalog.
 * doctorId is kept in the signature for backward compat but is not forwarded — the
 * backend resolves the authenticated doctor from dev-auth headers (anti-IDOR).
 */
export async function resolveBlocksForDoctor(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { doctorId: _doctorId, specialty: _specialty }: ResolveArgs,
): Promise<ConsultationBlock[]> {
  const result = await backendGet<BlocksApiResponse>('/api/doctor/consultation-blocks');

  if (!result.ok) {
    log.error('[resolveBlocksForDoctor] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  const resolved = result.value.resolved;
  return Array.isArray(resolved) ? resolved.map(toConsultationBlock) : [];
}

/**
 * Congela la configuración actual en un snapshot JSON para guardarla en
 * consultations.blocks_snapshot. Así, cambios futuros en la config del doctor
 * no alteran consultas viejas.
 */
export async function snapshotBlocksForConsultation(
  doctorId: string,
  specialty?: string | null,
): Promise<Omit<ConsultationBlock, 'value'>[]> {
  const resolved = await resolveBlocksForDoctor({ doctorId, specialty });
  return resolved.map(
    (b): Omit<ConsultationBlock, 'value'> => ({
      key: b.key,
      label: b.label,
      content_type: b.content_type,
      enabled: b.enabled,
      sort_order: b.sort_order,
      printable: b.printable,
      send_to_patient: b.send_to_patient,
    }),
  );
}
