import { Inject, Injectable } from '@nestjs/common';
import {
  ACTION_EVENT_REPOSITORY,
  type IActionEventRepository,
  type ActionEventListResult,
} from '../../../domain/repositories/action-event.repository';
import type { QueryDoctorEventsDto } from '@delta/shared-types';

/**
 * QueryDoctorEventsUseCase
 *
 * Returns a paginated list of ActionEvents for a given doctor.
 * Intended for admin analytics and support — requires super_admin role
 * (enforced at the controller level via @Roles('super_admin')).
 *
 * No PII masking is needed: ActionEvents must not contain PII by design.
 */
@Injectable()
export class QueryDoctorEventsUseCase {
  constructor(
    @Inject(ACTION_EVENT_REPOSITORY)
    private readonly repo: IActionEventRepository,
  ) {}

  async execute(dto: QueryDoctorEventsDto): Promise<ActionEventListResult> {
    return this.repo.findByDoctor({
      doctorId: dto.doctorId,
      from: dto.from !== undefined ? new Date(dto.from) : undefined,
      to: dto.to !== undefined ? new Date(dto.to) : undefined,
      limit: dto.limit,
      offset: dto.offset,
    });
  }
}
