import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONTACT_REQUEST_REPOSITORY,
  type IContactRequestRepository,
} from '../../domain/repositories/icontact-request.repository';
import {
  isWithinSupportHours,
  parseSupportHoursConfig,
  type SupportHoursConfig,
  DEFAULT_SUPPORT_HOURS,
} from '../../domain/value-objects/support-hours.vo';

const DEFAULT_WHATSAPP = '584221033582';

export interface SupportInfoOutput {
  whatsapp: string;
  callNowAvailable: boolean;
  supportHours: {
    days: number[];
    start: string;
    end: string;
    timezone: string;
  };
}

/**
 * Returns support contact info and whether call_now is currently available.
 *
 * Reads support_whatsapp_number and support_hours from app_settings.
 * Falls back to hardcoded defaults when settings are absent or invalid.
 *
 * The callNowAvailable flag is evaluated server-side in America/Caracas time
 * so the client never has to trust its own clock or timezone.
 */
@Injectable()
export class GetSupportInfoUseCase {
  private readonly logger = new Logger(GetSupportInfoUseCase.name);

  constructor(
    @Inject(CONTACT_REQUEST_REPOSITORY)
    private readonly repo: IContactRequestRepository,
  ) {}

  async execute(): Promise<SupportInfoOutput> {
    const settings = await this.repo.getSettings(['support_whatsapp_number', 'support_hours']);
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const whatsapp = settingsMap.get('support_whatsapp_number') ?? DEFAULT_WHATSAPP;

    const supportHours = this.parseSupportHours(settingsMap.get('support_hours'));
    const callNowAvailable = isWithinSupportHours(new Date(), supportHours);

    return {
      whatsapp,
      callNowAvailable,
      supportHours: {
        days: supportHours.days,
        start: supportHours.start,
        end: supportHours.end,
        timezone: supportHours.timezone,
      },
    };
  }

  private parseSupportHours(raw: string | undefined): SupportHoursConfig {
    if (!raw) return DEFAULT_SUPPORT_HOURS;

    const parsed = parseSupportHoursConfig(raw);
    if (!parsed) {
      this.logger.warn('[contact-requests] invalid support_hours in settings — using defaults');
      return DEFAULT_SUPPORT_HOURS;
    }
    return parsed;
  }
}
