import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  CONTACT_REQUEST_REPOSITORY,
  type IContactRequestRepository,
} from '../../domain/repositories/icontact-request.repository';
import type { ContactRequest, ContactChannel } from '../../domain/entities/contact-request.entity';
import {
  isWithinSupportHours,
  type SupportHoursConfig,
  DEFAULT_SUPPORT_HOURS,
} from '../../domain/value-objects/support-hours.vo';
import { CallNowOutsideSupportHoursError } from '../../domain/errors/call-now-outside-support-hours.error';
import { ContactRequestRateLimitedError } from '../../domain/errors/contact-request-rate-limited.error';
import { MailerService } from '../../../email/application/services/mailer.service';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const TEMPLATE_NAME = 'support_contact_request';
const DEFAULT_WHATSAPP = '584221033582';

export interface RequestContactInput {
  doctorId: string;
  channel: ContactChannel;
  message?: string | null;
}

export interface ContactRequestOutput {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  call_now: 'Llámame ya',
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  email: 'Correo electrónico',
};

const CONTACT_PROMISE: Record<ContactChannel, string> = {
  call_now: 'Llamar en los próximos 15 minutos',
  whatsapp: 'Responder en menos de 1 hora',
  call: 'Responder en menos de 1 hora',
  email: 'Responder en menos de 1 hora',
};

/**
 * Records a contact request from a specialist.
 *
 * Business rules:
 *   1. call_now is rejected outside support hours (server-side, Caracas time).
 *   2. If the doctor already has a pending request, UPDATE it (no duplicate).
 *   3. Rate limit: at most 3 team notifications per doctor in the last 24 h.
 *   4. Notify ALL super_admin profiles by email (fire-and-forget; never blocks).
 *   5. Email failure must NOT fail the request (logged as warning, not thrown).
 *   6. NEVER log PII.
 */
@Injectable()
export class RequestContactUseCase {
  private readonly logger = new Logger(RequestContactUseCase.name);

  constructor(
    @Inject(CONTACT_REQUEST_REPOSITORY)
    private readonly repo: IContactRequestRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: RequestContactInput): Promise<ContactRequestOutput> {
    // 1. Load support hours to validate call_now channel
    const settings = await this.repo.getSettings(['support_hours']);
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

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
        // Fall through to defaults
      }
    }

    if (input.channel === 'call_now' && !isWithinSupportHours(new Date(), supportHours)) {
      throw new CallNowOutsideSupportHoursError();
    }

    // 2. Check rate limit: at most 3 notifications sent in the last 24 h
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const notifCount = await this.repo.getNotificationCountSince(input.doctorId, since);
    if (notifCount >= RATE_LIMIT_MAX) {
      throw new ContactRequestRateLimitedError();
    }

    // 3. Upsert: update existing pending request, or create a new one
    let saved: ContactRequest;
    const existing = await this.repo.findPendingByDoctorId(input.doctorId);

    if (existing) {
      const updated = await this.repo.updatePendingForDoctor(input.doctorId, {
        channel: input.channel,
        message: input.message ?? null,
      });
      saved = updated ?? existing;
    } else {
      saved = await this.repo.save({
        id: randomUUID(),
        doctorId: input.doctorId,
        channel: input.channel,
        message: input.message ?? null,
        status: 'pending',
        handledBy: null,
        handledAt: null,
        notes: null,
        notificationCount: 0,
        lastNotifiedAt: null,
      });
    }

    // 4. Notify super_admins — fire-and-forget (never blocks the response)
    this.sendAdminNotification(saved, input.channel).catch((err: unknown) => {
      this.logger.warn(
        `[contact-requests] failed to notify admins for doctorId=REDACTED: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      id: saved.id,
      channel: saved.channel,
      status: saved.status,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  private async sendAdminNotification(
    request: ContactRequest,
    channel: ContactChannel,
  ): Promise<void> {
    const admins = await this.repo.findAllSuperAdmins();
    if (admins.length === 0) {
      this.logger.warn('[contact-requests] no super_admin profiles found — skipping notification');
      return;
    }

    // Fetch doctor profile info for template variables (re-using settings lookup)
    const settingsData = await this.repo.getSettings(['support_whatsapp_number']);
    const settingsMap = new Map(settingsData.map((s) => [s.key, s.value]));
    const whatsapp = settingsMap.get('support_whatsapp_number') ?? DEFAULT_WHATSAPP;

    const appBaseUrl = (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'https://deltasalud.app'
    ).replace(/\/+$/, '');

    const adminUrl = `${appBaseUrl}/admin/contact-requests`;
    const isUrgent = channel === 'call_now';

    const emails = admins.map((a) => a.email);

    // Get doctor info from the contact_requests join — we already have the doctorId
    // but we need name/phone/plan for the template. Query the joined data:
    const listResult = await this.repo.listWithDoctor({
      limit: 1,
      offset: 0,
    });

    // Find the specific request
    const reqWithDoctor = listResult.items.find((i) => i.id === request.id);

    const doctorName = reqWithDoctor?.doctorName ?? 'Especialista';
    const doctorPlan = reqWithDoctor?.doctorPlan ?? 'N/A';
    const doctorSpecialty = reqWithDoctor?.doctorSpecialty ?? 'N/A';
    const doctorPhone = reqWithDoctor?.doctorPhone ?? 'No registrado';
    const doctorEmail = reqWithDoctor?.doctorEmail ?? 'No registrado';
    const channelLabel = CHANNEL_LABELS[channel];
    const promise = CONTACT_PROMISE[channel];
    const messageText = request.message ?? 'Sin mensaje';

    await this.mailer.sendTemplate(
      TEMPLATE_NAME,
      emails,
      {
        urgentPrefix: isUrgent ? 'URGENTE — ' : '',
        doctorName,
        doctorPlan,
        doctorSpecialty,
        doctorPhone,
        doctorEmail: doctorEmail,
        channelLabel,
        messageText,
        promise,
        adminUrl,
        whatsapp,
      },
      { type: 'admin', id: null },
    );

    // 5. Increment notification count (best-effort — never block on failure)
    await this.repo
      .incrementNotificationCount(request.doctorId, new Date())
      .catch((err: unknown) => {
        this.logger.warn(
          `[contact-requests] failed to increment notification count: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    this.logger.log(`[contact-requests] notification dispatched to ${admins.length} admin(s)`);
  }
}
