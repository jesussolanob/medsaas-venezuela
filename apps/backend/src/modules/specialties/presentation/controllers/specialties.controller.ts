import { Controller, Get } from '@nestjs/common';
import { ListActiveSpecialtiesUseCase } from '../../application/use-cases/list-active-specialties.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface SpecialtyPublicDto {
  id: string;
  name: string;
}

/**
 * SpecialtiesController — public endpoint.
 *
 * No auth required — used by the doctor registration selector and settings page.
 *
 * GET /api/specialties
 *   Returns active specialties ordered by sort_order ASC, name ASC.
 *   Response shape: { success: true, data: [{ id, name }] }
 */
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly listActive: ListActiveSpecialtiesUseCase) {}

  @Get()
  async list(): Promise<SuccessResponse<SpecialtyPublicDto[]>> {
    const specialties = await this.listActive.execute();
    return {
      success: true,
      data: specialties.map((s) => ({ id: s.id, name: s.name })),
    };
  }
}
