'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_send_log', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      /**
       * Logical type of the recipient.
       * Values: 'patient' | 'doctor' | 'admin' | 'system'.
       * SECURITY: Never stores an email address.
       */
      recipient_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      /**
       * UUID of the patient or doctor in their own table.
       * Nullable for admin broadcasts (multiple recipients / no single id)
       * or 'system' sends.
       * NO FK constraint — polymorphic soft reference.
       */
      recipient_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      template_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      /** 'sent' | 'failed' */
      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      /** Active email driver at send time: 'resend' | 'noop' | 'sandbox'. */
      provider: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      /** Provider-assigned message ID on success (e.g. Resend id). Null on failure. */
      provider_message_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      /** Truncated error message on failure (max 1 000 chars). Null on success. */
      error_detail: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Index on recipient_id — queries like "all emails sent to patient X"
    await queryInterface.addIndex('email_send_log', ['recipient_id'], {
      name: 'email_send_log_recipient_id_idx',
    });

    // Index on template_name — queries like "all invoice emails"
    await queryInterface.addIndex('email_send_log', ['template_name'], {
      name: 'email_send_log_template_name_idx',
    });

    // Index on created_at — time-range queries for dashboards / audits
    await queryInterface.addIndex('email_send_log', ['created_at'], {
      name: 'email_send_log_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_send_log');
  },
};
