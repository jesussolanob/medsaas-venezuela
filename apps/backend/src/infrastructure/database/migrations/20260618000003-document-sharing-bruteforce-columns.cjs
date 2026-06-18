'use strict';

/**
 * Migration: add link-level brute-force protection columns to shared_document_links.
 *
 * Security fix: prevents brute-force bypass via request-code rotation.
 *
 * New columns on shared_document_links:
 *   failed_attempts        INTEGER NOT NULL DEFAULT 0
 *     — Accumulates failed verify-code attempts across ALL code rotations.
 *       Requesting a new code does NOT reset this counter.
 *       When >= 10, verify-code is blocked for this link.
 *
 *   last_code_requested_at TIMESTAMPTZ NULL
 *     — Timestamp of the last request-code call.
 *       Enforces a 60-second minimum cooldown between code requests.
 */

/** @param {import('sequelize').QueryInterface} queryInterface */
async function up(queryInterface) {
  await queryInterface.addColumn('shared_document_links', 'failed_attempts', {
    type: 'INTEGER',
    allowNull: false,
    defaultValue: 0,
  });

  await queryInterface.addColumn('shared_document_links', 'last_code_requested_at', {
    type: 'TIMESTAMPTZ',
    allowNull: true,
    defaultValue: null,
  });
}

/** @param {import('sequelize').QueryInterface} queryInterface */
async function down(queryInterface) {
  await queryInterface.removeColumn('shared_document_links', 'last_code_requested_at');
  await queryInterface.removeColumn('shared_document_links', 'failed_attempts');
}

module.exports = { up, down };
