'use strict';

/**
 * Migration: 20260724000001-privacy-legal-document
 *
 * Seeds the Privacy Policy into `legal_documents` (doc_type='privacy') so that
 * /privacy is served from the database — consistent with Terms & Conditions
 * (doc_type='terms', seeded in 20260712000008). Idempotent: only inserts when no
 * current privacy document exists.
 *
 * Includes the Google Calendar (Limited Use) statement and the AI-usage
 * disclosure required for the Google OAuth verification of the Calendar
 * integration.
 *
 * @type {import('sequelize-cli').Migration}
 */

const PRIVACY_HTML = `<h1>Política de Privacidad</h1>
<p><em>Última actualización: Julio 2026</em></p>
<p>En Delta Salud tomamos en serio la privacidad de los datos médicos de nuestros usuarios. Este documento describe cómo recopilamos, usamos y protegemos tu información.</p>

<h2>1. Información que recopilamos</h2>
<p>Recopilamos únicamente la información necesaria para proveer el servicio: datos de identificación del especialista y del paciente, historial clínico cargado por el especialista, e información de pagos para el procesamiento de cobros.</p>

<h2>2. Uso de la información</h2>
<p>La información se usa exclusivamente para permitir el funcionamiento del CRM, la comunicación entre el especialista y el paciente, y la generación de reportes financieros y clínicos.</p>

<h2>3. Compartir información</h2>
<p>No compartimos tu información con terceros, salvo cuando sea requerido por ley o por autoridades competentes en Venezuela.</p>

<h2>4. Seguridad</h2>
<p>Implementamos múltiples capas de seguridad: cifrado en tránsito (HTTPS), cifrado de datos sensibles, aislamiento por tenant, autenticación con tokens y respaldos periódicos.</p>

<h2>5. Tus derechos</h2>
<p>Como usuario tienes derecho a acceder, rectificar y solicitar la eliminación de tus datos personales. Para ejercer estos derechos, escríbenos a <a href="mailto:hola@deltahealth.tech">hola@deltahealth.tech</a>.</p>

<h2>6. Integración con Google Calendar y Uso Limitado (Limited Use)</h2>
<p>La conexión con Google es <strong>opcional</strong>. Si el especialista decide conectar su cuenta de Google, Delta Salud solicita acceso a los eventos de su calendario (<code>calendar.events</code>) y a su dirección de correo (<code>userinfo.email</code>) con el <strong>único fin</strong> de crear y gestionar los eventos de las citas del especialista y generar enlaces de Google Meet. No accedemos a ningún otro dato de Google ni a los calendarios de otros usuarios.</p>
<p>El uso y la transferencia de la información recibida de las APIs de Google Workspace se ajusta a la <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de Datos de Usuario de los Servicios de API de Google</a>, incluyendo los requisitos de Uso Limitado (Limited Use).</p>
<p><em>The use of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</em></p>

<h2>7. Uso de Inteligencia Artificial</h2>
<p>Algunas funciones opcionales —transcripción del audio de la consulta dictado por el especialista, mejora de redacción y resumen del historial clínico— utilizan la API de Google Gemini bajo un plan de <strong>pago (pay-as-you-go)</strong>, cuyos términos establecen que Google <strong>no utiliza los datos enviados para entrenar ni mejorar</strong> sus modelos de inteligencia artificial.</p>
<p>Los datos obtenidos de las APIs de Google Workspace (Google Calendar) <strong>nunca</strong> se transfieren a servicios de inteligencia artificial ni se utilizan para crear, entrenar o mejorar modelos de IA o de aprendizaje automático. Las funciones de IA operan exclusivamente sobre el contenido clínico que el especialista introduce en la consulta, de forma completamente aislada de la integración con Google.</p>

<p>Esta política puede actualizarse. Te notificaremos por correo ante cambios materiales.</p>`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `INSERT INTO legal_documents (id, doc_type, version, content_html, is_current, created_at, updated_at)
       SELECT gen_random_uuid(), 'privacy', '2026-07', :contentHtml, true, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM legal_documents WHERE doc_type = 'privacy' AND is_current = true
       )`,
      { replacements: { contentHtml: PRIVACY_HTML } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM legal_documents WHERE doc_type = 'privacy'`,
    );
  },
};
