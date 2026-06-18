'use strict';

/**
 * Migration: 20260618000001-document-sharing
 *
 * Creates two tables for the document-sharing module:
 *
 *   shared_document_links — one row per share action by a doctor.
 *     - token is a 48-byte URL-safe random string (NOT a UUID) for public URLs.
 *     - sections JSONB: { report, prescriptions, ehr } booleans.
 *     - status: 'active' | 'revoked' (CHECK constraint).
 *
 *   document_access_codes — one or more 6-digit codes per link (NEW code on each request-code call).
 *     - Verification always uses the latest code (ORDER BY created_at DESC LIMIT 1).
 *     - ON DELETE CASCADE from shared_document_links.
 *     - failed_attempts: incremented on wrong code; >= 5 means blocked.
 *     - used_at: set on successful verification.
 *
 * Indexes:
 *   shared_document_links: (token) UNIQUE, (doctor_id), (consultation_id)
 *   document_access_codes: (link_id)
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ------------------------------------------------------------------
    // Table: shared_document_links
    // ------------------------------------------------------------------
    await queryInterface.createTable('shared_document_links', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      consultation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'consultations', key: 'id' },
        onDelete: 'CASCADE',
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        onDelete: 'CASCADE',
      },
      token: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      sections: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'active',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Add CHECK constraint on status
    await queryInterface.sequelize.query(`
      ALTER TABLE shared_document_links
        ADD CONSTRAINT shared_document_links_status_check
        CHECK (status IN ('active', 'revoked'))
    `);

    // Indexes on shared_document_links
    await queryInterface.addIndex('shared_document_links', ['doctor_id'], {
      name: 'idx_shared_document_links_doctor_id',
    });
    await queryInterface.addIndex('shared_document_links', ['consultation_id'], {
      name: 'idx_shared_document_links_consultation_id',
    });

    // ------------------------------------------------------------------
    // Table: document_access_codes
    // ------------------------------------------------------------------
    await queryInterface.createTable('document_access_codes', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      link_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'shared_document_links', key: 'id' },
        onDelete: 'CASCADE',
      },
      code: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      failed_attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Index on document_access_codes
    await queryInterface.addIndex('document_access_codes', ['link_id'], {
      name: 'idx_document_access_codes_link_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('document_access_codes');
    await queryInterface.dropTable('shared_document_links');
  },
};
