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
  parseSupportHoursConfig,
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
 *      The slot is reserved atomically BEFORE dispatching the email to prevent
 *      the TOCTOU race where N concurrent POSTs all pass the check first.
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
    // 1. Validate call_now channel against support hours
    const supportHours = await this.loadSupportHours();
    if (input.channel === 'call_now' && !isWithinSupportHours(new Date(), supportHours)) {
      throw new CallNowOutsideSupportHoursError();
    }

    // 2. Upsert: create or update the pending row (must exist before rate-limit step)
    const saved = await this.upsertPending(input);

    // 3. Atomically reserve the notification slot.
    //    Counts ALL notifications for this doctor in the last 24 h (across every
    //    request row), then increments only if still below max.
    //    This eliminates the TOCTOU gap of the separate check+increment pattern.
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const slotReserved = await this.repo.reserveNotificationSlot(
      input.doctorId,
      since,
      new Date(),
      RATE_LIMIT_MAX,
    );
    if (!slotReserved) {
      throw new ContactRequestRateLimitedError();
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadSupportHours(): Promise<SupportHoursConfig> {
    const settings = await this.repo.getSettings(['support_hours']);
    const raw = new Map(settings.map((s) => [s.key, s.value])).get('support_hours');
    if (!raw) return DEFAULT_SUPPORT_HOURS;

    const parsed = parseSupportHoursConfig(raw);
    if (!parsed) {
      this.logger.warn(
        '[contact-requests] invalid support_hours config in settings — using defaults',
      );
      return DEFAULT_SUPPORT_HOURS;
    }
    return parsed;
  }

  private async upsertPending(input: RequestContactInput): Promise<ContactRequest> {
    const existing = await this.repo.findPendingByDoctorId(input.doctorId);

    if (existing) {
      const updated = await this.repo.updatePendingForDoctor(input.doctorId, {
        channel: input.channel,
        message: input.message ?? null,
      });
      return updated ?? existing;
    }

    try {
      return await this.repo.save({
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
    } catch (err: unknown) {
      // Race condition: another concurrent request already inserted the row
      const isUniqueViolation =
        err instanceof Error &&
        (err.name === 'SequelizeUniqueConstraintError' ||
          (err as { original?: { code?: string } }).original?.code === '23505');
      if (!isUniqueViolation) throw err;

      this.logger.warn(
        '[contact-requests] unique constraint race on insert — falling back to update',
      );
      const updated = await this.repo.updatePendingForDoctor(input.doctorId, {
        channel: input.channel,
        message: input.message ?? null,
      });
      if (!updated) throw err;
      return updated;
    }
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

    const vars = await this.buildTemplateVars(request, channel);
    const emails = admins.map((a) => a.email);

    await this.mailer.sendTemplate(TEMPLATE_NAME, emails, vars, { type: 'admin', id: null });

    this.logger.log(`[contact-requests] notification dispatched to ${admins.length} admin(s)`);
  }

  private async buildTemplateVars(
    request: ContactRequest,
    channel: ContactChannel,
  ): Promise<Record<string, string>> {
    const settingsData = await this.repo.getSettings(['support_whatsapp_number']);
    const whatsapp =
      new Map(settingsData.map((s) => [s.key, s.value])).get('support_whatsapp_number') ??
      DEFAULT_WHATSAPP;

    const appBaseUrl = (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'https://deltasalud.app'
    ).replace(/\/+$/, '');

    const reqWithDoctor = await this.repo.findByIdWithDoctor(request.id);
    if (!reqWithDoctor) {
      this.logger.warn(`[contact-requests] findByIdWithDoctor returned null for id=REDACTED`);
    }

    return {
      urgentPrefix: channel === 'call_now' ? 'URGENTE — ' : '',
      doctorName: reqWithDoctor?.doctorName ?? 'Especialista',
      doctorPlan: reqWithDoctor?.doctorPlan ?? 'N/A',
      doctorSpecialty: reqWithDoctor?.doctorSpecialty ?? 'N/A',
      doctorPhone: reqWithDoctor?.doctorPhone ?? 'No registrado',
      doctorEmail: reqWithDoctor?.doctorEmail ?? 'No registrado',
      channelLabel: CHANNEL_LABELS[channel],
      messageText: request.message ?? 'Sin mensaje',
      promise: CONTACT_PROMISE[channel],
      adminUrl: `${appBaseUrl}/admin/contact-requests`,
      whatsapp,
    };
  }
}
