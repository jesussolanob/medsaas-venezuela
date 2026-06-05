import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { USDT_RATE_STORE, type IUsdtRateStore } from '../../../../finances/domain/repositories/usdt-rate.store';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';

export interface DoctorExchangeRateOutput {
  /** 'usd_bcv' | 'eur_bcv' | 'custom' */
  mode: string;
  /**
   * Effective rate in Bs per 1 USD/EUR unit.
   * Null when mode is 'usd_bcv'/'eur_bcv' and no global rate is configured.
   */
  rate: number | null;
  /** Human-readable label for the rate source. */
  label: string;
  /** Custom rate value (only present when mode='custom'). */
  customRate: number | null;
  /** Custom rate label (only present when mode='custom'). */
  customRateLabel: string | null;
}

/**
 * Returns the doctor's effective exchange rate.
 *
 * Resolution order:
 *   1. If mode='custom' and customRate>0 → return customRate
 *   2. If mode='usd_bcv' or 'eur_bcv' → return global USDT/BS rate from Redis/app_settings
 *      (the admin-configured rate; EUR support is informational — same store for now)
 *   3. Fallback: null rate with mode label
 */
@Injectable()
export class GetDoctorExchangeRateUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(doctorId: string): Promise<DoctorExchangeRateOutput> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) throw new DoctorProfileNotFoundError(doctorId);

    const mode = profile.currencyMode ?? 'usd_bcv';

    if (mode === 'custom' && profile.customRate != null && profile.customRate > 0) {
      return {
        mode: 'custom',
        rate: profile.customRate,
        label: profile.customRateLabel ?? 'Tasa personalizada',
        customRate: profile.customRate,
        customRateLabel: profile.customRateLabel,
      };
    }

    // For usd_bcv / eur_bcv: use the global admin rate (best-effort).
    const globalRate = await this.rateStore.getRate();

    const label =
      mode === 'eur_bcv' ? 'EUR → BsS (BCV oficial)' : 'USD → BsS (BCV oficial)';

    return {
      mode,
      rate: globalRate,
      label,
      customRate: profile.customRate,
      customRateLabel: profile.customRateLabel,
    };
  }
}
