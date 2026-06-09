'use strict';

/**
 * Migration: 20260608000001-email-templates
 *
 * Creates the `email_templates` table, which stores versioned email templates
 * keyed by a logical name (e.g. 'invoice', 'reminder', 'payment_approved').
 *
 * Templates contain placeholders in the form {{key}} that are replaced at
 * send time by the application-layer MailerService.
 *
 * Also seeds the initial `invoice` template so the billing module can
 * immediately use it without requiring manual DB setup.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_templates', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      name: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      subject: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      html: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('email_templates', ['name'], {
      name: 'idx_email_templates_name',
    });

    // Seed: invoice template
    // Placeholders: {{invoiceNumber}}, {{amount}}, {{description}}, {{date}}, {{doctorName}}
    await queryInterface.bulkInsert('email_templates', [
      {
        id: queryInterface.sequelize.literal('gen_random_uuid()'),
        name: 'invoice',
        subject: 'Factura Delta Medical {{invoiceNumber}}',
        html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura {{invoiceNumber}}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: #1a73e8; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .invoice-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    .invoice-table th, .invoice-table td { text-align: left; padding: 10px 12px; font-size: 14px; }
    .invoice-table th { background: #f0f4ff; color: #1a73e8; font-weight: 600; }
    .invoice-table td { border-bottom: 1px solid #eee; }
    .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #1a73e8; border-bottom: none; }
    .footer { padding: 20px 32px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Factura de Suscripción</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{doctorName}}</strong>,</p>
      <p>Adjuntamos el detalle de su factura correspondiente al servicio de plataforma Delta Medical.</p>
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Número de factura</td>
            <td>{{invoiceNumber}}</td>
          </tr>
          <tr>
            <td>Fecha de emisión</td>
            <td>{{date}}</td>
          </tr>
          <tr>
            <td>Descripción</td>
            <td>{{description}}</td>
          </tr>
          <tr class="total-row">
            <td>Total a pagar</td>
            <td>{{amount}}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top: 24px; font-size: 13px; color: #555;">
        Para cualquier consulta sobre esta factura, comuníquese con el equipo de soporte Delta Medical.
      </p>
    </div>
    <div class="footer">
      Delta Medical CRM &mdash; Sistema de Gestión Médica
    </div>
  </div>
</body>
</html>`,
        text: null,
        description: 'Factura de suscripción mensual emitida al médico',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_templates');
  },
};
