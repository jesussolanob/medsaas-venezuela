'use client';

/**
 * components/pdf/TemplatePdfPreview.tsx
 *
 * Preview PDF real + botón de descarga para la página /doctor/templates.
 * Usa datos de EJEMPLO para que el doctor vea cómo queda su plantilla configurada.
 *
 * PDFViewer y PDFDownloadLink se cargan solo en el cliente (dynamic ssr:false).
 * El componente recibe la config del template activo y los datos del doctor.
 * Muestra un indicador "Cargando vista previa…" mientras react-pdf genera el PDF.
 *
 * Estrategia de loading:
 *   - La prop `loading` del dynamic de PDFViewer ya muestra un spinner (PdfLoadingPlaceholder).
 *   - El componente padre puede pasar onReady() para ocultar su propio indicador.
 *     Se invoca tras un pequeño delay que da tiempo al viewer a pintar su primer frame.
 */

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Download, FileText } from 'lucide-react';
import type { TemplateConfigPdf, DoctorInfoPdf, ContentBlock } from './MedicalDocumentPdf';
// MedicalDocumentPdf se importa estáticamente: este módulo ya es client-only
// (cargado vía dynamic ssr:false desde la página), así que react-pdf recibe un
// elemento real — no un lazy/Suspense que su reconciler no puede resolver.
import { MedicalDocumentPdf } from './MedicalDocumentPdf';

// PDFViewer y PDFDownloadLink sí usan dynamic para diferir la carga inicial
// (son pesados); el documento que se les pasa es siempre un elemento real.
const PDFViewer = dynamic(() => import('@react-pdf/renderer').then((mod) => mod.PDFViewer), {
  ssr: false,
  loading: () => <PdfLoadingPlaceholder />,
});

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => null },
);

// ---------------------------------------------------------------------------
// Placeholder mientras carga react-pdf
// ---------------------------------------------------------------------------

function PdfLoadingPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3 bg-slate-50 rounded-xl border border-slate-200">
      <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      <p className="text-sm text-slate-500">Cargando vista previa del PDF...</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloques de ejemplo por tipo de documento
// ---------------------------------------------------------------------------

function getSampleContent(docType: string, doctorName: string): ContentBlock[] {
  const samplePatient = 'Juan Pérez';
  switch (docType) {
    case 'recipe':
    case 'receta':
      return [
        {
          key: 'medications',
          label: 'Medicamentos',
          value: [
            'Omeprazol 20mg — 1 cada 12 horas por 14 días',
            'Metoclopramida 10mg — 1 tableta antes de cada comida por 7 días',
            'Sucralfato 1g — disolver en agua, tomar 1 hora antes de las comidas',
          ],
        },
        {
          key: 'indications',
          label: 'Indicaciones',
          value:
            'Tomar los medicamentos con abundante agua. Evitar alimentos irritantes (picantes, ácidos, frituras). Consultar si los síntomas persisten después de 72 horas.',
        },
      ];

    case 'prescripciones':
    case 'requested_exams':
      return [
        {
          key: 'exams',
          label: 'Exámenes solicitados',
          value: [
            'Hematología completa (hemograma)',
            'Perfil hepático (AST, ALT, FA, GGT, Bilirrubinas)',
            'Ecografía abdominal superior',
            'Coprológico seriado x 3 muestras',
          ],
        },
        {
          key: 'notes',
          label: 'Observaciones',
          value:
            'Traer resultados en la próxima consulta. Ayuno de 8 horas para los estudios de sangre.',
        },
      ];

    case 'reposo':
    case 'rest':
      return [
        {
          key: 'content',
          label: 'Constancia',
          value: `Quien suscribe, ${doctorName || 'Dr. Nombre'}, hace constar que el/la paciente ${samplePatient}, portador de la cédula de identidad V-12.345.678, amerita reposo médico por un período de tres (3) días, a partir de la fecha de la presente constancia.\n\nDiagnóstico: Gastritis aguda con componente funcional.\n\nConstancia que se expide a solicitud de la parte interesada para los fines que estime convenientes.`,
        },
      ];

    case 'nutrition_plan':
      return [
        {
          key: 'plan',
          label: 'Plan nutricional',
          value: [
            'Desayuno: Avena con frutas frescas, yogur griego sin azúcar',
            'Almuerzo: Proteína magra + vegetales al vapor + carbohidrato complejo',
            'Merienda: Frutos secos (30g) o fruta entera',
            'Cena: Sopa de verduras o ensalada con proteína',
          ],
        },
        {
          key: 'restrictions',
          label: 'Restricciones',
          value:
            'Evitar azúcares refinados, frituras y bebidas carbonatadas. Ingesta de agua: mínimo 2 litros diarios.',
        },
      ];

    case 'exercises':
      return [
        {
          key: 'routine',
          label: 'Rutina recomendada',
          value: [
            'Caminata moderada: 30 minutos diarios, 5 veces por semana',
            'Ejercicios de estiramiento: 10 minutos al levantarse',
            'Natación o bicicleta estática: 3 veces por semana (opcional)',
          ],
        },
        {
          key: 'restrictions',
          label: 'Restricciones',
          value:
            'Evitar ejercicios de alto impacto por las próximas 4 semanas. Suspender actividad si aparece dolor torácico.',
        },
      ];

    case 'informe':
    default:
      return [
        {
          key: 'chief_complaint',
          label: 'Motivo de consulta',
          value:
            'Dolor abdominal recurrente en epigastrio, de tipo ardor, de 2 semanas de evolución, que empeora con el ayuno y mejora parcialmente con la ingesta de alimentos.',
        },
        {
          key: 'diagnosis',
          label: 'Diagnóstico',
          value:
            'Gastritis crónica con componente funcional (K29.5). Se descarta lesión orgánica significativa.',
        },
        {
          key: 'treatment',
          label: 'Tratamiento indicado',
          value:
            'Inhibidor de bomba de protones por 14 días, dieta blanda sin irritantes, control en 3 semanas. Si persiste sintomatología, se solicitará endoscopia digestiva alta.',
        },
        {
          key: 'next_steps',
          label: 'Próximos pasos',
          value:
            'Control en consulta externa en 3 semanas. Traer resultados de laboratorio solicitados.',
        },
      ];
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplatePdfPreviewProps {
  docType: string;
  docTypeLabel: string;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  /** Llamado cuando el PDFViewer termina de renderizar la primera página. */
  onReady?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplatePdfPreview({
  docType,
  docTypeLabel,
  templateConfig,
  doctor,
  onReady,
}: TemplatePdfPreviewProps) {
  // Notificar al padre tras un breve delay para que el viewer tenga tiempo de pintar.
  // No hay un callback nativo en PDFViewer para "primera página lista".
  useEffect(() => {
    const t = setTimeout(() => onReady?.(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sampleContent = getSampleContent(docType, doctor.fullName);

  const docProps = {
    docType,
    templateConfig,
    doctor,
    patient: { fullName: 'Juan Pérez (ejemplo)', cedula: 'V-12.345.678' },
    docDate: new Date().toISOString(),
    consultationCode: 'CONS-EJEMPLO',
    content: sampleContent,
  };

  // Human-readable filename using the document type label (no PII).
  const fileName = `Plantilla-${docTypeLabel.replace(/\s+/g, '-')}.pdf`;

  return (
    <div className="space-y-3">
      {/* Header de la sección */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-teal-500" />
          <span className="text-sm font-bold text-slate-700">
            Vista previa real — {docTypeLabel}
          </span>
        </div>

        {/* Botón de descarga */}
        <PDFDownloadLink
          document={<MedicalDocumentPdf {...docProps} />}
          fileName={fileName}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
        >
          {({ loading }) =>
            loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                Descargar ejemplo
              </>
            )
          }
        </PDFDownloadLink>
      </div>

      {/* Nota informativa */}
      <p className="text-[11px] text-slate-400 italic">
        La vista previa usa datos de ejemplo. Al descargar desde la consulta real, se incluyen los
        datos reales del paciente y el contenido del informe.
      </p>

      {/* Viewer embebido.
          El dynamic loading={() => <PdfLoadingPlaceholder />} ya muestra el spinner
          mientras react-pdf carga. Una vez listo, se reemplaza por el viewer real. */}
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <PDFViewer width="100%" height={520} showToolbar={false}>
          <MedicalDocumentPdf {...docProps} />
        </PDFViewer>
      </div>
    </div>
  );
}
