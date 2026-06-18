/**
 * DTOs for the AI text use case (POST /api/ai/text).
 *
 * Three actions are supported:
 *   - improve_block   → requires content, block_key, block_label
 *   - summarize_report → requires legacy + blocks_data + blocks_meta
 *   - patient_history  → requires patientId
 *
 * The action determines which fields are required. The controller validates
 * the body shape and passes a typed input DTO to the use case.
 */

// ---------------------------------------------------------------------------
// Shared output
// ---------------------------------------------------------------------------

export interface AiTextOutputDto {
  result: string;
}

// ---------------------------------------------------------------------------
// Action-specific input shapes (discriminated union)
// ---------------------------------------------------------------------------

export interface ImproveBlockInput {
  action: 'improve_block';
  content: string;
  block_key: string;
  block_label: string;
}

export interface SummarizeReportLegacy {
  chief_complaint?: string | null;
  notes?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
}

export interface BlockMeta {
  key: string;
  label: string;
  printable?: boolean;
}

export interface SummarizeReportInput {
  action: 'summarize_report';
  legacy: SummarizeReportLegacy;
  blocks_data: Record<string, unknown>;
  blocks_meta: BlockMeta[];
}

export interface PatientHistoryInput {
  action: 'patient_history';
  patientId: string;
}

export type AiTextActionInput = ImproveBlockInput | SummarizeReportInput | PatientHistoryInput;

// ---------------------------------------------------------------------------
// Use-case input DTO (enriched by the controller from auth context)
// ---------------------------------------------------------------------------

export interface AiTextInputDto {
  /** The validated action payload from the request body. */
  actionInput: AiTextActionInput;
  /** Authenticated doctor ID — always from auth context, never from body. */
  doctorId: string;
  /** Whether the actor is super_admin (bypasses plan gate). */
  isSuperAdmin: boolean;
}
