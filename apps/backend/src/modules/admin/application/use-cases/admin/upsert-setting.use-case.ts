import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type AppSetting,
} from '../../../domain/repositories/admin.repository';
import { SettingNotAllowedError } from '../../../domain/errors/setting-not-allowed.error';

/**
 * Protected keys that this use case refuses to overwrite.
 * Secrets managed by other infrastructure (encryption_key, jwt_secret, usdt_rate_raw
 * — the last one is owned by the finances module via Redis).
 */
const PROTECTED_KEYS = new Set(['encryption_key', 'jwt_secret', 'usdt_rate_raw']);

export interface UpsertSettingInput {
  key: string;
  value: string;
}

/**
 * Creates or updates a single key-value pair in app_settings.
 *
 * Throws SettingNotAllowedError when the key belongs to the protected set
 * (secrets or keys owned by another module).
 *
 * The caller is responsible for serialising non-string values (e.g. JSON.stringify)
 * before passing them here. Keeping this use case value-agnostic avoids coupling
 * it to specific setting schemas.
 */
@Injectable()
export class UpsertSettingUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: UpsertSettingInput): Promise<AppSetting> {
    if (PROTECTED_KEYS.has(input.key)) {
      throw new SettingNotAllowedError(input.key);
    }

    return this.adminRepo.upsertSetting(input.key, input.value);
  }
}
