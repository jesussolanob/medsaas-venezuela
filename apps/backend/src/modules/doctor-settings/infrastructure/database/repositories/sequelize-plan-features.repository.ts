import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import type {
  IPlanFeaturesRepository,
  PlanFeature,
} from '../../../domain/repositories/plan-features.repository';
import { PlanFeaturesModel } from '../models/plan-features.model';

@Injectable()
export class SequelizePlanFeaturesRepository implements IPlanFeaturesRepository {
  constructor(
    @InjectModel(PlanFeaturesModel)
    private readonly model: typeof PlanFeaturesModel,
  ) {}

  async findByPlan(plan: string): Promise<PlanFeature[]> {
    const rows = await this.model.findAll({
      where: { plan } as WhereOptions,
      order: [['feature_key', 'ASC']],
    });
    return rows.map((r) => ({
      featureKey: r.featureKey,
      featureLabel: r.featureLabel,
      enabled: r.enabled,
    }));
  }
}
