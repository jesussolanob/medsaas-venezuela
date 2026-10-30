import { Inject, Injectable } from '@nestjs/common';
import {
  CONTACT_REQUEST_REPOSITORY,
  type IContactRequestRepository,
} from '../../domain/repositories/icontact-request.repository';
import {
  isWithinSupportHours,
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
 * Falls back to hardcoded defaults when settings are absent.
 *
 * The callNowAvailable flag is evaluated server-side in America/Caracas time
 * so the client never has to trust its own clock or timezone.
 */
@Injectable()
export class GetSupportInfoUseCase {
  constructor(
    @Inject(CONTACT_REQUEST_REPOSITORY)
    private readonly repo: IContactRequestRepository,
  ) {}

  async execute(): Promise<SupportInfoOutput> {
    const settings = await this.repo.getSettings(['support_whatsapp_number', 'support_hours']);

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const whatsapp = settingsMap.get('support_whatsapp_number') ?? DEFAULT_WHATSAPP;

    let supportHours: SupportHoursConfig = DEFAULT_SUPPORT_HOURS;
    const hoursRaw = settingsMap.get('support_hours');
    if (hoursRaw) {
      try {
        const parsed = JSON.parse(hoursRaw) as unknown;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'days' in parsed &&
          'start' in parsed &&
          'end' in parsed &&
          'timezone' in parsed
        ) {
          supportHours = parsed as SupportHoursConfig;
        }
      } catch {
        // Malformed JSON — fall through to defaults
      }
    }

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
}
