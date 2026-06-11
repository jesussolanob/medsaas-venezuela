import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  IPlanConfigRepository,
  PlanConfigSummary,
} from '../../../domain/repositories/plan-config.repository';
import { PlanConfigDoctorModel } from '../models/plan-config-doctor.model';

@Injectable()
export class SequelizePlanConfigRepository implements IPlanConfigRepository {
  constructor(
    @InjectModel(PlanConfigDoctorModel)
    private readonly model: typeof PlanConfigDoctorModel,
  ) {}

  async findByKey(planKey: string): Promise<PlanConfigSummary | null> {
    const row = await this.model.findOne({ where: { planKey } });
    if (!row) return null;
    return this.toSummary(row);
  }

  async findPermanentPlanForRole(roleKey: string): Promise<PlanConfigSummary | null> {
    const row = await this.model.findOne({
      where: { roleKey, isPermanent: true, isActive: true },
      order: [['sort_order', 'ASC']],
    });
    if (!row) return null;
    return this.toSummary(row);
  }

  private toSummary(row: PlanConfigDoctorModel): PlanConfigSummary {
    return {
      planKey: row.planKey,
      roleKey: row.roleKey,
      isPermanent: row.isPermanent,
      isActive: row.isActive,
    };
  }
}
