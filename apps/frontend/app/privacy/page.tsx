import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Política de Privacidad — Delta Salud' };

interface PrivacyData {
  contentHtml: string;
  version: string;
  updatedAt: string;
}

/**
 * Privacy Policy — servido desde la base de datos (legal_documents, doc_type
 * 'privacy') vía GET /api/legal/privacy, igual que los Términos. Si el backend
 * no tiene contenido, cae al fallback estático de abajo.
 */
async function fetchPrivacy(): Promise<PrivacyData> {
  const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';
  try {
    const r = await fetch(`${BACKEND_URL}/api/legal/privacy`, { cache: 'no-store' });
    const json = (await r.json()) as {
      success?: boolean;
      data?: Partial<PrivacyData>;
    };
    if (!r.ok || !json?.success || !json.data) {
      return { contentHtml: '', version: '', updatedAt: '' };
    }
    return {
      contentHtml: json.data.contentHtml ?? '',
      version: json.data.version ?? '',
      updatedAt: json.data.updatedAt ?? '',
    };
  } catch {
    return { contentHtml: '', version: '', updatedAt: '' };
  }
}

function formatDate(rawDate: string): string {
  if (!rawDate) return 'Julio 2026';
  try {
    return new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(rawDate));
  } catch {
    return rawDate;
  }
}

export default async function PrivacyPage() {
  const privacy = await fetchPrivacy();
  const hasRealContent = privacy.contentHtml.trim().length > 0;
  const displayDate = formatDate(privacy.updatedAt);

  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Política de Privacidad</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Última actualización: {hasRealContent ? displayDate : 'Julio 2026'}
              </p>
            </div>
          </div>

          {hasRealContent ? (
            <div
              className="terms-page-content text-slate-700 text-sm leading-relaxed"
              /* contentHtml is TRUSTED content managed by our own admins/migrations */
              dangerouslySetInnerHTML={{ __html: privacy.contentHtml }}
            />
          ) : (
            /* Fallback estático mientras el backend no tenga contenido */
            <div className="prose prose-slate max-w-none space-y-4 text-slate-700">
              <p>
                En Delta Salud tomamos en serio la privacidad de los datos médicos de nuestros
                usuarios. Este documento describe cómo recopilamos, usamos y protegemos tu
                información.
              </p>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mt-6">
                  1. Información que recopilamos
                </h2>
                <p>
                  Recopilamos únicamente la información necesaria para proveer el servicio: datos de
                  identificación del especialista y paciente, historial clínico cargado por el
                  especialista, información de pagos para procesamiento de cobros.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mt-6">
                  2. Uso de la información
                </h2>
                <p>
                  La información se usa exclusivamente para permitir el funcionamiento del CRM, la
                  comunicación entre el especialista y el paciente, y la generación de reportes
                  financieros y clínicos.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mt-6">
                  3. Compartir información
                </h2>
                <p>
                  No compartimos tu información con terceros, salvo cuando sea requerido por ley o
                  autoridades competentes en Venezuela.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mt-6">4. Seguridad</h2>
                <p>
                  Implementamos múltiples capas de seguridad: cifrado en tránsito (HTTPS), cifrado
                  de datos sensibles, aislamiento por tenant, autenticación con tokens y respaldos
                  periódicos.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mt-6">5. Tus derechos</h2>
                <p>
                  Como usuario tienes derecho a acceder, rectificar y solicitar la eliminación de
                  tus datos personales. Para ejercer estos derechos, escríbenos a{' '}
                  <a href="mailto:hola@deltahealth.tech" className="text-teal-600 hover:underline">
                    hola@deltahealth.tech
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mt-6">
                  6. Integración con Google Calendar y Uso Limitado (Limited Use)
                </h2>
                <p>
                  La conexión con Google es <strong>opcional</strong>. Si el especialista decide
                  conectar su cuenta de Google, Delta Salud solicita acceso a los eventos de su
                  calendario (<code>calendar.events</code>) y a su dirección de correo (
                  <code>userinfo.email</code>) con el <strong>único fin</strong> de crear y
                  gestionar los eventos de las citas del especialista y generar enlaces de Google
                  Meet. No accedemos a ningún otro dato de Google ni a los calendarios de otros
                  usuarios.
                </p>
                <p>
                  El uso y la transferencia de la información recibida de las APIs de Google
                  Workspace se ajusta a la{' '}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 hover:underline"
                  >
                    Política de Datos de Usuario de los Servicios de API de Google
                  </a>
                  , incluyendo los requisitos de Uso Limitado (Limited Use).
                </p>
                <p className="text-sm text-slate-500 italic">
                  The use of information received from Google APIs will adhere to the{' '}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 hover:underline"
                  >
                    Google API Services User Data Policy
                  </a>
                  , including the Limited Use requirements.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-900 mt-6">
                  7. Uso de Inteligencia Artificial
                </h2>
                <p>
                  Algunas funciones opcionales —transcripción del audio de la consulta dictado por
                  el especialista, mejora de redacción y resumen del historial clínico— utilizan la
                  API de Google Gemini bajo un plan de <strong>pago (pay‑as‑you‑go)</strong>, cuyos
                  términos establecen que Google{' '}
                  <strong>no utiliza los datos enviados para entrenar ni mejorar</strong> sus
                  modelos de inteligencia artificial.
                </p>
                <p>
                  Los datos obtenidos de las APIs de Google Workspace (Google Calendar){' '}
                  <strong>nunca</strong> se transfieren a servicios de inteligencia artificial ni se
                  utilizan para crear, entrenar o mejorar modelos de IA o aprendizaje automático.
                  Las funciones de IA operan exclusivamente sobre el contenido clínico que el
                  especialista introduce en la consulta, de forma completamente aislada de la
                  integración con Google.
                </p>
              </section>

              <p className="text-sm text-slate-500 mt-8 pt-6 border-t border-slate-200">
                Esta política puede actualizarse. Te notificaremos por email ante cambios
                materiales.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
