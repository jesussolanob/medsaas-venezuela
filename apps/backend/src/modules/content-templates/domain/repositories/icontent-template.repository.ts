import type { ContentTemplate, ContentTemplateType } from '../entities/content-template.entity';

export const CONTENT_TEMPLATE_REPOSITORY = 'CONTENT_TEMPLATE_REPOSITORY';

export interface ListContentTemplatesFilters {
  doctorId: string;
  type?: ContentTemplateType;
}

export interface CreateContentTemplateParams {
  doctorId: string;
  type: ContentTemplateType;
  name: string;
  content: Record<string, unknown>;
}

export interface UpdateContentTemplateParams {
  name?: string;
  content?: Record<string, unknown>;
}

export interface IContentTemplateRepository {
  /** Lists all templates for a doctor, optionally filtered by type. Ordered by name ASC. */
  list(filters: ListContentTemplatesFilters): Promise<ContentTemplate[]>;

  /**
   * Finds a template by ID. Returns null when ID does not exist.
   * Anti-IDOR: the caller must check canBeModifiedBy() on the returned entity.
   */
  findById(id: string): Promise<ContentTemplate | null>;

  /** Creates a new content template and returns the persisted entity. */
  create(params: CreateContentTemplateParams): Promise<ContentTemplate>;

  /**
   * Updates name and/or content on an existing template.
   * Returns the updated entity. Throws ContentTemplateNotFoundError
   * when not found (caller enforces ownership before calling update).
   */
  update(id: string, params: UpdateContentTemplateParams): Promise<ContentTemplate>;

  /**
   * Deletes a content template.
   * No-op if the ID does not exist (caller enforces ownership before deleting).
   */
  delete(id: string): Promise<void>;
}
