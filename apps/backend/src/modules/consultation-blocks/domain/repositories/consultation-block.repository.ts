import type { ConsultationBlock } from '../entities/consultation-block.entity';

export const CONSULTATION_BLOCK_REPOSITORY = 'CONSULTATION_BLOCK_REPOSITORY';

// ── Raw catalog row (infrastructure-facing shape) ─────────────────────────

export interface CatalogRow {
  key: string;
  defaultLabel: string;
  defaultContentType: string;
  defaultPrintable: boolean;
  defaultSendToPatient: boolean;
  defaultEnabled: boolean;
  /**
   * Default display order for this block when no doctor or specialty override exists.
   * Set via migration 20260714000001 (range 0-15, fallback DB default = 99).
   */
  defaultSortOrder: number;
  /** Catalog-level description. Null when the catalog entry has no description. */
  description: string | null;
}

// ── Specialty default row ─────────────────────────────────────────────────

export interface SpecialtyDefaultRow {
  specialty: string;
  blockKey: string;
  enabled: boolean;
  sortOrder: number;
}

// ── Doctor override row ───────────────────────────────────────────────────

export interface DoctorBlockRow {
  doctorId: string;
  blockKey: string;
  enabled: boolean;
  sortOrder: number;
  customLabel: string | null;
  customContentType: string | null;
  customDescription: string | null;
  printable: boolean | null;
  sendToPatient: boolean | null;
}

// ── Params for saving (replace) a doctor's configuration ─────────────────

export interface SaveDoctorBlocksParams {
  doctorId: string;
  blocks: Array<{
    blockKey: string;
    enabled: boolean;
    sortOrder: number;
    customLabel: string | null;
    customContentType: string | null;
    customDescription: string | null;
    printable: boolean | null;
    sendToPatient: boolean | null;
  }>;
}

// ── Contract ──────────────────────────────────────────────────────────────

/**
 * Repository interface for the consultation blocks module.
 *
 * The application layer (use cases) depends only on this interface — never on
 * the Sequelize implementation, keeping the domain layer infrastructure-free.
 */
export interface IConsultationBlockRepository {
  /**
   * Returns all catalog entries ordered by key.
   */
  listCatalog(): Promise<CatalogRow[]>;

  /**
   * Returns a set of catalog keys as a Set for O(1) lookups.
   */
  getCatalogKeySet(): Promise<Set<string>>;

  /**
   * Returns specialty default blocks for a given specialty.
   * Returns an empty array when specialty is null/undefined.
   */
  listSpecialtyDefaults(specialty: string | null | undefined): Promise<SpecialtyDefaultRow[]>;

  /**
   * Returns the doctor's saved block overrides.
   */
  listDoctorBlocks(doctorId: string): Promise<DoctorBlockRow[]>;

  /**
   * Returns the doctor's specialty from profiles table.
   * Returns null when the profile is not found or has no specialty.
   */
  getDoctorSpecialty(doctorId: string): Promise<string | null>;

  /**
   * Returns the doctor's consultation_blocks_layout from profiles.
   * Falls back to 'tabs' when the profile is not found or the column is null.
   */
  getDoctorLayout(doctorId: string): Promise<'tabs' | 'vertical'>;

  /**
   * Persists the consultation_blocks_layout for the given doctor.
   */
  setDoctorLayout(doctorId: string, layout: 'tabs' | 'vertical'): Promise<void>;

  /**
   * Replaces the doctor's entire block configuration in a single transaction.
   * Executes DELETE WHERE doctor_id = ? then batch INSERT.
   * Returns the count of rows inserted.
   */
  replaceDoctorBlocks(params: SaveDoctorBlocksParams): Promise<number>;

  /**
   * Runs the merge algorithm to produce the final resolved block list.
   * Only enabled blocks are returned, sorted by sort_order ASC, key ASC.
   *
   * Cascade priority:
   *   1. doctor override  → if exists, use its values
   *   2. specialty default → if exists, use its enabled + sort_order
   *   3. catalog default  → default_enabled determines inclusion
   */
  resolveBlocks(
    doctorId: string,
    specialty: string | null | undefined,
  ): Promise<ConsultationBlock[]>;
}
