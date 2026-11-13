import { Inject, Injectable } from '@nestjs/common';
import {
  CONTACT_REQUEST_REPOSITORY,
  type IContactRequestRepository,
} from '../../domain/repositories/icontact-request.repository';
import type { ContactRequestStatus } from '../../domain/entities/contact-request.entity';
import { ContactRequestNotFoundError } from '../../domain/errors/contact-request-not-found.error';
import { InvalidContactRequestTransitionError } from '../../domain/errors/invalid-contact-request-transition.error';

export interface UpdateContactRequestInput {
  id: string;
  actorId: string;
  status?: ContactRequestStatus;
  notes?: string | null;
}

export interface UpdateContactRequestOutput {
  id: string;
  status: string;
  handledBy: string | null;
  handledAt: string | null;
  notes: string | null;
  updatedAt: string;
}

/**
 * Updates a contact request status and/or notes (admin only).
 *
 * Validates the status transition before persisting.
 * Sets handledBy and handledAt server-side when status changes.
 */
@Injectable()
export class UpdateContactRequestUseCase {
  constructor(
    @Inject(CONTACT_REQUEST_REPOSITORY)
    private readonly repo: IContactRequestRepository,
  ) {}

  async execute(input: UpdateContactRequestInput): Promise<UpdateContactRequestOutput> {
    const request = await this.repo.findById(input.id);
    if (!request) {
      throw new ContactRequestNotFoundError(input.id);
    }

    if (input.status && input.status !== request.status) {
      if (!request.canTransitionTo(input.status)) {
        throw new InvalidContactRequestTransitionError(request.status, input.status);
      }
    }

    const now = new Date();
    const params: Parameters<IContactRequestRepository['update']>[1] = {};

    if (input.status && input.status !== request.status) {
      params.status = input.status;
      params.handledBy = input.actorId;
      params.handledAt = now;
    }

    if ('notes' in input) {
      params.notes = input.notes ?? null;
    }

    const updated = await this.repo.update(input.id, params);

    return {
      id: updated.id,
      status: updated.status,
      handledBy: updated.handledBy,
      handledAt: updated.handledAt ? updated.handledAt.toISOString() : null,
      notes: updated.notes,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
