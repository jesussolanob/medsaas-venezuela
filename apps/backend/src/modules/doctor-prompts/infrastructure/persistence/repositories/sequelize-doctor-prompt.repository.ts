import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'crypto';
import { DoctorPrompt } from '../../../domain/entities/doctor-prompt.entity';
import type {
  IDoctorPromptRepository,
  AppSettingRow,
} from '../../../domain/repositories/idoctor-prompt.repository';
import { DoctorPromptModel } from '../models/doctor-prompt.model';

/**
 * Sequelize implementation of IDoctorPromptRepository.
 *
 * Raw SQL rules:
 *   - Use IN (:ids) style replacements — NEVER = ANY(:ids).
 *   - No PII in logs.
 *
 * IMPORTANT: Sequelize is provided globally in AppModule.
 * Never add it to module providers.
 */
@Injectable()
export class SequelizeDoctorPromptRepository implements IDoctorPromptRepository {
  constructor(
    @InjectModel(DoctorPromptModel)
    private readonly model: typeof DoctorPromptModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findByDoctorAndKey(doctorId: string, promptKey: string): Promise<DoctorPrompt | null> {
    const row = await this.model.findOne({ where: { doctorId, promptKey } });
    if (!row) return null;
    return this.toDomain(row);
  }

  async recordShown(doctorId: string, promptKey: string, now: Date): Promise<DoctorPrompt> {
    const existing = await this.model.findOne({ where: { doctorId, promptKey } });

    if (existing) {
      await existing.update({
        shownCount: existing.shownCount + 1,
        firstShownAt: existing.firstShownAt ?? now,
        lastShownAt: now,
        updatedAt: now,
      });
      return this.toDomain(existing);
    }

    const row = await this.model.create({
      id: randomUUID(),
      doctorId,
      promptKey,
      shownCount: 1,
      firstShownAt: now,
      lastShownAt: now,
    });

    return this.toDomain(row);
  }

  async recordSnooze(
    doctorId: string,
    promptKey: string,
    snoozedUntil: Date,
    now: Date,
  ): Promise<DoctorPrompt> {
    const existing = await this.model.findOne({ where: { doctorId, promptKey } });

    if (existing) {
      await existing.update({ snoozedUntil, updatedAt: now });
      return this.toDomain(existing);
    }

    const row = await this.model.create({
      id: randomUUID(),
      doctorId,
      promptKey,
      shownCount: 0,
      snoozedUntil,
    });

    return this.toDomain(row);
  }

  async recordDismiss(doctorId: string, promptKey: string, now: Date): Promise<DoctorPrompt> {
    const existing = await this.model.findOne({ where: { doctorId, promptKey } });

    if (existing) {
      await existing.update({ dismissedAt: now, updatedAt: now });
      return this.toDomain(existing);
    }

    const row = await this.model.create({
      id: randomUUID(),
      doctorId,
      promptKey,
      shownCount: 0,
      dismissedAt: now,
    });

    return this.toDomain(row);
  }

  async recordActed(doctorId: string, promptKey: string, now: Date): Promise<void> {
    const existing = await this.model.findOne({ where: { doctorId, promptKey } });

    if (existing) {
      await existing.update({ actedAt: now, updatedAt: now });
    } else {
      await this.model.create({
        id: randomUUID(),
        doctorId,
        promptKey,
        shownCount: 0,
        actedAt: now,
      });
    }
  }

  async clearActed(doctorId: string, promptKey: string): Promise<void> {
    await this.model.update({ actedAt: null }, { where: { doctorId, promptKey } });
  }

  async hasPhase4EmailPrompt(doctorId: string): Promise<boolean> {
    const count = await this.model.count({
      where: {
        doctorId,
        promptKey: ['email:meeting_invite_pre', 'email:meeting_invite_expired'],
      },
    });
    return count > 0;
  }

  async getSettings(keys: string[]): Promise<AppSettingRow[]> {
    if (keys.length === 0) return [];

    const rows = await this.sequelize.query<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings WHERE key IN (:keys)`,
      {
        type: QueryTypes.SELECT,
        replacements: { keys },
      },
    );

    return rows.map((r) => ({ key: r.key, value: r.value }));
  }

  async getDoctorCreatedAt(doctorId: string): Promise<Date | null> {
    const rows = await this.sequelize.query<{ created_at: Date }>(
      `SELECT created_at FROM profiles WHERE id = :doctorId LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId },
      },
    );

    return rows[0]?.created_at ?? null;
  }

  async hasPendingContactRequest(doctorId: string): Promise<boolean> {
    const rows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
         FROM contact_requests
        WHERE doctor_id = :doctorId
          AND status = 'pending'
        LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId },
      },
    );

    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  }

  async hasScheduledOrDoneTeamMeeting(doctorId: string): Promise<boolean> {
    const rows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
         FROM team_meetings
        WHERE doctor_id = :doctorId
          AND status IN ('scheduled', 'done')
        LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId },
      },
    );

    return parseInt(rows[0]?.cnt ?? '0', 10) > 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: DoctorPromptModel): DoctorPrompt {
    return DoctorPrompt.create({
      id: row.id,
      doctorId: row.doctorId,
      promptKey: row.promptKey,
      shownCount: row.shownCount,
      firstShownAt: row.firstShownAt,
      lastShownAt: row.lastShownAt,
      actedAt: row.actedAt,
      snoozedUntil: row.snoozedUntil,
      dismissedAt: row.dismissedAt,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
