'use strict';

/**
 * Migration: 20260708000001-shared-files
 *
 * Creates the `shared_files` table for the "Seguimiento del Paciente"
 * (Shared Health Space) feature.
 *
 * This table stores tasks, instructions, comments, and file references
 * exchanged between a doctor and a patient.
 *
 * STORAGE NOTE:
 *   `file_url` stores the GCS object PATH (e.g. "shared/doctor-id/file.pdf"),
 *   NOT a signed URL. Signed URLs are generated fresh at read time by the backend.
 *
 * Indexes:
 *   (doctor_id, patient_id) — primary query pattern for doctor list endpoint.
 *   (patient_id)            — patient portal list endpoint.
 *   (parent_task_id)        — thread resolution (nullable FK to self).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shared_files', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
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
      title: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Stores GCS object PATH — NOT a signed URL.
      file_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      file_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      file_size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      created_by: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      parent_task_id: {
        type: Sequelize.UUID,
        allowNull: true,
        // Self-referencing FK — references same table.
        references: { model: 'shared_files', key: 'id' },
        onDelete: 'SET NULL',
      },
      read_by_doctor: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      read_by_patient: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // CHECK constraints for closed enumerations
    await queryInterface.sequelize.query(`
      ALTER TABLE shared_files
        ADD CONSTRAINT shared_files_category_check
        CHECK (category IN ('instruction', 'file', 'recipe', 'lab_result', 'image', 'other', 'comment'))
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE shared_files
        ADD CONSTRAINT shared_files_status_check
        CHECK (status IN ('pending', 'completed', 'reviewed'))
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE shared_files
        ADD CONSTRAINT shared_files_created_by_check
        CHECK (created_by IN ('doctor', 'patient'))
    `);

    // Indexes
    await queryInterface.addIndex('shared_files', ['doctor_id', 'patient_id'], {
      name: 'idx_shared_files_doctor_patient',
    });

    await queryInterface.addIndex('shared_files', ['patient_id'], {
      name: 'idx_shared_files_patient_id',
    });

    await queryInterface.addIndex('shared_files', ['parent_task_id'], {
      name: 'idx_shared_files_parent_task_id',
      where: { parent_task_id: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shared_files');
  },
};
