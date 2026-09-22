'use strict';

/**
 * Migration: 20260922000002-notifications-table
 *
 * Creates the `notifications` table — in-app notification bell for doctors.
 *
 * SCOPE (mvp — presupuestos only):
 *   type IN ('quote_accepted', 'quote_rejected')
 *   entity_type = 'quote', entity_id = quotes.id
 *
 * DESIGN:
 *   - No FK on doctor_id: profiles can be soft-deleted; notifications survive
 *     for audit purposes. The application layer enforces ownership (anti-IDOR).
 *   - No FK on entity_id: keeps the schema generic for future entity types.
 *   - No updated_at: notifications are append-only; only read_at changes.
 *   - Composite index (doctor_id, read_at, created_at DESC) matches the two
 *     main query patterns: "unread for doctor" and "latest N for doctor".
 *   - 30-record cap is enforced by the application layer (ListNotificationsUseCase),
 *     not here — no DB trigger needed for the current scale.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE IF NOT EXISTS notifications (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          doctor_id   UUID        NOT NULL,
          type        TEXT        NOT NULL,
          title       TEXT        NOT NULL,
          body        TEXT        NOT NULL,
          entity_type TEXT        NULL,
          entity_id   TEXT        NULL,
          read_at     TIMESTAMPTZ NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Main query index: "list notifications for doctor, unread first, recent first"
      await q(`
        CREATE INDEX IF NOT EXISTS notifications_doctor_unread_idx
          ON notifications (doctor_id, read_at, created_at DESC)
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`DROP INDEX IF EXISTS notifications_doctor_unread_idx`);
      await q(`DROP TABLE IF EXISTS notifications`);
    });
  },
};
