'use strict';

/**
 * Migration: 20261030000007-backfill-auto-verified-profiles
 *
 * PROBLEM (confirmed in production, 2026-11-02):
 *   VerifyMppsUseCase only wrote the result to credential_verifications but did
 *   not promote profiles.verification_status.  As a result, doctors whose MPPS
 *   matched SACS (status='verified' in credential_verifications) still showed as
 *   "Pendiente" in the admin verification panel because their profile still had
 *   verification_status='pending'.
 *
 * FIX: From this migration forward, VerifyMppsUseCase promotes the profile after
 *   a successful SACS match.  This migration backfills the existing rows that
 *   already have a verified credential but a pending profile.
 *
 * WHAT THIS DOES:
 *   Updates profiles SET
 *     verification_status = 'verified',
 *     verified_at = NOW(),
 *     verified_by = NULL        ← NULL = system-automated (no human actor)
 *   WHERE
 *     role = 'doctor'
 *     AND verification_status = 'pending'
 *     AND EXISTS (
 *       SELECT 1 FROM credential_verifications cv
 *       WHERE cv.doctor_id = profiles.id
 *         AND cv.credential_type = 'mpps'
 *         AND cv.status = 'verified'
 *         AND normalize(cv.declared_value) = normalize(profiles.mpps_number)
 *         AND normalize(cv.declared_value) != ''
 *     )
 *
 * NORMALIZATION (mirrors TypeScript normalizeMpps):
 *   1. UPPER()
 *   2. Strip non-alphanumeric:  REGEXP_REPLACE(…, '[^0-9A-Z]', '', 'g')
 *   3. Strip leading MPPS:      REGEXP_REPLACE(…, '^MPPS', '')
 *   4. Strip leading zeros:     REGEXP_REPLACE(…, '^0+', '')
 *
 * SAFETY GUARDS:
 *   - WHERE verification_status='pending' → never overrides 'rejected' (admin decision).
 *   - WHERE normalize(…) != '' → never matches on empty/null declared values.
 *   - EXISTS IN a subquery (not = ANY()) for plain SQL compatibility.
 *   - Runs inside a transaction.
 *
 * DOWN:
 *   Undoing this backfill is intentionally a no-op.  We cannot reliably distinguish
 *   rows auto-promoted by this migration from rows that an admin manually verified
 *   (both have verified_by = NULL after this migration, since admin-verified rows
 *   always had a non-NULL actor id before).  Reverting would risk un-verifying
 *   legitimately-approved doctors.  The safe operator action is to manually set
 *   verification_status='pending' on specific rows if needed.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) => queryInterface.sequelize.query(sql, { transaction, ...opts });

      // Single UPDATE — all guards in the WHERE clause.
      // REGEXP_REPLACE is standard PostgreSQL; the three nested calls mirror
      // the TypeScript normalizeMpps() function exactly.
      await q(`
        UPDATE profiles p
        SET
          verification_status = 'verified',
          verified_at         = NOW(),
          verified_by         = NULL,
          updated_at          = NOW()
        WHERE
          p.role                = 'doctor'
          AND p.verification_status = 'pending'
          AND EXISTS (
            SELECT 1
            FROM credential_verifications cv
            WHERE
              cv.doctor_id        = p.id
              AND cv.credential_type = 'mpps'
              AND cv.status          = 'verified'
              AND REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        UPPER(COALESCE(cv.declared_value, '')),
                        '[^0-9A-Z]', '', 'g'
                      ),
                      '^MPPS', ''
                    ),
                    '^0+', ''
                  )
                  =
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        UPPER(COALESCE(p.mpps_number, '')),
                        '[^0-9A-Z]', '', 'g'
                      ),
                      '^MPPS', ''
                    ),
                    '^0+', ''
                  )
              AND REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        UPPER(COALESCE(cv.declared_value, '')),
                        '[^0-9A-Z]', '', 'g'
                      ),
                      '^MPPS', ''
                    ),
                    '^0+', ''
                  ) != ''
          )
      `);
    });
  },

  async down(_queryInterface) {
    // Intentional no-op — see file header for rationale.
    // To undo specific rows: UPDATE profiles SET verification_status='pending',
    // verified_at=NULL, verified_by=NULL WHERE id IN ('<uuid>', …)
  },
};
