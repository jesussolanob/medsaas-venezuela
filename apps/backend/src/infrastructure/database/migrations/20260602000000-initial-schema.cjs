/**
 * Migration: 20260602000000-initial-schema
 *
 * Creates all 10 enums and 18 tables for Delta Medical CRM.
 * Spec: migracion/03b-schema-real.md
 *
 * Format: CommonJS (.cjs) — sequelize-cli does not support TypeScript natively
 * without ts-node registration, which is fragile in NX monorepos. CJS is the
 * robust choice that guarantees this migration runs in green on the first try.
 *
 * FK circular resolution (appointments <-> consultations):
 *   1. Create appointments WITHOUT the consultation_id FK constraint.
 *   2. Create consultations WITH its FK -> appointments.
 *   3. ALTER TABLE appointments ADD COLUMN consultation_id + ADD CONSTRAINT.
 *
 * patient_packages.package_template_id:
 *   Created as nullable uuid column WITHOUT a formal FK, because package_templates
 *   is not one of the 18 tables in scope (it exists in Supabase but is out of scope
 *   for this migration). A FK can be added in a future migration.
 *
 * UUID generator: all tables use gen_random_uuid() (pgcrypto) for consistency.
 *   uuid_generate_v4() (uuid-ossp) is kept in CREATE EXTENSION for compatibility
 *   but is not used as a column default.
 *
 * Post-review corrections (2026-06-02):
 *   A. email_search_hash column added to patients; patients_doctor_email_uq index
 *      now uses the deterministic hash instead of LOWER(TRIM(email)) ciphertext.
 *   B. FK indexes added for all FK columns that lacked one.
 *   C. Monetary columns use DECIMAL(12,2); bcv_rate uses DECIMAL(10,4).
 *   D. profiles.email gets a unique index.
 *   E. Composite indexes on consultations/access_audit_log use raw SQL for DESC order.
 *   F. Redundant idx_active_sessions_token removed (UNIQUE constraint creates index).
 *   G. consultations.consultation_code gets a UNIQUE constraint.
 *   H. prescriptions.updated_at column added for consistency with other PHI tables.
 *   I. UUID generator unified to gen_random_uuid() throughout.
 *   J. Security comments added on plaintext snapshot columns and blocks_snapshot.
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // -------------------------------------------------------------------------
    // Extensions (idempotent — already present in Docker init.sql)
    // Both extensions are kept: uuid-ossp for compatibility; pgcrypto for
    // gen_random_uuid() which is the canonical UUID generator in this migration.
    // -------------------------------------------------------------------------
    await queryInterface.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
    );
    await queryInterface.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
    );

    // =========================================================================
    // STEP 1 — ENUMS / CUSTOM TYPES
    // Order: none depend on each other, all go to public schema.
    // =========================================================================

    // 1. user_role — D-01: 4 values from SQL v24 (super_admin|doctor|assistant|patient)
    //    'admin' is treated as alias of 'super_admin' in application code.
    await queryInterface.sequelize.query(`
      CREATE TYPE user_role AS ENUM (
        'super_admin',
        'doctor',
        'assistant',
        'patient'
      );
    `);

    // 2. subscription_plan — D-02: includes both 'enterprise' (legacy) and 'clinic' (new)
    await queryInterface.sequelize.query(`
      CREATE TYPE subscription_plan AS ENUM (
        'trial',
        'basic',
        'professional',
        'enterprise',
        'clinic'
      );
    `);

    // 3. subscription_status — D-03: 5 values from v24 ('trialing' is NOT in the enum)
    await queryInterface.sequelize.query(`
      CREATE TYPE subscription_status AS ENUM (
        'active',
        'suspended',
        'cancelled',
        'trial',
        'past_due'
      );
    `);

    // 4. appointment_status — D-04: 7 values for historical data compatibility
    await queryInterface.sequelize.query(`
      CREATE TYPE appointment_status AS ENUM (
        'scheduled',
        'confirmed',
        'completed',
        'cancelled',
        'no_show',
        'pending',
        'accepted'
      );
    `);

    // 5. reminder_channel
    await queryInterface.sequelize.query(`
      CREATE TYPE reminder_channel AS ENUM (
        'whatsapp',
        'email',
        'both'
      );
    `);

    // 6. reminder_offset
    await queryInterface.sequelize.query(`
      CREATE TYPE reminder_offset AS ENUM (
        '7d',
        '24h',
        '3h',
        '1h'
      );
    `);

    // 7. lead_source
    await queryInterface.sequelize.query(`
      CREATE TYPE lead_source AS ENUM (
        'whatsapp',
        'instagram',
        'facebook',
        'website',
        'referral',
        'manual'
      );
    `);

    // 8. lead_status
    await queryInterface.sequelize.query(`
      CREATE TYPE lead_status AS ENUM (
        'hot',
        'cold',
        'client',
        'archived'
      );
    `);

    // 9. payment_method — D-07: created but NOT applied as column type in appointments
    await queryInterface.sequelize.query(`
      CREATE TYPE payment_method AS ENUM (
        'pago_movil',
        'transferencia',
        'efectivo',
        'zelle',
        'otro'
      );
    `);

    // 10. payment_status — D-08: for subscription_payments; consultations uses text+CHECK
    await queryInterface.sequelize.query(`
      CREATE TYPE payment_status AS ENUM (
        'pending',
        'verified',
        'rejected'
      );
    `);

    // =========================================================================
    // STEP 2 — TABLES (in FK dependency order per spec section "Orden de creación")
    // =========================================================================

    // -------------------------------------------------------------------------
    // T-01: profiles (no FK to other business tables)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('profiles', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        // id mirrors auth.users.id; in Stage 1 (no Auth0) the app provides the UUID
      },
      full_name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      email: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      role: {
        // Use ENUM type name directly for custom PG enum
        type: '"user_role"',
        allowNull: false,
        defaultValue: 'patient',
      },
      specialty: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      professional_title: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      clinic_id: {
        type: Sequelize.UUID,
        allowNull: true,
        // FK to clinics table (outside scope of 18 tables) — no formal FK constraint
      },
      clinic_role: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      payment_methods: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: true,
      },
      payment_details: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      avatar_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      allows_online: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      office_address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      city: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      state: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      cedula: {
        type: Sequelize.TEXT,
        allowNull: true,
        // Doctor's cedula — not encrypted PHI in this context (unlike patients.cedula)
      },
      phone: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sex: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      // Snapshot columns — D-09: written by register/actions.ts, redundant with subscriptions
      plan: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      subscription_status: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      subscription_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.addIndex('profiles', ['role'], {
      name: 'idx_profiles_role',
    });

    // Correction D: profiles.email unique index — email must be unique per user
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_profiles_email ON profiles(email);
    `);

    // -------------------------------------------------------------------------
    // T-02: plan_configs (no FK)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('plan_configs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      plan_key: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      // Correction C: numeric(12,2) for monetary columns
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'USD',
      },
      trial_days: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // -------------------------------------------------------------------------
    // T-03: plan_features — D-10: with id and feature_label (v24 structure)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('plan_features', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      plan: {
        type: Sequelize.TEXT,
        allowNull: false,
        // logical FK to plan_configs.plan_key — not a formal FK constraint (as in v24)
      },
      feature_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      feature_label: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // UNIQUE (plan, feature_key)
    await queryInterface.addConstraint('plan_features', {
      fields: ['plan', 'feature_key'],
      type: 'unique',
      name: 'plan_features_plan_feature_key_key',
    });

    // -------------------------------------------------------------------------
    // T-04: subscriptions (FK -> profiles)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('subscriptions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        // Correction I: unified UUID generator — gen_random_uuid() throughout
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      plan: {
        type: '"subscription_plan"',
        allowNull: false,
        defaultValue: 'trial',
      },
      status: {
        type: '"subscription_status"',
        allowNull: false,
        defaultValue: 'trial',
      },
      // Correction C: numeric(12,2) for monetary columns
      price_usd: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      billing_cycle: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'monthly',
      },
      current_period_start: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
      current_period_end: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now() + interval '30 days'"),
      },
      trial_ends_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("now() + interval '14 days'"),
      },
      cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // -------------------------------------------------------------------------
    // T-05: patients (FK -> profiles x2)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('patients', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      auth_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'profiles', key: 'id' },
        // no ON DELETE — nullable FK, keep patient record if profile deleted
      },
      // PHI fields — stored as AES-256-GCM ciphertext by the backend application layer
      full_name: {
        type: Sequelize.TEXT,
        allowNull: false,
        // PHI: ciphertext AES-256-GCM
      },
      full_name_search_hash: {
        type: 'VARCHAR(64)',
        allowNull: true,
        // HMAC-SHA256 hex of normalized full_name, used for search without decrypting
      },
      cedula: {
        type: Sequelize.TEXT,
        allowNull: true,
        // PHI: ciphertext AES-256-GCM — D-11: column is 'cedula', not 'id_number'
      },
      cedula_search_hash: {
        type: 'VARCHAR(64)',
        allowNull: true,
      },
      phone: {
        type: Sequelize.TEXT,
        allowNull: true,
        // PHI: ciphertext AES-256-GCM
      },
      email: {
        type: Sequelize.TEXT,
        allowNull: true,
        // PHI: ciphertext AES-256-GCM
        // NOTE: this column stores AES-256-GCM ciphertext (random nonce per encrypt).
        // Indexing on LOWER(TRIM(email)) would index non-deterministic ciphertext and
        // would never detect duplicates. The deterministic hash email_search_hash is
        // used for duplicate detection and lookup instead.
      },
      // Correction A: email_search_hash — deterministic HMAC-SHA256 hex of email,
      // required because email column stores AES-256-GCM ciphertext (random nonce).
      // This is an internal backend column; it is NOT part of the @delta/shared-types
      // Zod contract (same as cedula_search_hash / full_name_search_hash).
      email_search_hash: {
        type: 'VARCHAR(64)',
        allowNull: true,
      },
      source: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      birth_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      age: {
        type: Sequelize.INTEGER,
        allowNull: true,
        // legacy — prefer birth_date
      },
      sex: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      blood_type: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      allergies: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      chronic_conditions: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      city: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      emergency_contact_name: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      emergency_contact_phone: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // Correction A: unique index on (doctor_id, email_search_hash) — uses the
    // deterministic hash so duplicate detection works with encrypted email values.
    // The old index on LOWER(TRIM(email)) would index AES-256-GCM ciphertext
    // (which includes a random nonce) and would never catch duplicates.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX patients_doctor_email_uq
        ON patients(doctor_id, email_search_hash)
        WHERE email_search_hash IS NOT NULL;
    `);

    // Correction A: lookup index for email hash (patient search by email)
    await queryInterface.addIndex('patients', ['email_search_hash'], {
      name: 'idx_patients_email_hash',
    });

    await queryInterface.addIndex('patients', ['doctor_id'], {
      name: 'idx_patients_doctor',
    });
    await queryInterface.addIndex('patients', ['auth_user_id'], {
      name: 'idx_patients_auth_user',
    });
    await queryInterface.addIndex('patients', ['cedula_search_hash'], {
      name: 'idx_patients_cedula_hash',
    });
    await queryInterface.addIndex('patients', ['full_name_search_hash'], {
      name: 'idx_patients_name_hash',
    });

    // -------------------------------------------------------------------------
    // T-11: pricing_plans (FK -> profiles) — created before patient_packages
    //   because patient_packages has no FK to pricing_plans; this order keeps
    //   pricing_plans available for later module FKs.
    //   D-15: no CREATE TABLE in repo; columns inferred from frontend code.
    // -------------------------------------------------------------------------
    await queryInterface.createTable('pricing_plans', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      // Correction C: numeric(12,2) for monetary columns
      price_usd: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      duration_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 30,
      },
      sessions_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: '',
      },
      type: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'plan',
      },
      show_in_booking: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.addIndex('pricing_plans', ['doctor_id'], {
      name: 'idx_pricing_plans_doctor',
    });

    // Partial index for show_in_booking lookup
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_pricing_plans_booking
        ON pricing_plans(doctor_id, show_in_booking)
        WHERE show_in_booking = true;
    `);

    // -------------------------------------------------------------------------
    // T-12: leads (FK -> profiles) — D-05, D-06
    // -------------------------------------------------------------------------
    await queryInterface.createTable('leads', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      phone: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // D-05: 'channel' is text (not lead_source enum) to accept both BD enum values
      //   and frontend LeadChannel values (web|llamada|referido)
      channel: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // D-06: 'stage' is text with CHECK for frontend LeadStage values
      stage: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'new',
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // 'source' uses the lead_source enum; 'channel' is text (see D-05)
      source: {
        type: '"lead_source"',
        allowNull: true,
      },
      // 'status' uses the lead_status enum (hot|cold|client|archived)
      status: {
        type: '"lead_status"',
        allowNull: true,
      },
      last_activity: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // CHECK for stage values (D-06)
    await queryInterface.sequelize.query(`
      ALTER TABLE leads ADD CONSTRAINT leads_stage_check
        CHECK (stage IN ('new','contacted','qualified','appointment','converted','lost'));
    `);

    await queryInterface.addIndex('leads', ['doctor_id'], {
      name: 'idx_leads_doctor',
    });

    // -------------------------------------------------------------------------
    // T-10: patient_packages (FK -> profiles, patients)
    //   package_template_id: nullable uuid WITHOUT formal FK (package_templates
    //   is outside the 18-table scope — D-14)
    //   D-14: columns inferred from ALTER TABLE v25 + frontend code
    // -------------------------------------------------------------------------
    await queryInterface.createTable('patient_packages', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'patients', key: 'id' },
        onDelete: 'SET NULL',
      },
      auth_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'profiles', key: 'id' },
        // no ON DELETE — nullable FK
      },
      // No formal FK to package_templates — table not in scope of 18 tables
      package_template_id: {
        type: Sequelize.UUID,
        allowNull: true,
        // Intentionally no references: {} — package_templates is out of scope
      },
      plan_name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      specialty: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      total_sessions: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      used_sessions: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'active',
      },
      // Correction C: numeric(12,2) for monetary columns
      purchased_amount_usd: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      notified_one_left: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // CHECK for status values
    await queryInterface.sequelize.query(`
      ALTER TABLE patient_packages ADD CONSTRAINT patient_packages_status_check
        CHECK (status IN ('active','completed'));
    `);

    await queryInterface.addIndex('patient_packages', ['doctor_id'], {
      name: 'idx_patient_packages_doctor',
    });
    await queryInterface.addIndex('patient_packages', ['patient_id'], {
      name: 'idx_patient_packages_patient',
    });
    await queryInterface.addIndex('patient_packages', ['auth_user_id'], {
      name: 'idx_patient_packages_auth_user',
    });

    // -------------------------------------------------------------------------
    // T-06: appointments — FK circular resolution: create WITHOUT consultation_id FK.
    //   consultation_id column + FK added after consultations table is created.
    //
    // SECURITY NOTE on desnormalized snapshot columns (patient_name, patient_phone,
    // patient_email, patient_cedula): these are PLAINTEXT snapshots captured at
    // booking time, mirroring the Supabase real schema. They are intentionally kept
    // in plaintext for Phase 1 (booking flow compatibility). Field-level encryption
    // for these columns is deferred to Phase 4 (field encryption rollout), at which
    // point the access_audit_log.field_revealed whitelist will be expanded accordingly.
    // DO NOT encrypt or remove these columns in the current phase.
    // -------------------------------------------------------------------------
    await queryInterface.createTable('appointments', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'patients', key: 'id' },
        onDelete: 'SET NULL',
      },
      auth_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'profiles', key: 'id' },
        // no ON DELETE
      },
      // consultation_id added after consultations is created (circular FK)
      // Plaintext snapshot — see security note above
      patient_name: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Plaintext snapshot — see security note above
      patient_phone: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Plaintext snapshot — see security note above
      patient_email: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Plaintext snapshot — see security note above
      patient_cedula: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      scheduled_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: '"appointment_status"',
        allowNull: false,
        defaultValue: 'scheduled',
      },
      appointment_mode: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'presencial',
      },
      source: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      plan_name: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Correction C: numeric(12,2) for monetary columns
      plan_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      // D-07: payment_method is free text in appointments (not the payment_method enum)
      payment_method: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      payment_reference: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      payment_receipt_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      insurance_name: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Correction C: numeric(10,4) for exchange rate (BCV rate needs 4 decimal places)
      bcv_rate: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true,
      },
      // Correction C: numeric(12,2) for monetary columns
      amount_bs: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      package_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'patient_packages', key: 'id' },
        onDelete: 'SET NULL',
      },
      session_number: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      chief_complaint: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      appointment_code: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // Partial unique index: one slot per doctor per time, only for active statuses.
    // Note: status::text cast in WHERE predicate is not IMMUTABLE in Postgres.
    // Solution: compare enum values directly without cast using enum literal syntax.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX appointments_doctor_slot_uq
        ON appointments(doctor_id, scheduled_at)
        WHERE status IN (
          'scheduled'::appointment_status,
          'confirmed'::appointment_status,
          'pending'::appointment_status,
          'accepted'::appointment_status
        );
    `);

    await queryInterface.addIndex('appointments', ['doctor_id'], {
      name: 'idx_appointments_doctor_id',
    });
    await queryInterface.addIndex('appointments', ['scheduled_at'], {
      name: 'idx_appointments_scheduled_at',
    });
    await queryInterface.addIndex('appointments', ['patient_id'], {
      name: 'idx_appointments_patient_id',
    });
    await queryInterface.addIndex('appointments', ['status'], {
      name: 'idx_appointments_status',
    });
    // Correction B: FK indexes missing in original — auth_user_id and package_id
    await queryInterface.addIndex('appointments', ['auth_user_id'], {
      name: 'idx_appointments_auth_user_id',
    });
    await queryInterface.addIndex('appointments', ['package_id'], {
      name: 'idx_appointments_package_id',
    });

    // -------------------------------------------------------------------------
    // T-07: consultations (FK -> profiles, patients, appointments)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('consultations', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
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
      appointment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'appointments', key: 'id' },
        onDelete: 'SET NULL',
      },
      consultation_code: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      consultation_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      // PHI fields — ciphertext AES-256-GCM
      chief_complaint: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      diagnosis: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      treatment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // D-08: text + CHECK (not payment_status enum which is for subscription_payments)
      payment_status: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'pending',
      },
      payment_method: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Correction C: numeric(12,2) for monetary columns
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      // WARNING: blocks_snapshot may contain PHI as free text (D-12).
      // Evaluate encrypting this jsonb column before production. The backend must
      // avoid placing structured PHI (diagnosis, treatment, medications) directly
      // in blocks_snapshot, or encrypt the jsonb column as a whole before Phase 4.
      blocks_snapshot: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // CHECK for payment_status
    await queryInterface.sequelize.query(`
      ALTER TABLE consultations ADD CONSTRAINT consultations_payment_status_check
        CHECK (payment_status IN ('pending','approved'));
    `);

    // Correction G: consultation_code is described as a unique code in the spec
    await queryInterface.addConstraint('consultations', {
      fields: ['consultation_code'],
      type: 'unique',
      name: 'consultations_consultation_code_key',
    });

    // Correction E: composite indexes with DESC order require raw SQL —
    // Sequelize addIndex does not support per-column DESC direction.
    // Replacing the previous addIndex calls with raw SQL for correct behavior.
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_consultations_doctor_date
        ON consultations(doctor_id, consultation_date DESC);
    `);
    await queryInterface.addIndex('consultations', ['patient_id'], {
      name: 'idx_consultations_patient',
    });
    await queryInterface.addIndex('consultations', ['appointment_id'], {
      name: 'idx_consultations_appointment',
    });

    // -------------------------------------------------------------------------
    // CIRCULAR FK RESOLUTION: add consultation_id column + FK to appointments
    // -------------------------------------------------------------------------
    await queryInterface.addColumn('appointments', 'consultation_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addConstraint('appointments', {
      fields: ['consultation_id'],
      type: 'foreign key',
      name: 'fk_appointments_consultation_id',
      references: { table: 'consultations', field: 'id' },
      onDelete: 'SET NULL',
    });

    // Correction B: FK index for consultation_id (added after ALTER TABLE above)
    await queryInterface.addIndex('appointments', ['consultation_id'], {
      name: 'idx_appointments_consultation_id',
    });

    // -------------------------------------------------------------------------
    // T-08: ehr_records (FK -> profiles, patients, consultations)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('ehr_records', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
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
      consultation_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'consultations', key: 'id' },
        onDelete: 'SET NULL',
      },
      // PHI fields — ciphertext AES-256-GCM
      diagnosis: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      treatment_plan: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.addIndex('ehr_records', ['doctor_id'], {
      name: 'idx_ehr_doctor',
    });
    await queryInterface.addIndex('ehr_records', ['patient_id'], {
      name: 'idx_ehr_patient',
    });
    await queryInterface.addIndex('ehr_records', ['consultation_id'], {
      name: 'idx_ehr_consultation',
    });

    // -------------------------------------------------------------------------
    // T-09: prescriptions (FK -> profiles, patients, consultations)
    //   D-13: column is 'medication', NOT 'medication_name'
    // -------------------------------------------------------------------------
    await queryInterface.createTable('prescriptions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'patients', key: 'id' },
        onDelete: 'CASCADE',
      },
      consultation_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'consultations', key: 'id' },
        onDelete: 'CASCADE',
      },
      // PHI — ciphertext AES-256-GCM. Column name is 'medication' (D-13)
      medication: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      // PHI — ciphertext AES-256-GCM
      dosage: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      frequency: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      duration: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      // Correction H: updated_at added for consistency with other PHI tables
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.addIndex('prescriptions', ['doctor_id'], {
      name: 'idx_prescriptions_doctor',
    });
    await queryInterface.addIndex('prescriptions', ['consultation_id'], {
      name: 'idx_prescriptions_consultation',
    });
    await queryInterface.addIndex('prescriptions', ['patient_id'], {
      name: 'idx_prescriptions_patient',
    });

    // -------------------------------------------------------------------------
    // T-13: patient_messages (FK -> patients, profiles)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('patient_messages', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        onDelete: 'CASCADE',
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      direction: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE patient_messages ADD CONSTRAINT patient_messages_direction_check
        CHECK (direction IN ('patient_to_doctor','doctor_to_patient'));
    `);

    await queryInterface.addIndex('patient_messages', ['patient_id'], {
      name: 'idx_patient_messages_patient',
    });
    await queryInterface.addIndex('patient_messages', ['doctor_id'], {
      name: 'idx_patient_messages_doctor',
    });

    // -------------------------------------------------------------------------
    // T-14: reminders_settings (FK -> profiles, UNIQUE on doctor_id)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('reminders_settings', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        // Correction I: unified UUID generator
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      channel: {
        type: '"reminder_channel"',
        allowNull: true,
        defaultValue: 'both',
      },
      reminder_7d_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      reminder_24h_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      reminder_3h_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      reminder_1h_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      template_7d_whatsapp: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'Hola {patient_name}, te recordamos…',
      },
      template_24h_whatsapp: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'Hola {patient_name}, mañana tienes…',
      },
      template_3h_whatsapp: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'Hola {patient_name}, en 3 horas…',
      },
      quiet_hours_start: {
        type: Sequelize.TIME,
        allowNull: true,
        defaultValue: '21:00:00',
      },
      quiet_hours_end: {
        type: Sequelize.TIME,
        allowNull: true,
        defaultValue: '08:00:00',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // -------------------------------------------------------------------------
    // T-15: reminders_queue (FK -> appointments, profiles x2)
    //   D-16: patient_id references profiles(id) per SQL v24 (not patients.id)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('reminders_queue', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        // Correction I: unified UUID generator
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      appointment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'appointments', key: 'id' },
        onDelete: 'CASCADE',
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        // no ON DELETE per spec
      },
      // D-16: FK -> profiles(id) per v24 (Supabase Auth profile of patient)
      patient_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'profiles', key: 'id' },
        // no ON DELETE
      },
      offset_type: {
        type: '"reminder_offset"',
        allowNull: false,
      },
      scheduled_for: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      channel: {
        type: '"reminder_channel"',
        allowNull: false,
      },
      message_body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: 'pending',
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      last_attempt_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE reminders_queue ADD CONSTRAINT reminders_queue_status_check
        CHECK (status IN ('pending','sent','failed','skipped','cancelled'));
    `);

    await queryInterface.addIndex('reminders_queue', ['appointment_id'], {
      name: 'idx_reminders_queue_appointment',
    });

    // Correction B: FK indexes for doctor_id and patient_id in reminders_queue
    await queryInterface.addIndex('reminders_queue', ['doctor_id'], {
      name: 'idx_reminders_queue_doctor',
    });
    await queryInterface.addIndex('reminders_queue', ['patient_id'], {
      name: 'idx_reminders_queue_patient',
    });

    // Partial index for worker polling
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_reminders_queue_worker
        ON reminders_queue(scheduled_for, status)
        WHERE status = 'pending';
    `);

    // -------------------------------------------------------------------------
    // T-16: doctor_invitations (FK -> profiles)
    //   D-17: no DDL in repo; designed from context (unique booking link per doctor)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('doctor_invitations', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      token: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      max_uses: {
        type: Sequelize.INTEGER,
        allowNull: true,
        // NULL = unlimited uses
      },
      uses_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        // NULL = no expiration
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // Correction B: FK index for doctor_id in doctor_invitations
    await queryInterface.addIndex('doctor_invitations', ['doctor_id'], {
      name: 'idx_doctor_invitations_doctor',
    });

    // -------------------------------------------------------------------------
    // T-17: access_audit_log (FK -> profiles, patients — no ON DELETE for audit integrity)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('access_audit_log', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      actor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        // no ON DELETE — audit trail must not be destroyed when actor is deleted
      },
      actor_role: {
        type: '"user_role"',
        allowNull: false,
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        // no ON DELETE — audit trail must not be destroyed when patient is deleted
      },
      field_revealed: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      ip_address: {
        type: Sequelize.INET,
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE access_audit_log ADD CONSTRAINT access_audit_log_field_check
        CHECK (field_revealed IN (
          'full_name','cedula','phone','email',
          'diagnosis','treatment_plan','medication',
          'dosage','chief_complaint','treatment'
        ));
    `);

    // Correction E: composite DESC indexes require raw SQL for correct order.
    // The previous addIndex calls with order: 'DESC' applied DESC to the entire
    // index, not per-column — raw SQL is explicit and correct.
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_aal_actor
        ON access_audit_log(actor_id, created_at DESC);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_aal_patient
        ON access_audit_log(patient_id, created_at DESC);
    `);
    await queryInterface.addIndex('access_audit_log', ['created_at'], {
      name: 'idx_aal_created',
    });

    // -------------------------------------------------------------------------
    // T-18: active_sessions (FK -> profiles ON DELETE CASCADE)
    // -------------------------------------------------------------------------
    await queryInterface.createTable('active_sessions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
        // UNIQUE enforces "one active device" policy; UPSERT ON CONFLICT replaces previous session
      },
      session_token: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      device_info: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      ip_address: {
        type: Sequelize.INET,
        allowNull: true,
      },
      last_seen: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        // NULL = no explicit expiration; relies on Auth0/token TTL in Stage 2
      },
    });

    // Correction F: idx_active_sessions_token removed — the UNIQUE constraint on
    // session_token already creates an implicit B-tree index. Adding a second index
    // on the same column wastes space and write overhead with no query benefit.
    // The UNIQUE constraint index is used for all lookups by session_token.
    await queryInterface.addIndex('active_sessions', ['last_seen'], {
      name: 'idx_active_sessions_last_seen',
    });
  },

  // ===========================================================================
  // DOWN — reverts everything in reverse order, leaving DB empty of business tables
  // ===========================================================================
  async down(queryInterface) {
    // Drop tables in reverse FK dependency order.
    // All indexes created via addIndex or raw SQL are automatically dropped
    // when their parent table is dropped (CASCADE behavior in Postgres).
    // Constraints added via addConstraint and raw SQL ALTER TABLE are also
    // dropped with the table. No separate DROP INDEX statements are needed.
    await queryInterface.dropTable('active_sessions');
    await queryInterface.dropTable('access_audit_log');
    await queryInterface.dropTable('doctor_invitations');
    await queryInterface.dropTable('reminders_queue');
    await queryInterface.dropTable('reminders_settings');
    await queryInterface.dropTable('patient_messages');
    await queryInterface.dropTable('prescriptions');
    await queryInterface.dropTable('ehr_records');

    // Remove circular FK constraint before dropping consultations
    await queryInterface.removeConstraint(
      'appointments',
      'fk_appointments_consultation_id'
    );
    await queryInterface.removeColumn('appointments', 'consultation_id');

    await queryInterface.dropTable('consultations');
    await queryInterface.dropTable('appointments');
    await queryInterface.dropTable('patient_packages');
    await queryInterface.dropTable('leads');
    await queryInterface.dropTable('pricing_plans');
    await queryInterface.dropTable('patients');
    await queryInterface.dropTable('subscriptions');
    await queryInterface.dropTable('plan_features');
    await queryInterface.dropTable('plan_configs');
    await queryInterface.dropTable('profiles');

    // Drop custom types in reverse order
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS payment_status;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS payment_method;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS lead_status;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS lead_source;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS reminder_offset;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS reminder_channel;');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS appointment_status;'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS subscription_status;'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS subscription_plan;'
    );
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS user_role;');
  },
};
