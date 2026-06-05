import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { USDT_RATE_STORE, type IUsdtRateStore } from '../../../../finances/domain/repositories/usdt-rate.store';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import type { DoctorExchangeRateOutput } from './get-doctor-exchange-rate.use-case';

export interface SetDoctorExchangeRateInput {
  mode: string;
  customRate: number | null;
  customRateLabel: string | null;
}

/**
 * Persists the doctor's exchange-rate preference and returns the effective rate.
 *
 * When mode is 'custom': stores customRate + customRateLabel in profiles.
 * When mode is 'usd_bcv' or 'eur_bcv': clears custom fields and uses the global rate.
 */
@Injectable()
export class SetDoctorExchangeRateUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(
    doctorId: string,
    input: SetDoctorExchangeRateInput,
  ): Promise<DoctorExchangeRateOutput> {
    const existing = await this.profileRepo.findByDoctorId(doctorId);
    if (!existing) throw new DoctorProfileNotFoundError(doctorId);

    const updated = await this.profileRepo.updateExchangeRate(doctorId, {
      currencyMode: input.mode,
      customRate: input.mode === 'custom' ? input.customRate : null,
      customRateLabel: input.mode === 'custom' ? input.customRateLabel : null,
    });

    if (input.mode === 'custom' && updated.customRate != null && updated.customRate > 0) {
      return {
        mode: 'custom',
        rate: updated.customRate,
        label: updated.customRateLabel ?? 'Tasa personalizada',
        customRate: updated.customRate,
        customRateLabel: updated.customRateLabel,
      };
    }

    const globalRate = await this.rateStore.getRate();
    const label =
      input.mode === 'eur_bcv' ? 'EUR → BsS (BCV oficial)' : 'USD → BsS (BCV oficial)';

    return {
      mode: input.mode,
      rate: globalRate,
      label,
      customRate: updated.customRate,
      customRateLabel: updated.customRateLabel,
    };
  }
}
