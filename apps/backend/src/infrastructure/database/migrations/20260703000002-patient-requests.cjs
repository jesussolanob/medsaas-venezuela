'use strict';

/**
 * Migration: 20260703000002-patient-requests
 *
 * Creates three tables for the patient-requests module and seeds the
 * email template used to deliver the access code to the patient.
 *
 * Tables:
 *
 *   patient_requests — one row per doctor request to a patient.
 *     - token is a 48-byte URL-safe random string (NOT a UUID) for public URLs.
 *     - status: 'pending' | 'fulfilled' | 'revoked' (CHECK constraint).
 *     - failed_attempts: accumulated across all code rotations (brute-force cap).
 *
 *   patient_request_access_codes — one or more 6-digit codes per request.
 *     - Verification always uses the latest code (ORDER BY created_at DESC LIMIT 1).
 *     - ON DELETE CASCADE from patient_requests.
 *     - failed_attempts: incremented on wrong code/cédula; >= 5 means blocked.
 *     - used_at: set on successful verification.
 *
 *   patient_request_attachments — patient-uploaded files per request.
 *     - file_url stores the STORAGE PATH (not a signed URL).
 *     - ON DELETE CASCADE from patient_requests.
 *
 * Email template:
 *   patient_request_code — code delivery email sent to the patient.
 *
 * Indexes:
 *   patient_requests: (token) UNIQUE, (doctor_id), (patient_id)
 *   patient_request_access_codes: (request_id)
 *   patient_request_attachments: (request_id)
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ------------------------------------------------------------------
    // Table: patient_requests
    // ------------------------------------------------------------------
    await queryInterface.createTable('patient_requests', {
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
      token: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      title: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      response_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'pending',
      },
      failed_attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_code_requested_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      fulfilled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // CHECK constraint on status
    await queryInterface.sequelize.query(`
      ALTER TABLE patient_requests
        ADD CONSTRAINT patient_requests_status_check
        CHECK (status IN ('pending', 'fulfilled', 'revoked'))
    `);

    // Indexes on patient_requests
    await queryInterface.addIndex('patient_requests', ['doctor_id'], {
      name: 'idx_patient_requests_doctor_id',
    });
    await queryInterface.addIndex('patient_requests', ['patient_id'], {
      name: 'idx_patient_requests_patient_id',
    });

    // ------------------------------------------------------------------
    // Table: patient_request_access_codes
    // ------------------------------------------------------------------
    await queryInterface.createTable('patient_request_access_codes', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      request_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patient_requests', key: 'id' },
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

    await queryInterface.addIndex('patient_request_access_codes', ['request_id'], {
      name: 'idx_patient_request_access_codes_request_id',
    });

    // ------------------------------------------------------------------
    // Table: patient_request_attachments
    // ------------------------------------------------------------------
    await queryInterface.createTable('patient_request_attachments', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      request_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patient_requests', key: 'id' },
        onDelete: 'CASCADE',
      },
      file_url: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      file_name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      content_type: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      uploaded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('patient_request_attachments', ['request_id'], {
      name: 'idx_patient_request_attachments_request_id',
    });

    // ------------------------------------------------------------------
    // Email template: patient_request_code
    // ------------------------------------------------------------------
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Solicitud de documentos — Delta Medical</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .request-box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .request-box .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .request-box .value { font-size: 16px; font-weight: 600; color: #0f766e; margin-top: 4px; }
    .code-box { background: #f0fdfa; border: 2px solid #0d9488; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-box .code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f766e; font-family: monospace; }
    .code-box .code-label { font-size: 13px; color: #64748b; margin-top: 8px; }
    .btn { display: inline-block; background: #0d9488; color: #fff; text-decoration: none; border-radius: 6px; padding: 12px 28px; font-size: 15px; font-weight: 600; margin: 16px 0; }
    .info-box { background: #fefce8; border-left: 4px solid #ca8a04; border-radius: 4px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #713f12; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Solicitud de documentos / respuesta</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patientName}}</strong>,</p>
      <p>Su médico le ha enviado una solicitud a través del sistema Delta Medical:</p>
      <div class="request-box">
        <div class="label">Solicitud</div>
        <div class="value">{{title}}</div>
      </div>
      <p>Para responder, visite el enlace a continuación e ingrese el código de verificación:</p>
      <div class="code-box">
        <div class="code">{{code}}</div>
        <div class="code-label">Código de verificación (válido hasta {{expiresAt}})</div>
      </div>
      <p style="text-align:center">
        <a class="btn" href="{{url}}">Responder solicitud</a>
      </p>
      <p>O copie y pegue este enlace en su navegador:</p>
      <p style="word-break:break-all; font-size:13px; color:#475569;">{{url}}</p>
      <div class="info-box">
        <strong>Importante:</strong> Este enlace y código son de uso personal y confidencial.
        No los comparta con terceros. El código expira el {{expiresAt}}.
      </div>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    await queryInterface.sequelize.query(
      `INSERT INTO email_templates (id, name, subject, html, text, description, is_active, created_at, updated_at)
       VALUES (
         gen_random_uuid(),
         'patient_request_code',
         'Su médico le solicita documentos — código {{code}}',
         :html,
         NULL,
         'Código de acceso para portal de solicitudes al paciente',
         true,
         NOW(),
         NOW()
       )
       ON CONFLICT (name) DO NOTHING`,
      { replacements: { html } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name = 'patient_request_code'`,
    );
    await queryInterface.dropTable('patient_request_attachments');
    await queryInterface.dropTable('patient_request_access_codes');
    await queryInterface.dropTable('patient_requests');
  },
};
