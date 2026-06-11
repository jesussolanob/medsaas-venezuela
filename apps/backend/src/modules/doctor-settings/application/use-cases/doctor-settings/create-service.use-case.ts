import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import { PricingPlan as PricingPlanEntity } from '../../../../packages/domain/entities/pricing-plan.entity';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import { OfficeNotOwnedError } from '../../../domain/errors/office-not-owned.error';

export interface CreateServiceInput {
  name: string;
  priceUsd: number;
  durationMinutes?: number;
  sessionsCount?: number;
  description?: string | null;
  type?: 'plan' | 'service';
  showInBooking?: boolean;
  /** Optional FK → doctor_offices(id). null = general plan (all offices). */
  officeId?: string | null;
}

@Injectable()
export class CreateServiceUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(doctorId: string, input: CreateServiceInput): Promise<PricingPlan> {
    // Validate office ownership when an office_id is provided
    const officeId = input.officeId ?? null;
    if (officeId !== null) {
      const office = await this.officeRepo.findByIdForDoctor(officeId, doctorId);
      if (!office) throw new OfficeNotOwnedError();
    }

    const now = new Date();
    const plan = PricingPlanEntity.create({
      id: randomUUID(),
      doctorId,
      officeId,
      name: input.name,
      priceUsd: input.priceUsd,
      durationMinutes: input.durationMinutes ?? 30,
      sessionsCount: input.sessionsCount ?? 1,
      description: input.description ?? null,
      type: input.type ?? 'plan',
      showInBooking: input.showInBooking ?? true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return this.pricingPlanRepo.save(plan);
  }
}
