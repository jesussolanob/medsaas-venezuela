import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import type { SubscriptionInfoParams } from '../../../domain/value-objects/subscription-info.vo';
import type { ISubscriptionRepository } from '../../../domain/repositories/subscription.repository';
import { SubscriptionModel } from '../models/subscription.model';

@Injectable()
export class SequelizeSubscriptionRepository implements ISubscriptionRepository {
  constructor(
    @InjectModel(SubscriptionModel)
    private readonly model: typeof SubscriptionModel,
  ) {}

  async findByDoctorId(doctorId: string): Promise<SubscriptionInfoParams | null> {
    const row = await this.model.findOne({
      where: { doctorId } as WhereOptions,
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  private toDomain(row: SubscriptionModel): SubscriptionInfoParams {
    const status = row.status as SubscriptionInfoParams['status'];
    return {
      status,
      plan: row.plan,
      // currentPeriodEnd is declared NOT NULL in schema but trials may arrive
      // without a meaningful end date from older data; guard defensively.
      expiresAt: row.currentPeriodEnd ?? null,
    };
  }
}
