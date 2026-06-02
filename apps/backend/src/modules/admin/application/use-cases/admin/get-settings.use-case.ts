import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type AppSetting,
} from '../../../domain/repositories/admin.repository';

/**
 * Returns application-wide settings from app_settings, excluding sensitive keys.
 *
 * Secrets such as encryption_key and jwt_secret are filtered out by the
 * repository implementation (HIDDEN_SETTING_KEYS constant). This use case
 * only deals with non-sensitive configuration values.
 */
@Injectable()
export class GetSettingsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(): Promise<AppSetting[]> {
    return this.adminRepo.getSettings();
  }
}
