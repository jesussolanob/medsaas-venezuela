import type { ActionEvent } from '../entities/action-event.entity';

export const ACTION_EVENT_REPOSITORY = Symbol('IActionEventRepository');

export interface ActionEventQueryFilters {
  doctorId: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface ActionEventListResult {
  items: ActionEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface IActionEventRepository {
  /**
   * Persist a batch of ActionEvent records in a single statement.
   * Returns the persisted entities.
   */
  bulkInsert(events: ActionEvent[]): Promise<ActionEvent[]>;

  /**
   * Paginated query scoped to a single doctor, with optional date range.
   * Used by the admin analytics endpoint — never exposes PII.
   */
  findByDoctor(filters: ActionEventQueryFilters): Promise<ActionEventListResult>;
}
