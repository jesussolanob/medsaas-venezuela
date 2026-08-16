import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ProfileModel } from '../models/profile.model';
import type {
  IBookingDoctorLoader,
  DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';

interface ProfileWithHorizonRow {
  id: string;
  fullName: string;
  specialty: string | null;
  professionalTitle: string | null;
  paymentMethods: string[] | null;
  paymentDetails: Record<string, unknown> | null;
  avatarUrl: string | null;
  allowsOnline: boolean | null;
  officeAddress: string | null;
  city: string | null;
  isActive: boolean | null;
  bookingHorizonWeeks: number | null;
  /** Raw value from profiles.currency_mode — may be null for most profiles. */
  currencyModeRaw: string | null;
  /** Raw value from profiles.custom_rate — only meaningful when currency_mode = 'custom'. */
  customRateRaw: string | null;
}

/**
 * Implements IBookingDoctorLoader for the booking flow.
 *
 * Reads doctor public info from the profiles table and joins doctor_schedules
 * to expose booking_horizon_weeks to the public booking widget.
 * Read-only — no writes here.
 */
@Injectable()
export class SequelizeBookingDoctorRepository implements IBookingDoctorLoader {
  constructor(
    @InjectModel(ProfileModel)
    private readonly profileModel: typeof ProfileModel,
  ) {}

  async findById(doctorId: string): Promise<DoctorPublicInfo | null> {
    const sequelize: Sequelize = this.profileModel.sequelize as Sequelize;

    const rows = await sequelize.query<ProfileWithHorizonRow>(
      `
      SELECT
        p.id,
        p.full_name         AS "fullName",
        p.specialty,
        p.professional_title AS "professionalTitle",
        p.payment_methods   AS "paymentMethods",
        p.payment_details   AS "paymentDetails",
        p.avatar_url        AS "avatarUrl",
        p.allows_online     AS "allowsOnline",
        p.office_address    AS "officeAddress",
        p.city,
        p.is_active         AS "isActive",
        COALESCE(ds.booking_horizon_weeks, 8) AS "bookingHorizonWeeks",
        p.currency_mode     AS "currencyModeRaw",
        p.custom_rate       AS "customRateRaw"
      FROM profiles p
      LEFT JOIN doctor_schedules ds ON ds.doctor_id = p.id
      WHERE p.id = :doctorId
      LIMIT 1
      `,
      {
        replacements: { doctorId },
        type: QueryTypes.SELECT,
      },
    );

    const row = rows[0];
    if (!row) return null;

    // Normalise currency_mode: only 'eur_bcv' and 'custom' are valid non-default values.
    // Any other value (including null) defaults to 'usd_bcv' — the most common case.
    const rawMode = row.currencyModeRaw;
    const currencyMode: 'usd_bcv' | 'eur_bcv' | 'custom' =
      rawMode === 'eur_bcv' || rawMode === 'custom' ? rawMode : 'usd_bcv';

    // customRate is only meaningful (and safe to expose) when mode is 'custom'.
    // For all other modes, return null so the frontend never uses a stale rate.
    // pg returns DECIMAL columns as strings; Number() converts them correctly.
    const customRate =
      currencyMode === 'custom' && row.customRateRaw != null ? Number(row.customRateRaw) : null;

    return {
      id: row.id,
      fullName: row.fullName,
      specialty: row.specialty,
      professionalTitle: row.professionalTitle,
      paymentMethods: row.paymentMethods,
      paymentDetails: row.paymentDetails,
      allowsOnline: row.allowsOnline,
      officeAddress: row.officeAddress,
      city: row.city,
      avatarUrl: row.avatarUrl,
      isActive: row.isActive,
      bookingHorizonWeeks: row.bookingHorizonWeeks ?? 8,
      currencyMode,
      customRate,
    };
  }
}
