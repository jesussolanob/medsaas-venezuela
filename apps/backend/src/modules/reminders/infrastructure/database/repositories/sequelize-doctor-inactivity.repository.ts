import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  IDoctorInactivityRepository,
  InactiveDoctorCandidate,
} from '../../../domain/repositories/doctor-inactivity.repository';

interface CandidateRow {
  doctor_id: string;
  email: string;
  full_name: string | null;
  last_sign_in_at: Date;
  inactivity_notice_stage: number;
}

/**
 * Sequelize implementation of IDoctorInactivityRepository.
 *
 * Uses raw SQL exclusively (no model class registration) — same pattern as
 * SequelizeLoginTouchRepository — to avoid any Sequelize registry collision
 * with AdminModule / DoctorSettingsModule models mapped to `profiles`.
 *
 * The Sequelize instance is injected globally (registered in AppModule via
 * SequelizeModule.forRootAsync) — NOT added to providers[] in RemindersModule.
 */
@Injectable()
export class SequelizeDoctorInactivityRepository implements IDoctorInactivityRepository {
  constructor(private readonly sequelize: Sequelize) {}

  async findCandidates(cap: number): Promise<InactiveDoctorCandidate[]> {
    const rows = await this.sequelize.query<CandidateRow>(
      `SELECT id AS doctor_id, email, full_name, last_sign_in_at, inactivity_notice_stage
         FROM profiles
        WHERE role = 'doctor'
          AND is_active = true
          AND last_sign_in_at IS NOT NULL
          AND inactivity_notice_stage < 2
        ORDER BY last_sign_in_at ASC
        LIMIT :cap`,
      {
        type: QueryTypes.SELECT,
        replacements: { cap },
      },
    );

    return rows.map((r) => ({
      doctorId: r.doctor_id,
      email: r.email,
      fullName: r.full_name ?? null,
      lastSignInAt: new Date(r.last_sign_in_at),
      inactivityNoticeStage: r.inactivity_notice_stage,
    }));
  }

  async markNoticeSent(doctorId: string, stage: number, sentAt: Date): Promise<void> {
    await this.sequelize.query(
      `UPDATE profiles
          SET inactivity_notice_stage = :stage,
              last_inactivity_notice_at = :sentAt,
              updated_at = NOW()
        WHERE id = :doctorId`,
      {
        type: QueryTypes.UPDATE,
        replacements: { doctorId, stage, sentAt },
      },
    );
  }
}
