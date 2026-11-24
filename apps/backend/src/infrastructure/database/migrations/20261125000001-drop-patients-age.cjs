'use strict';

/**
 * Drop the patients.age column.
 *
 * Age is now always computed from patients.birth_date using ageFromBirthDate()
 * in Caracas time, so storing it is redundant and risks going stale.
 *
 * Prod data (2026-11-24): 132 patients, 22 with a non-null age value.
 * Every one of those 22 also has birth_date set, so the drop is lossless.
 *
 * DOWN: recreates the column and backfills from birth_date using Postgres
 * date arithmetic (year difference adjusted for whether the birthday has
 * passed this calendar year). The backfill intentionally uses UTC, which
 * may be off by one day near midnight Caracas time — acceptable for a
 * rollback scenario; the application always recomputes in Caracas time.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE patients DROP COLUMN IF EXISTS age;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS age INTEGER NULL;

      UPDATE patients
         SET age = (
               date_part('year', now())::INTEGER
               - date_part('year', birth_date::DATE)::INTEGER
               - CASE
                   WHEN (date_part('month', now()), date_part('day', now()))
                      < (date_part('month', birth_date::DATE), date_part('day', birth_date::DATE))
                   THEN 1
                   ELSE 0
                 END
             )
       WHERE birth_date IS NOT NULL;
    `);
  },
};
