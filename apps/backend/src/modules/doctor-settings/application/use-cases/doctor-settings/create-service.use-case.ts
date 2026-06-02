import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import { PricingPlan as PricingPlanEntity } from '../../../../packages/domain/entities/pricing-plan.entity';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';

export interface CreateServiceInput {
  name: string;
  priceUsd: number;
  durationMinutes?: number;
  sessionsCount?: number;
  description?: string | null;
  type?: 'plan' | 'service';
  showInBooking?: boolean;
}

@Injectable()
export class CreateServiceUseCase {
  constructor(
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(doctorId: string, input: CreateServiceInput): Promise<PricingPlan> {
    const now = new Date();
    const plan = PricingPlanEntity.create({
      id: randomUUID(),
      doctorId,
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
