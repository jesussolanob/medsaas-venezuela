/**
 * app/doctor/consultations/consultation-documents.ts
 *
 * Lógica pura reutilizable para el sistema de 5 tipos de documento.
 * Usada por GenerateDocumentModal y (en el futuro) por ShareDocumentsModal (#29).
 *
 * Sin imports de React — este módulo es agnóstico del entorno.
 */

import type { ContentBlock } from '@/components/pdf/MedicalDocumentPdf';

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
 * Keys de bloque que NO pertenecen al tipo "Informe médico" (van en otros tipos).
 */
export const INFORME_EXCLUDED_KEYS = new Set<string>([
  'prescription',
  'indications',
  'paraclinical',
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
 * Construye ContentBlock[] de recetas a partir de las prescripciones guardadas.
 */
export function buildRecetasContent(prescriptions: SavedPrescription[]): ContentBlock[] {
  return prescriptions
    .flatMap((rx, rxIdx) =>
      rx.medications.map((med, medIdx) => {
        const parts: string[] = [];
        if (med.dose) parts.push(`Dosis: ${med.dose}`);
        if (med.frequency) parts.push(`Frecuencia: ${med.frequency}`);
        if (med.duration) parts.push(`Duración: ${med.duration}`);
        if (med.indications) parts.push(`Indicaciones: ${med.indications}`);
        return {
          key: `rx-${rxIdx}-med-${medIdx}`,
          label: med.name || `Medicamento ${medIdx + 1}`,
          value: parts.length > 0 ? parts.join(' · ') : null,
        };
      }),
    )
    .filter((b): b is ContentBlock & { value: string } => b.value !== null);
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
 * Reglas:
 * - recipe:      hay savedPrescriptions, o el bloque 'prescription' o 'indications' tiene contenido
 * - paraclinical: el bloque 'paraclinical' tiene contenido
 * - history:     patientConsultationCount > 1
 * - rest:        restContent es no vacío
 * - informe:     hay al menos un bloque elegible (no excluido) con contenido
 */
export function computeAvailableDocTypes(
  args: ComputeAvailableDocTypesArgs,
): DocumentTypeDescriptor[] {
  const { informeContent, savedPrescriptions, patientEhrCount, restContent } = args;

  const blockByKey = new Map<string, ContentBlock>(informeContent.map((b) => [b.key, b]));

  const hasPrescriptionBlock = hasBlockContent(blockByKey.get('prescription'));
  const hasIndicationsBlock = hasBlockContent(blockByKey.get('indications'));
  const hasParaclinicalBlock = hasBlockContent(blockByKey.get('paraclinical'));

  const recipeEnabled =
    savedPrescriptions.length > 0 || hasPrescriptionBlock || hasIndicationsBlock;

  const informeBlocks = informeContent.filter((b) => !INFORME_EXCLUDED_KEYS.has(b.key));
  const informeEnabled = informeBlocks.length > 0;

  const recipeDescription =
    savedPrescriptions.length > 0
      ? `${savedPrescriptions.length} receta${savedPrescriptions.length !== 1 ? 's' : ''} guardada${savedPrescriptions.length !== 1 ? 's' : ''}`
      : hasPrescriptionBlock || hasIndicationsBlock
        ? 'Prescripción e indicaciones en la consulta'
        : 'Sin recetas ni indicaciones registradas';

  return [
    {
      key: 'recipe',
      label: 'Récipe e indicaciones',
      description: recipeDescription,
      enabled: recipeEnabled,
    },
    {
      key: 'paraclinical',
      label: 'Paraclínicos',
      description: hasParaclinicalBlock
        ? 'Exámenes y estudios paraclínicos indicados'
        : 'Sin paraclínicos registrados en esta consulta',
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
    {
      key: 'informe',
      label: 'Informe médico',
      description: informeEnabled
        ? `${informeBlocks.length} bloque${informeBlocks.length !== 1 ? 's' : ''} disponible${informeBlocks.length !== 1 ? 's' : ''}`
        : 'Sin bloques de consulta con contenido',
      enabled: informeEnabled,
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
}

/**
 * Arma el ContentBlock[] final con separadores de sección.
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
  } = args;

  const sections: Array<{ label: string; blocks: ContentBlock[] }> = [];

  if (selectedTypes.includes('recipe')) {
    const blocks: ContentBlock[] = [];
    const recetasBlocks = buildRecetasContent(savedPrescriptions);
    blocks.push(...recetasBlocks);

    const prescriptionBlock = informeContent.find((b) => b.key === 'prescription');
    if (hasBlockContent(prescriptionBlock)) blocks.push(prescriptionBlock!);

    const indicationsBlock = informeContent.find((b) => b.key === 'indications');
    if (hasBlockContent(indicationsBlock)) blocks.push(indicationsBlock!);

    if (blocks.length > 0) {
      sections.push({ label: 'Récipe e indicaciones', blocks });
    }
  }

  if (selectedTypes.includes('paraclinical')) {
    const block = informeContent.find((b) => b.key === 'paraclinical');
    if (hasBlockContent(block)) {
      sections.push({ label: 'Paraclínicos', blocks: [block!] });
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
