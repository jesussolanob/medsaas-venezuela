/**
 * app/doctor/standalone-documents/standalone-pdf.ts
 *
 * Builds the MedicalDocumentPdf input for a standalone document
 * (récipe / paraclínico / reposo WITHOUT a consultation).
 *
 * Data loading mirrors GenerateDocumentModal.tsx exactly:
 *   1. getDoctorProfile()       → doctor name / logo / signature / license
 *   2. loadTemplateConfigs()    → branding per doc type (recipe / reposo)
 *   Derives TemplateConfigPdf the same way ConsultationsClient.tsx does (~line 1120).
 *
 * Medication shape mapping (StandaloneDocument content → SavedPrescription):
 *   StandaloneDocument recipe content has `medications[]` with the same fields as
 *   MedicationTemplate (name, dose, route, frequency, duration, presentation, indications).
 *   SavedPrescription wraps a single array of those medications into one object with
 *   an id, notes, and created_at. We create a synthetic SavedPrescription so
 *   buildRecetasContent / buildRecipeHoja2Content can consume it without changes.
 *
 * PDF code placement: the standalone document code (REC-/PAR-/REP-YYYYMM-NNNN) is passed
 * as `consultationCode` to MedicalDocumentPdf. The PDF renders it in the header where the
 * consultation code normally appears — zero changes needed to MedicalDocumentPdf.
 *
 * Voided documents: the `displayCode` returned by this module includes " — ANULADO"
 * appended. Callers should pass that as the consultationCode prop so the header shows it.
 */

'use client';

import { getDoctorProfile } from '@/app/doctor/actions';
import { loadTemplateConfigs } from '@/app/doctor/templates/actions';
import type { TemplateConfigPdf, DoctorInfoPdf } from '@/components/pdf/MedicalDocumentPdf';
import {
  buildRecetasContent,
  buildRecipeHoja2Content,
  buildRestBlocks,
  type SavedPrescription,
  type RestData,
} from '@/app/doctor/consultations/consultation-documents';
import { buildParaclinicalContent } from '@/app/doctor/consultations/consultation-documents';
import type {
  StandaloneDocument,
  ReposoDocumentContent,
} from '@/app/doctor/standalone-documents/actions';
import type {
  RecipeTemplateContent,
  ParaclinicalTemplateContent,
} from '@/app/doctor/templates/content-actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StandalonePdfInput {
  docType: 'recipe' | 'paraclinical' | 'reposo';
  /** Code shown in the header (e.g. "REC-202610-0001" or "PAR-202610-0001 — ANULADO"). */
  displayCode: string;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  patientName: string;
  patientCedula: string | null;
  docDate: string;
  /** ContentBlock[] for the first page (recipe hoja 1 / paraclinical / reposo). */
  content: import('@/components/pdf/MedicalDocumentPdf').ContentBlock[];
  /** Only set for recipe — hoja 2 with detailed medication indications. */
  hoja2Content?: import('@/components/pdf/MedicalDocumentPdf').ContentBlock[];
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Loads doctor profile + template configs and derives TemplateConfigPdf.
 * Mirrors the pattern in ConsultationsClient.tsx ~line 1104-1157.
 */
export async function loadStandalonePdfDoctorData(): Promise<{
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
} | null> {
  const [profileData, templates] = await Promise.all([getDoctorProfile(), loadTemplateConfigs()]);

  if (!profileData) return null;

  const fullName = `${profileData.professionalTitle || ''} ${profileData.fullName || ''}`.trim();

  // Same cascade as ConsultationsClient.tsx ~line 1120:
  // specific template for the doc type → recipe template → first template → empty
  const recipeTemplate =
    templates['recipe'] ??
    templates['prescripciones'] ??
    templates[Object.keys(templates)[0] ?? ''] ??
    null;

  const templateConfig: TemplateConfigPdf = {
    header_text: recipeTemplate?.header_text || fullName || '',
    footer_text: recipeTemplate?.footer_text || '',
    primary_color: recipeTemplate?.primary_color || '#0891b2',
    font_family: recipeTemplate?.font_family || 'Helvetica',
    logo_url: recipeTemplate?.logo_url ?? profileData.logoUrl ?? null,
    signature_url: recipeTemplate?.signature_url ?? profileData.signatureUrl ?? null,
    show_logo: recipeTemplate?.show_logo !== false,
    show_signature: recipeTemplate?.show_signature !== false,
  };

  const doctor: DoctorInfoPdf = {
    fullName,
    specialty: profileData.specialty || '',
    licenseNumber: profileData.licenseNumber ?? null,
  };

  return { templateConfig, doctor };
}

// ---------------------------------------------------------------------------
// Content builders
// ---------------------------------------------------------------------------

/**
 * Converts a standalone document's content + metadata into StandalonePdfInput.
 * Caller must have already loaded doctor data via loadStandalonePdfDoctorData().
 */
export function buildStandalonePdfInput(
  doc: StandaloneDocument,
  doctorData: { templateConfig: TemplateConfigPdf; doctor: DoctorInfoPdf },
): StandalonePdfInput {
  const { type, code, status, content, patient, issuedAt, createdAt } = doc;
  const { templateConfig, doctor } = doctorData;

  const rawCode = code ?? 'BORRADOR';
  const displayCode = status === 'voided' ? `${rawCode} — ANULADO` : rawCode;

  const docDate = issuedAt ?? createdAt;

  const patientName = patient.fullName;
  const patientCedula = patient.cedula;

  let pageContent: import('@/components/pdf/MedicalDocumentPdf').ContentBlock[] = [];
  let hoja2Content: import('@/components/pdf/MedicalDocumentPdf').ContentBlock[] | undefined;

  if (type === 'recipe') {
    // Map MedicationTemplate[] → SavedPrescription (synthetic wrapper)
    // MedicationTemplate has: name, dose, route, frequency, duration, presentation, indications
    // SavedPrescription.medications has the same fields (route/presentation optional)
    const rc = content as RecipeTemplateContent;
    const syntheticPrescription: SavedPrescription = {
      id: 'standalone',
      medications: rc.medications.map((m) => ({
        name: m.name,
        dose: m.dose,
        route: m.route,
        frequency: m.frequency,
        duration: m.duration,
        presentation: m.presentation,
        indications: m.indications,
      })),
      notes: rc.notes || null,
      created_at: createdAt,
    };
    pageContent = buildRecetasContent([syntheticPrescription]);
    hoja2Content = buildRecipeHoja2Content([syntheticPrescription]);
  } else if (type === 'paraclinical') {
    const pc = content as ParaclinicalTemplateContent;
    pageContent = buildParaclinicalContent(pc.items);
  } else {
    // reposo
    const rc = content as ReposoDocumentContent;
    const restData: RestData = {
      diagnosis: rc.diagnosis,
      days: rc.days,
      from: rc.from,
      to: rc.to,
      comments: rc.comments,
    };
    pageContent = buildRestBlocks(restData);
  }

  return {
    docType: type,
    displayCode,
    templateConfig,
    doctor,
    patientName,
    patientCedula,
    docDate,
    content: pageContent,
    hoja2Content: hoja2Content && hoja2Content.length > 0 ? hoja2Content : undefined,
  };
}

// ---------------------------------------------------------------------------
// PDF download trigger (client-only, imported dynamically in event handlers)
// ---------------------------------------------------------------------------

/**
 * Generates a PDF blob for a standalone document and triggers a browser download.
 * Call only from click handlers (not render); uses dynamic import to avoid SSR.
 */
export async function downloadStandalonePdf(input: StandalonePdfInput): Promise<void> {
  const { pdf } = await import('@react-pdf/renderer');
  const { MedicalDocumentPdf } = await import('@/components/pdf/MedicalDocumentPdf');

  const typeLabels: Record<StandalonePdfInput['docType'], string> = {
    recipe: 'Récipe',
    paraclinical: 'Paraclínicos',
    reposo: 'Reposo',
  };

  const useDocuments = input.hoja2Content
    ? [
        { docType: input.docType, content: input.content },
        { docType: input.docType, content: input.hoja2Content },
      ]
    : undefined;

  const element = (
    <MedicalDocumentPdf
      docType={input.docType}
      templateConfig={input.templateConfig}
      doctor={input.doctor}
      patient={{ fullName: input.patientName, cedula: input.patientCedula }}
      docDate={input.docDate}
      consultationCode={input.displayCode}
      content={input.content}
      documents={useDocuments}
    />
  );

  const blob = await pdf(element).toBlob();
  const safeCode = input.displayCode.replace(/[^\w-]/g, '_');
  const label = typeLabels[input.docType];
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${label}-${safeCode}.pdf`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}
