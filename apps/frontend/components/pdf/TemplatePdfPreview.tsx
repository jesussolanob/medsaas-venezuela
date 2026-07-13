'use client';

/**
 * components/pdf/TemplatePdfPreview.tsx
 *
 * Preview PDF real + botón de descarga para la página /doctor/templates.
 *
 * ARQUITECTURA (alineada con generación real):
 * Usa el MISMO pipeline que buildDocumentPages (consultation-documents.ts)
 * con datos de muestra, de modo que lo que el doctor ve en la preview
 * coincide exactamente con lo que se genera en la consulta.
 *
 * Por tipo de documento:
 * - informe      → documents=[{docType:'informe', content: bloques de muestra por key habilitado}]
 * - recipe       → documents=[hoja1(recipe) + hoja2(indications)] — igual que la consulta real
 * - paraclinical → documents=[{docType:'paraclinical', content:[exámenes de muestra]}]
 * - rest / reposo→ documents=[{docType:'rest', content:[constancia de muestra]}]
 * - recibo       → single-page con contenido de recibo de muestra
 * - otros        → documents=[{docType, content:[bloque genérico]}]
 *
 * Para 'informe' se recibe `enabledBlockKeys` con los keys reales del doctor,
 * y se genera un bloque de muestra por cada key, conservando el mismo orden.
 */

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Download, FileText } from 'lucide-react';
import type {
  TemplateConfigPdf,
  DoctorInfoPdf,
  ContentBlock,
  DocumentPage,
} from './MedicalDocumentPdf';
import { MedicalDocumentPdf } from './MedicalDocumentPdf';
import {
  buildRecetasContent,
  buildRecipeHoja2Content,
  type SavedPrescription,
} from '@/app/doctor/consultations/consultation-documents';

// PDFViewer y PDFDownloadLink se difieren (son pesados); el documento que se les
// pasa es siempre un elemento real ya que este módulo es client-only.
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
// Datos de muestra por key de bloque del informe
// ---------------------------------------------------------------------------

/**
 * Devuelve un ContentBlock de muestra para cada key de bloque del informe.
 * Cuando el doctor tiene bloques reales habilitados, se genera uno por key.
 */
function sampleBlockForKey(key: string, label: string): ContentBlock {
  const SAMPLES: Record<string, string | string[]> = {
    chief_complaint:
      'Dolor abdominal recurrente en epigastrio, de tipo ardor, de 2 semanas de evolución, que empeora con el ayuno.',
    history:
      'Paciente con antecedentes de gastritis. Cirugía de apendicitis en 2018. Sin alergias conocidas. No consume medicamentos de forma habitual.',
    physical_exam:
      'TA: 120/80 mmHg. FC: 72 lpm. FR: 16 rpm. T°: 36.8 °C. Abdomen blando, depresible, con leve dolor a la palpación en epigastrio. Sin defensa ni Blumberg.',
    diagnosis:
      'Gastritis crónica con componente funcional (K29.5). Se descarta lesión orgánica significativa.',
    treatment:
      'Inhibidor de bomba de protones por 14 días, dieta blanda sin irritantes, control en 3 semanas.',
    indications:
      'Tomar los medicamentos con abundante agua. Evitar alimentos irritantes (picantes, ácidos, frituras). Consultar si los síntomas persisten después de 72 horas.',
    recommendations:
      'Mantener dieta blanda. Hidratación adecuada (2 litros de agua al día). Evitar el estrés. Reposo relativo.',
    next_followup: 'Control en consulta externa en 3 semanas. Traer resultados de laboratorio.',
    prescription: [
      'Omeprazol 20mg — 1 cada 12 horas por 14 días',
      'Metoclopramida 10mg — 1 tableta antes de cada comida por 7 días',
    ],
    paraclinical: [
      'Hematología completa (hemograma)',
      'Perfil hepático (AST, ALT, FA, GGT, Bilirrubinas)',
      'Ecografía abdominal superior',
    ],
    requested_exams: [
      'Hematología completa (hemograma)',
      'Perfil metabólico completo',
      'Ecografía abdominal superior',
    ],
    rest: 'El/la paciente amerita reposo médico por un período de tres (3) días a partir de la fecha de la presente constancia. Diagnóstico: Gastritis aguda.',
    nutrition_plan: [
      'Desayuno: Avena con frutas frescas, yogur griego sin azúcar',
      'Almuerzo: Proteína magra + vegetales al vapor + carbohidrato complejo',
      'Cena: Sopa de verduras o ensalada con proteína',
    ],
    exercises: [
      'Caminata moderada: 30 minutos diarios, 5 veces por semana',
      'Ejercicios de estiramiento: 10 minutos al levantarse',
    ],
    tasks: [
      'Seguir el plan de medicación indicado',
      'Regresar a control en 3 semanas con resultados de laboratorio',
    ],
  };

  return {
    key,
    label,
    value: SAMPLES[key] ?? `Contenido de muestra para "${label}".`,
  };
}

// ---------------------------------------------------------------------------
// Datos de muestra para prescripciones (récipe de 2 hojas)
// ---------------------------------------------------------------------------

const SAMPLE_PRESCRIPTIONS: SavedPrescription[] = [
  {
    id: 'sample-rx-1',
    medications: [
      {
        name: 'Omeprazol',
        dose: '20 mg',
        route: 'Oral',
        frequency: '1 cada 12 horas',
        duration: '14 días',
        presentation: 'Cápsulas de 20 mg',
        indications: 'Tomar 30 minutos antes del desayuno y antes de la cena.',
      },
      {
        name: 'Metoclopramida',
        dose: '10 mg',
        route: 'Oral',
        frequency: '1 tableta antes de cada comida',
        duration: '7 días',
        presentation: 'Tabletas de 10 mg',
        indications: 'Tomar 15 minutos antes de las comidas principales.',
      },
      {
        name: 'Sucralfato',
        dose: '1 g',
        route: 'Oral',
        frequency: '1 hora antes de las comidas',
        duration: '21 días',
        presentation: 'Tabletas de 1 g',
        indications: 'Disolver en agua antes de ingerir.',
      },
    ],
    notes: 'Evitar alimentos irritantes durante el tratamiento.',
    created_at: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Datos de muestra para paraclínicos
// ---------------------------------------------------------------------------

const SAMPLE_PARACLINICAL_BLOCKS: ContentBlock[] = [
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
    value: 'Traer resultados en la próxima consulta. Ayuno de 8 horas para los estudios de sangre.',
  },
];

// ---------------------------------------------------------------------------
// Datos de muestra para reposo
// ---------------------------------------------------------------------------

const SAMPLE_REST_BLOCKS: ContentBlock[] = [
  {
    key: 'rest-diagnóstico',
    label: 'Diagnóstico',
    value: 'Gastritis aguda con componente funcional.',
  },
  {
    key: 'rest-duración',
    label: 'Días de reposo',
    value: 'Tres (3) días a partir de la fecha del presente documento.',
  },
  {
    key: 'rest-content',
    label: 'Constancia',
    value:
      'Quien suscribe hace constar que el/la paciente Juan Pérez, portador de la cédula de identidad V-12.345.678, amerita reposo médico por el período indicado. Constancia que se expide a solicitud de la parte interesada para los fines que estime convenientes.',
  },
];

// ---------------------------------------------------------------------------
// Datos de muestra para recibo
// ---------------------------------------------------------------------------

const SAMPLE_RECIBO_BLOCKS: ContentBlock[] = [
  { key: 'concepto', label: 'Concepto', value: 'Consulta médica — Plan Estándar' },
  {
    key: 'monto',
    label: 'Monto',
    value: 'USD 50,00  (Bs 2.350,00 | Tasa BCV: 47,00 Bs/$)',
  },
  { key: 'metodo', label: 'Método de pago', value: 'Pago Móvil — Ref: 12345678' },
  {
    key: 'fecha',
    label: 'Fecha de pago',
    value: new Intl.DateTimeFormat('es-VE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date()),
  },
];

// ---------------------------------------------------------------------------
// Función principal: arma DocumentPage[] por tipo — espeja buildDocumentPages
// ---------------------------------------------------------------------------

/**
 * Construye las páginas del documento de muestra usando el mismo pipeline
 * que buildDocumentPages (consultation-documents.ts).
 *
 * `enabledBlocks` — para docType 'informe', array de {key, label} de los
 * bloques habilitados del doctor (en orden). Cuando está vacío o ausente,
 * se usan los bloques del informe por defecto.
 */
function buildSampleDocuments(
  docType: string,
  enabledBlocks: Array<{ key: string; label: string }>,
): DocumentPage[] {
  // ── INFORME ──────────────────────────────────────────────────────────────
  if (docType === 'informe') {
    // Keys que NO van en el informe como bloques directos (tienen su propio
    // documento), pero sí pueden aparecer como sección dentro del informe
    // cuando el doctor los selecciona explícitamente.
    // Para la preview usamos solo los bloques "textuales" del informe.
    const SKIP_AS_MAIN_SECTION = new Set([
      'prescription',
      'rest',
      'paraclinical',
      'requested_exams',
    ]);

    const informeBlocks: ContentBlock[] =
      enabledBlocks.length > 0
        ? enabledBlocks
            .filter((b) => !SKIP_AS_MAIN_SECTION.has(b.key))
            .map((b) => sampleBlockForKey(b.key, b.label))
            .filter((b) => b.value !== null)
        : // Fallback cuando no se reciben bloques habilitados (retrocompat)
          [
            sampleBlockForKey('chief_complaint', 'Motivo de consulta'),
            sampleBlockForKey('diagnosis', 'Diagnóstico'),
            sampleBlockForKey('treatment', 'Tratamiento indicado'),
            sampleBlockForKey('next_followup', 'Próximos pasos'),
          ];

    if (informeBlocks.length === 0) {
      // Último recurso: al menos un bloque visible
      informeBlocks.push(sampleBlockForKey('diagnosis', 'Diagnóstico'));
    }

    return [{ docType: 'informe', content: informeBlocks }];
  }

  // ── RÉCIPE — 2 hojas (igual que buildDocumentPages) ──────────────────────
  if (docType === 'recipe' || docType === 'receta') {
    const hoja1Blocks = buildRecetasContent(SAMPLE_PRESCRIPTIONS);
    const hoja2Blocks = buildRecipeHoja2Content(SAMPLE_PRESCRIPTIONS);
    const pages: DocumentPage[] = [];
    if (hoja1Blocks.length > 0) {
      pages.push({ docType: 'recipe', content: hoja1Blocks });
    }
    if (hoja2Blocks.length > 0) {
      pages.push({ docType: 'indications', content: hoja2Blocks });
    }
    return pages;
  }

  // ── PARACLÍNICOS ──────────────────────────────────────────────────────────
  if (docType === 'paraclinical' || docType === 'prescripciones' || docType === 'requested_exams') {
    return [{ docType: 'paraclinical', content: SAMPLE_PARACLINICAL_BLOCKS }];
  }

  // ── REPOSO ────────────────────────────────────────────────────────────────
  if (docType === 'rest' || docType === 'reposo') {
    return [{ docType: 'rest', content: SAMPLE_REST_BLOCKS }];
  }

  // ── RECIBO ────────────────────────────────────────────────────────────────
  if (docType === 'recibo') {
    return [{ docType: 'recibo', content: SAMPLE_RECIBO_BLOCKS }];
  }

  // ── OTROS TIPOS (nutrition_plan, exercises, tasks, etc.) ──────────────────
  const genericBlock = sampleBlockForKey(
    docType,
    docType.charAt(0).toUpperCase() + docType.slice(1),
  );
  return [{ docType, content: [genericBlock] }];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplatePdfPreviewProps {
  docType: string;
  docTypeLabel: string;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  /**
   * Para docType === 'informe': lista de bloques habilitados del doctor en orden.
   * Se usa para que la preview del informe muestre exactamente las secciones
   * que tiene activas el doctor (igual que el PDF generado en la consulta).
   */
  enabledBlocks?: Array<{ key: string; label: string }>;
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
  enabledBlocks = [],
  onReady,
}: TemplatePdfPreviewProps) {
  // Notificar al padre tras un breve delay para que el viewer tenga tiempo de pintar.
  // No hay un callback nativo en PDFViewer para "primera página lista".
  useEffect(() => {
    const t = setTimeout(() => onReady?.(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Armar las páginas del documento usando el mismo pipeline que la consulta real
  const sampleDocuments = buildSampleDocuments(docType, enabledBlocks);

  const commonProps = {
    templateConfig,
    doctor,
    patient: { fullName: 'Juan Pérez (ejemplo)', cedula: 'V-12.345.678' },
    docDate: new Date().toISOString(),
    consultationCode: 'CONS-EJEMPLO',
  };

  // Human-readable filename using the document type label (no PII).
  const fileName = `Plantilla-${docTypeLabel.replace(/\s+/g, '-')}.pdf`;

  // El documento de muestra siempre usa el modo multi-página (documents prop)
  // para que coincida con el pipeline real incluso cuando solo hay 1 página.
  const pdfDocument = (
    <MedicalDocumentPdf
      {...commonProps}
      docType={sampleDocuments[0]?.docType ?? docType}
      content={sampleDocuments[0]?.content ?? []}
      documents={sampleDocuments}
    />
  );

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
          document={pdfDocument}
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

      {/* Indicador de páginas para el récipe */}
      {(docType === 'recipe' || docType === 'receta') && sampleDocuments.length > 1 && (
        <p className="text-[11px] text-teal-600 font-semibold">
          Este documento tiene {sampleDocuments.length} hojas — usa las flechas del visor para
          navegar entre ellas.
        </p>
      )}

      {/* Viewer embebido */}
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <PDFViewer width="100%" height={520} showToolbar={false}>
          {pdfDocument}
        </PDFViewer>
      </div>
    </div>
  );
}
