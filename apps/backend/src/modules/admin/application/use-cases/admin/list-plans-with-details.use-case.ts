import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PlanDetail,
} from '../../../domain/repositories/admin.repository';

@Injectable()
export class ListPlansWithDetailsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(): Promise<PlanDetail[]> {
    return this.adminRepo.listPlansWithDetails();
  }
}
