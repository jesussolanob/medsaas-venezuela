/**
 * app/doctor/consultations/consultation-documents.ts
 *
 * Lógica pura reutilizable para el sistema de 6 tipos de documento.
 * Usada por GenerateDocumentModal y ShareDocumentsModal (#29).
 *
 * Sin imports de React — este módulo es agnóstico del entorno.
 */

import type { ContentBlock, DocumentPage } from '@/components/pdf/MedicalDocumentPdf';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentTypeKey = 'recipe' | 'paraclinical' | 'history' | 'rest' | 'informe';

export interface DocumentTypeDescriptor {
  key: DocumentTypeKey;
  label: string;
  description: string;
  enabled: boolean;
}

export interface SavedPrescription {
  id: string;
  medications: Array<{
    name: string;
    dose: string;
    frequency: string;
    duration: string;
    indications: string;
    presentation?: string;
  }>;
  notes: string | null;
  created_at: string;
}

export interface EhrRecord {
  id: string;
  diagnosis: string | null;
  treatment_plan: string | null;
  created_at: string;
}

/** Argumentos para computeAvailableDocTypes */
export interface ComputeAvailableDocTypesArgs {
  informeContent: ContentBlock[];
  savedPrescriptions: SavedPrescription[];
  patientConsultationCount: number;
  /**
   * Cantidad de registros EHR del PACIENTE. La "Historia clínica" se habilita por
   * presencia real de EHR (su contenido), no por nº de consultas — evita generar un
   * documento vacío (422) cuando el paciente tiene consultas pero ningún registro EHR.
   */
  patientEhrCount: number;
  restContent: string | null;
}

/**
 * Keys de bloque que NO pertenecen al tipo "Informe médico" (van en sus propios tipos).
 * - prescription  → Récipe (diagnóstico + medicamentos en hoja 1; indicaciones en hoja 2)
 * - paraclinical / requested_exams → Paraclínicos
 * - rest → Reposo
 *
 * NOTA: 'indications' (ahora "Evaluación actual") SÍ va dentro del informe.
 * Ya no existe como documento suelto — su contenido de medicamentos pasó a la hoja 2 del récipe.
 */
export const INFORME_EXCLUDED_KEYS = new Set<string>([
  'prescription',
  'paraclinical',
  'requested_exams',
  'rest',
]);

/**
 * Keys de bloque del informe que arrancan marcados por defecto.
 */
export const INFORME_CHECKED_BY_DEFAULT = new Set<string>([
  'chief_complaint',
  'history',
  'diagnosis',
]);

// ─── Helpers públicos ─────────────────────────────────────────────────────────

/**
 * Inserta un bloque-título de sección (separador visual en el PDF).
 */
export function sectionHeader(label: string): ContentBlock {
  return {
    key: `section-header-${label.toLowerCase().replace(/\s+/g, '-')}`,
    label: `━━━  ${label}  ━━━`,
    value: ' ',
  };
}

/**
 * Construye ContentBlock[] para la HOJA 1 del récipe.
 * Incluye: nombre + dosis solamente (formato limpio de récipe venezolano).
 */
export function buildRecetasContent(prescriptions: SavedPrescription[]): ContentBlock[] {
  // Hoja 1 (Récipe): UN solo bloque "Medicamentos" con lista numerada de
  // "Nombre — dosis" (agrupados, como antes del split de 2 hojas), NO una sección
  // por medicamento.
  const items = prescriptions.flatMap((rx) =>
    rx.medications
      .filter((med) => (med.name ?? '').trim().length > 0)
      .map((med) =>
        [med.name, med.dose].filter((p): p is string => !!p && p.trim() !== '').join(' — '),
      ),
  );
  if (items.length === 0) return [];
  return [{ key: 'medicamentos', label: 'Medicamentos', value: items }];
}

/**
 * Construye ContentBlock[] para la HOJA 2 del récipe ("Indicaciones").
 * Por cada medicamento incluye: nombre + dosis + frecuencia + duración + indicaciones + presentación.
 * Esta hoja reemplaza al antiguo doc suelto "Indicaciones".
 */
export function buildRecipeHoja2Content(prescriptions: SavedPrescription[]): ContentBlock[] {
  // Hoja 2 ("Indicaciones"): UN solo bloque "Medicamentos" con lista numerada;
  // cada item = nombre + dosis + frecuencia + duración + presentación + indicación
  // (agrupados, mismo formato que antes; NO una sección por medicamento).
  const items = prescriptions.flatMap((rx) =>
    rx.medications
      .filter((med) => (med.name ?? '').trim().length > 0)
      .map((med) =>
        [med.name, med.dose, med.frequency, med.duration, med.presentation, med.indications]
          .filter((p): p is string => !!p && p.trim() !== '')
          .join(' — '),
      ),
  );
  if (items.length === 0) return [];
  return [{ key: 'medicamentos-detalle', label: 'Medicamentos', value: items }];
}

/**
 * Construye ContentBlock[] para el documento "Indicaciones":
 *  (a) Bloque con las instrucciones/recomendaciones al paciente (del campo 'indications').
 *  (b) Referencia de medicamentos con nombre + indicación por medicamento.
 *
 * NO incluye diagnóstico (eso va en Récipe).
 */
export function buildIndicationsContent(
  indicationsBlock: ContentBlock | undefined,
  prescriptions: SavedPrescription[],
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // (a) Instrucciones al paciente del bloque 'indications'
  if (indicationsBlock?.value) {
    const val = indicationsBlock.value;
    const hasContent = Array.isArray(val) ? val.length > 0 : val.trim().length > 0;
    if (hasContent) {
      blocks.push({
        key: 'indications-instructions',
        label: indicationsBlock.label || 'Indicaciones al paciente',
        value: val,
      });
    }
  }

  // (b) Referencia de medicamentos (nombre + indicación por medicamento)
  const medRefBlocks: ContentBlock[] = prescriptions
    .flatMap((rx, rxIdx) =>
      rx.medications.map((med, medIdx) => {
        const parts: string[] = [];
        if (med.dose) parts.push(`Dosis: ${med.dose}`);
        if (med.frequency) parts.push(`Frecuencia: ${med.frequency}`);
        if (med.duration) parts.push(`Duración: ${med.duration}`);
        if (med.indications) parts.push(`Indicación: ${med.indications}`);
        return {
          key: `ind-med-${rxIdx}-${medIdx}`,
          label: med.name || `Medicamento ${medIdx + 1}`,
          value: parts.length > 0 ? parts.join(' · ') : null,
        };
      }),
    )
    .filter((b): b is ContentBlock & { value: string } => b.value !== null);

  if (medRefBlocks.length > 0) {
    blocks.push(sectionHeader('Medicamentos prescritos'), ...medRefBlocks);
  }

  return blocks;
}

/**
 * Construye ContentBlock[] de historia clínica a partir de los registros EHR.
 */
export function buildEhrContent(records: EhrRecord[]): ContentBlock[] {
  return records.flatMap((r, idx) => {
    const blocks: ContentBlock[] = [];
    if (r.diagnosis?.trim()) {
      blocks.push({
        key: `ehr-diag-${idx}`,
        label: `Diagnóstico${records.length > 1 ? ` #${idx + 1}` : ''}`,
        value: r.diagnosis.trim(),
      });
    }
    if (r.treatment_plan?.trim()) {
      blocks.push({
        key: `ehr-plan-${idx}`,
        label: `Plan terapéutico${records.length > 1 ? ` #${idx + 1}` : ''}`,
        value: r.treatment_plan.trim(),
      });
    }
    return blocks;
  });
}

// ─── Utilidades internas ──────────────────────────────────────────────────────

/**
 * Comprueba si un ContentBlock tiene contenido no vacío.
 * Soporta value: string | string[] | null.
 */
function hasBlockContent(block: ContentBlock | undefined): boolean {
  if (!block) return false;
  if (block.value === null || block.value === undefined) return false;
  if (Array.isArray(block.value)) return block.value.length > 0;
  return block.value.trim().length > 0;
}

// ─── Función pura: tipos disponibles ─────────────────────────────────────────

/**
 * Determina qué tipos de documento están disponibles (enabled) para la consulta actual.
 *
 * Reglas (separación clara por tipo):
 * - recipe:       savedPrescriptions con medicamentos → 2 hojas (Récipe + Indicaciones)
 * - paraclinical: el bloque 'paraclinical' O 'requested_exams' tiene contenido
 * - history:      patientEhrCount > 0
 * - rest:         restContent es no vacío
 * - informe:      hay al menos un bloque elegible (no excluido) con contenido
 *
 * Orden mostrado: Informe, Récipe, Paraclínicos, Historia, Reposo.
 * NOTA: 'indications' ya no es un tipo de documento suelto — su contenido de medicamentos
 * va en la hoja 2 del récipe; el bloque de texto va dentro del informe.
 */
export function computeAvailableDocTypes(
  args: ComputeAvailableDocTypesArgs,
): DocumentTypeDescriptor[] {
  const { informeContent, savedPrescriptions, patientEhrCount, restContent } = args;

  const blockByKey = new Map<string, ContentBlock>(informeContent.map((b) => [b.key, b]));

  const hasPrescriptionBlock = hasBlockContent(blockByKey.get('prescription'));
  const hasParaclinicalBlock =
    hasBlockContent(blockByKey.get('paraclinical')) ||
    hasBlockContent(blockByKey.get('requested_exams'));

  // Récipe = medicamentos guardados O bloque prescription en blocks_data
  const recipeEnabled = savedPrescriptions.length > 0 || hasPrescriptionBlock;

  const informeBlocks = informeContent.filter((b) => !INFORME_EXCLUDED_KEYS.has(b.key));
  const informeEnabled = informeBlocks.length > 0;

  const totalMedCount = savedPrescriptions.flatMap((r) => r.medications).length;

  const recipeDescription =
    savedPrescriptions.length > 0
      ? `${totalMedCount} medicamento${totalMedCount !== 1 ? 's' : ''} · 2 hojas (Récipe + Indicaciones)`
      : hasPrescriptionBlock
        ? 'Prescripción en la consulta'
        : 'Sin receta registrada';

  return [
    {
      key: 'informe',
      label: 'Informe médico',
      description: informeEnabled
        ? `${informeBlocks.length} bloque${informeBlocks.length !== 1 ? 's' : ''} disponible${informeBlocks.length !== 1 ? 's' : ''}`
        : 'Sin bloques de consulta con contenido',
      enabled: informeEnabled,
    },
    {
      key: 'recipe',
      label: 'Récipe',
      description: recipeDescription,
      enabled: recipeEnabled,
    },
    {
      key: 'paraclinical',
      label: 'Paraclínicos',
      description: hasParaclinicalBlock
        ? 'Exámenes y estudios paraclínicos solicitados'
        : 'Sin exámenes paraclínicos registrados en esta consulta',
      enabled: hasParaclinicalBlock,
    },
    {
      key: 'history',
      label: 'Historia clínica',
      description:
        patientEhrCount > 0
          ? `${patientEhrCount} registro${patientEhrCount !== 1 ? 's' : ''} de historia clínica`
          : 'Sin registros de historia clínica (EHR) para este paciente',
      enabled: patientEhrCount > 0,
    },
    {
      key: 'rest',
      label: 'Reposo médico',
      description:
        restContent && restContent.trim().length > 0
          ? restContent.trim().slice(0, 60) + (restContent.trim().length > 60 ? '…' : '')
          : 'Sin reposo médico indicado',
      enabled: (restContent?.trim().length ?? 0) > 0,
    },
  ];
}

// ─── Argumentos para buildConsolidatedContent ─────────────────────────────────

export interface BuildConsolidatedContentArgs {
  /** Tipos de documento seleccionados por el doctor */
  selectedTypes: DocumentTypeKey[];
  /** Para 'informe': keys de bloque del sub-selector que están marcadas */
  informeSelectedBlockKeys: Set<string>;
  /** Todos los bloques de la consulta actual */
  informeContent: ContentBlock[];
  /** Recetas guardadas */
  savedPrescriptions: SavedPrescription[];
  /** Registros EHR ya fetchados (fetch asíncrono queda en el modal) */
  ehrRecords: EhrRecord[];
  /** Texto del reposo médico */
  restContent: string | null;
  /** Diagnóstico de la consulta — se incluye en el récipe */
  diagnosisValue?: string | null;
}

/**
 * Arma el ContentBlock[] final con separadores de sección.
 *
 * Separación de contenido por tipo:
 * - recipe:       diagnóstico + medicamentos (buildRecetasContent). SIN indicaciones ni exámenes.
 *                 La hoja 2 (Indicaciones) la arma buildDocumentPages directamente.
 * - paraclinical: bloque 'paraclinical' O 'requested_exams' (lista de exámenes solicitados).
 * - history:      registros EHR del paciente.
 * - rest:         constancia de reposo.
 * - informe:      bloques seleccionados del informe (excluye prescription/paraclinical/rest).
 *
 * El fetch de EHR es responsabilidad del caller; aquí solo se consume `ehrRecords`.
 */
export function buildConsolidatedContent(args: BuildConsolidatedContentArgs): ContentBlock[] {
  const {
    selectedTypes,
    informeSelectedBlockKeys,
    informeContent,
    savedPrescriptions,
    ehrRecords,
    restContent,
    diagnosisValue,
  } = args;

  const sections: Array<{ label: string; blocks: ContentBlock[] }> = [];

  if (selectedTypes.includes('recipe')) {
    const blocks: ContentBlock[] = [];

    // Diagnóstico al inicio del récipe
    if (diagnosisValue?.trim()) {
      blocks.push({ key: 'recipe-diagnosis', label: 'Diagnóstico', value: diagnosisValue.trim() });
    }

    // Solo nombre + dosis (hoja 1)
    const recetasBlocks = buildRecetasContent(savedPrescriptions);
    blocks.push(...recetasBlocks);

    // Fallback: si hay un bloque 'prescription' en blocks_data (sin receta guardada en BD)
    const prescriptionBlock = informeContent.find((b) => b.key === 'prescription');
    if (recetasBlocks.length === 0 && hasBlockContent(prescriptionBlock)) {
      blocks.push(prescriptionBlock!);
    }

    if (blocks.length > 0) {
      sections.push({ label: 'Récipe', blocks });
    }
  }

  if (selectedTypes.includes('paraclinical')) {
    // Acepta tanto 'paraclinical' como 'requested_exams'
    const block =
      informeContent.find((b) => b.key === 'paraclinical') ??
      informeContent.find((b) => b.key === 'requested_exams');
    if (hasBlockContent(block)) {
      sections.push({
        label: 'Exámenes solicitados',
        blocks: [{ ...block!, label: block!.label || 'Exámenes solicitados' }],
      });
    }
  }

  if (selectedTypes.includes('history')) {
    const ehrBlocks = buildEhrContent(ehrRecords);
    if (ehrBlocks.length > 0) {
      sections.push({ label: 'Historia clínica', blocks: ehrBlocks });
    }
  }

  if (selectedTypes.includes('rest') && restContent?.trim()) {
    sections.push({
      label: 'Reposo médico',
      blocks: [{ key: 'rest-content', label: 'Reposo médico', value: restContent.trim() }],
    });
  }

  if (selectedTypes.includes('informe')) {
    const informeBlocks = informeContent.filter(
      (b) => !INFORME_EXCLUDED_KEYS.has(b.key) && informeSelectedBlockKeys.has(b.key),
    );
    if (informeBlocks.length > 0) {
      sections.push({ label: 'Informe médico', blocks: informeBlocks });
    }
  }

  if (sections.length === 0) return [];

  const needsSeparators = sections.length > 1;
  const allBlocks: ContentBlock[] = [];

  for (const section of sections) {
    if (needsSeparators) allBlocks.push(sectionHeader(section.label));
    allBlocks.push(...section.blocks);
  }

  return allBlocks;
}

// ─── Argumentos para buildDocumentPages ───────────────────────────────────────

/**
 * Arma un array de DocumentPage (una página por tipo de documento seleccionado).
 *
 * Cuando el tipo es 'recipe' se generan DOS páginas:
 *   - Hoja 1 "Récipe": diagnóstico + nombre/dosis de medicamentos
 *   - Hoja 2 "Indicaciones": nombre + dosis + frecuencia + duración + presentación + indicación
 *
 * Tipos soportados: informe, recipe (2 hojas), paraclinical, history, rest.
 */
export function buildDocumentPages(args: BuildConsolidatedContentArgs): DocumentPage[] {
  const {
    selectedTypes,
    informeSelectedBlockKeys,
    informeContent,
    savedPrescriptions,
    ehrRecords,
    restContent,
    diagnosisValue,
  } = args;

  const pages: DocumentPage[] = [];

  if (selectedTypes.includes('informe')) {
    const informeBlocks = informeContent.filter(
      (b) => !INFORME_EXCLUDED_KEYS.has(b.key) && informeSelectedBlockKeys.has(b.key),
    );
    if (informeBlocks.length > 0) {
      pages.push({ docType: 'informe', content: informeBlocks });
    }
  }

  if (selectedTypes.includes('recipe')) {
    // ── Hoja 1: Récipe (diagnóstico + nombre + dosis) ──
    const hoja1Blocks: ContentBlock[] = [];
    if (diagnosisValue?.trim()) {
      hoja1Blocks.push({
        key: 'recipe-diagnosis',
        label: 'Diagnóstico',
        value: diagnosisValue.trim(),
      });
    }
    const recetasBlocks = buildRecetasContent(savedPrescriptions);
    hoja1Blocks.push(...recetasBlocks);
    // Fallback: bloque 'prescription' en blocks_data sin receta guardada en BD
    const prescriptionBlock = informeContent.find((b) => b.key === 'prescription');
    if (recetasBlocks.length === 0 && hasBlockContent(prescriptionBlock)) {
      hoja1Blocks.push(prescriptionBlock!);
    }
    if (hoja1Blocks.length > 0) {
      pages.push({ docType: 'recipe', content: hoja1Blocks });
    }

    // ── Hoja 2: Indicaciones (detalles completos por medicamento) ──
    if (savedPrescriptions.length > 0) {
      const hoja2Blocks = buildRecipeHoja2Content(savedPrescriptions);
      if (hoja2Blocks.length > 0) {
        pages.push({ docType: 'indications', content: hoja2Blocks });
      }
    }
  }

  if (selectedTypes.includes('paraclinical')) {
    const block =
      informeContent.find((b) => b.key === 'paraclinical') ??
      informeContent.find((b) => b.key === 'requested_exams');
    if (hasBlockContent(block)) {
      pages.push({
        docType: 'paraclinical',
        content: [{ ...block!, label: block!.label || 'Exámenes solicitados' }],
      });
    }
  }

  if (selectedTypes.includes('history')) {
    const ehrBlocks = buildEhrContent(ehrRecords);
    if (ehrBlocks.length > 0) {
      pages.push({ docType: 'history', content: ehrBlocks });
    }
  }

  if (selectedTypes.includes('rest') && restContent?.trim()) {
    pages.push({
      docType: 'rest',
      content: [{ key: 'rest-content', label: 'Reposo médico', value: restContent.trim() }],
    });
  }

  return pages;
}
