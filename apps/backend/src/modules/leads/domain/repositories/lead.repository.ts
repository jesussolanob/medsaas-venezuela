import type { Lead, LeadStage } from '../entities/lead.entity';

export const LEAD_REPOSITORY = 'LEAD_REPOSITORY';

export interface LeadListFilters {
  doctorId: string;
  stage?: LeadStage;
}

/**
 * Contract for lead persistence.
 *
 * The application layer depends only on this interface, never on the Sequelize
 * implementation, keeping the domain layer infrastructure-free.
 */
export interface ILeadRepository {
  /**
   * Returns all leads for a given doctorId, optionally filtered by stage.
   * Sorted by created_at DESC (most recent first).
   */
  list(filters: LeadListFilters): Promise<Lead[]>;

  /**
   * Finds a lead by ID scoped to doctorId.
   * Returns null when the ID does not exist or belongs to another doctor.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Lead | null>;

  /** Persists a new lead. Returns the saved entity. */
  create(lead: Lead): Promise<Lead>;

  /**
   * Partially updates an existing lead scoped to (id, doctorId).
   * Only the provided fields are written; others remain unchanged.
   */
  save(
    id: string,
    doctorId: string,
    fields: {
      name?: string;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      channel?: string | null;
      message?: string | null;
      stage?: LeadStage;
      lastActivity?: Date | null;
    },
  ): Promise<Lead>;

  /** Deletes a lead scoped to (id, doctorId). Throws LeadNotFoundError if not found. */
  delete(id: string, doctorId: string): Promise<void>;
}
