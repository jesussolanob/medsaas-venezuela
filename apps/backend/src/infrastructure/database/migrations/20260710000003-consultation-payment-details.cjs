'use strict';

/**
 * Adds payment detail columns to `consultations`:
 *   - payment_reference  TEXT NULL  — free-text reference supplied by doctor (e.g. bank ref number)
 *   - payment_receipt_url TEXT NULL — URL/path pointing to the uploaded receipt file
 *
 * These columns are independent of payment_status: the doctor can attach/edit a
 * reference and receipt at any time, even after the payment has been approved.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('consultations', 'payment_reference', {
      type: Sequelize.DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('consultations', 'payment_receipt_url', {
      type: Sequelize.DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('consultations', 'payment_receipt_url');
    await queryInterface.removeColumn('consultations', 'payment_reference');
  },
};
