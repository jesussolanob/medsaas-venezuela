import { Inject, Injectable } from '@nestjs/common';
import type { ListContactRequestsQuery } from '@delta/shared-types';
import {
  CONTACT_REQUEST_REPOSITORY,
  type IContactRequestRepository,
  type ContactRequestWithDoctor,
} from '../../domain/repositories/icontact-request.repository';

export interface ContactRequestAdminItem {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  doctorPhone: string | null;
  doctorPlan: string;
  doctorSpecialty: string | null;
  channel: string;
  message: string | null;
  status: string;
  handledBy: string | null;
  handledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListContactRequestsResult {
  items: ContactRequestAdminItem[];
  total: number;
}

/**
 * Lists contact requests with doctor profile data for the admin panel.
 */
@Injectable()
export class ListContactRequestsUseCase {
  constructor(
    @Inject(CONTACT_REQUEST_REPOSITORY)
    private readonly repo: IContactRequestRepository,
  ) {}

  async execute(query: ListContactRequestsQuery): Promise<ListContactRequestsResult> {
    const result = await this.repo.listWithDoctor({
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: result.items.map((item) => this.toItem(item)),
      total: result.total,
    };
  }

  private toItem(item: ContactRequestWithDoctor): ContactRequestAdminItem {
    return {
      id: item.id,
      doctorId: item.doctorId,
      doctorName: item.doctorName,
      doctorEmail: item.doctorEmail,
      doctorPhone: item.doctorPhone,
      doctorPlan: item.doctorPlan,
      doctorSpecialty: item.doctorSpecialty,
      channel: item.channel,
      message: item.message,
      status: item.status,
      handledBy: item.handledBy,
      handledAt: item.handledAt ? item.handledAt.toISOString() : null,
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
