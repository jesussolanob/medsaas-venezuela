import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { PricingPlan } from '../../../domain/entities/pricing-plan.entity';
import type {
  IPricingPlanRepository,
  PricingPlanUpdateParams,
  FindPlansByDoctorOptions,
} from '../../../domain/repositories/pricing-plan.repository';
import { PricingPlanNotFoundError } from '../../../domain/errors/pricing-plan-not-found.error';
import { PricingPlanModel } from '../models/pricing-plan.model';

@Injectable()
export class SequelizePricingPlanRepository implements IPricingPlanRepository {
  constructor(
    @InjectModel(PricingPlanModel)
    private readonly planModel: typeof PricingPlanModel,
  ) {}

  async findPublicByDoctorId(doctorId: string): Promise<PricingPlan[]> {
    const rows = await this.planModel.findAll({
      where: { doctorId, showInBooking: true, isActive: true } as WhereOptions,
      order: [['name', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findAllByDoctorId(
    doctorId: string,
    options?: FindPlansByDoctorOptions,
  ): Promise<PricingPlan[]> {
    let where: WhereOptions;

    if (options?.officeId !== undefined) {
      // Return plans for the specific office + general plans (officeId=null).
      where = {
        doctorId,
        [Op.or]: [{ officeId: options.officeId }, { officeId: null }],
      } as WhereOptions;
    } else {
      where = { doctorId } as WhereOptions;
    }

    const rows = await this.planModel.findAll({
      where,
      order: [['name', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<PricingPlan | null> {
    const row = await this.planModel.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async save(plan: PricingPlan): Promise<PricingPlan> {
    const row = await this.planModel.create({
      id: plan.id,
      doctorId: plan.doctorId,
      officeId: plan.officeId ?? null,
      name: plan.name,
      priceUsd: plan.priceUsd,
      durationMinutes: plan.durationMinutes,
      sessionsCount: plan.sessionsCount,
      description: plan.description,
      type: plan.type,
      showInBooking: plan.showInBooking,
      isActive: plan.isActive,
    });
    return this.toDomain(row);
  }

  async update(id: string, params: PricingPlanUpdateParams): Promise<PricingPlan> {
    const row = await this.planModel.findByPk(id);
    if (!row) throw new PricingPlanNotFoundError(id);

    await row.update({
      ...(params.name !== undefined && { name: params.name }),
      ...(params.priceUsd !== undefined && { priceUsd: params.priceUsd }),
      ...(params.durationMinutes !== undefined && { durationMinutes: params.durationMinutes }),
      ...(params.sessionsCount !== undefined && { sessionsCount: params.sessionsCount }),
      ...(params.description !== undefined && { description: params.description }),
      ...(params.type !== undefined && { type: params.type }),
      ...(params.showInBooking !== undefined && { showInBooking: params.showInBooking }),
      ...(params.isActive !== undefined && { isActive: params.isActive }),
      // officeId explicitly included (supports setting to null to make it general)
      ...('officeId' in params && { officeId: params.officeId ?? null }),
    });

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.planModel.destroy({ where: { id } as WhereOptions });
  }

  private toDomain(row: PricingPlanModel): PricingPlan {
    return PricingPlan.create({
      id: row.id,
      doctorId: row.doctorId,
      officeId: row.officeId ?? null,
      name: row.name,
      priceUsd: Number(row.priceUsd),
      durationMinutes: row.durationMinutes,
      sessionsCount: row.sessionsCount,
      description: row.description,
      type: row.type,
      showInBooking: row.showInBooking,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
