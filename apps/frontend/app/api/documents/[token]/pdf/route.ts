/**
 * GET /api/documents/[token]/pdf?sessionToken=...
 *
 * Ruta PÚBLICA (validada por sessionToken en QS, sin auth headers).
 * Obtiene los datos de renderizado del backend, los mapea a los helpers
 * de consultation-documents.ts y genera el PDF branded con MedicalDocumentPdf.
 *
 * Devuelve application/pdf con Content-Disposition: attachment.
 */

import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import type { TemplateConfigPdf, ContentBlock } from '@/components/pdf/MedicalDocumentPdf';
import {
  type DocumentTypeKey,
  type SavedPrescription,
  type EhrRecord,
  buildDocumentPages,
  INFORME_CHECKED_BY_DEFAULT,
} from '@/app/doctor/consultations/consultation-documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

// ─── Backend contract types ────────────────────────────────────────────────────

interface ConsultationBlock {
  key: string;
  label: string;
  printable: boolean;
  sortOrder: number;
}

interface DocSelection {
  types: string[];
  informeBlockKeys: string[];
  restContent?: string | null;
}

interface DocumentRenderData {
  sections: {
    report: boolean;
    prescriptions: boolean;
    ehr: boolean;
  };
  docSelection: DocSelection | null;
  consultation: {
    id: string;
    consultationCode: string;
    consultationDate: string;
    chiefComplaint: string | null;
    diagnosis: string | null;
    treatment: string | null;
    notes: string | null;
    blocksSnapshot: Record<string, unknown> | null;
  };
  consultationBlocks: ConsultationBlock[];
  patient: {
    fullName: string;
    cedula: string | null;
  };
  doctor: {
    fullName: string;
    professionalTitle: string | null;
    specialty: string | null;
    licenseNumber: string | null;
    logoUrl: string | null;
    signatureUrl: string | null;
  };
  prescriptions: Array<{
    id: string;
    medication: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    notes: string | null;
  }>;
  ehrRecords: Array<{
    id: string;
    diagnosis: string | null;
    treatmentPlan: string | null;
  }>;
  templateConfig: {
    headerText: string | null;
    footerText: string | null;
    primaryColor: string | null;
    fontFamily: string | null;
    showLogo: boolean;
    showSignature: boolean;
    logoUrl: string | null;
    signatureUrl: string | null;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convierte el blocksSnapshot en ContentBlock[] filtrando solo los bloques
 * imprimibles con contenido no vacío. Misma lógica que buildPdfContent de page.tsx.
 */
function buildInformeContent(
  consultationBlocks: ConsultationBlock[],
  blocksSnapshot: Record<string, unknown> | null,
): ContentBlock[] {
  const snap = blocksSnapshot ?? {};
  return consultationBlocks
    .filter((b) => b.printable !== false)
    .map((b) => {
      const raw = snap[b.key];
      let value: string | string[] | null = null;
      if (typeof raw === 'string') value = raw.trim() || null;
      else if (Array.isArray(raw)) value = (raw as string[]).filter(Boolean);
      else if (raw != null) value = String(raw);
      return { key: b.key, label: b.label, value };
    })
    .filter(
      (b) => b.value !== null && b.value !== '' && (!Array.isArray(b.value) || b.value.length > 0),
    );
}

/**
 * Mapea las prescripciones planas del backend a SavedPrescription[].
 */
function mapPrescriptions(prescriptions: DocumentRenderData['prescriptions']): SavedPrescription[] {
  return prescriptions.map((rx) => ({
    id: rx.id,
    medications: [
      {
        name: rx.medication,
        dose: rx.dosage ?? '',
        frequency: rx.frequency ?? '',
        duration: rx.duration ?? '',
        indications: rx.notes ?? '',
      },
    ],
    notes: rx.notes,
    created_at: '',
  }));
}

/**
 * Mapea los ehrRecords (historial del paciente) del backend a EhrRecord[].
 */
function mapEhrRecords(ehrRecords: DocumentRenderData['ehrRecords']): EhrRecord[] {
  return ehrRecords.map((r) => ({
    id: r.id,
    diagnosis: r.diagnosis,
    treatment_plan: r.treatmentPlan,
    created_at: '',
  }));
}

/**
 * Mapea la templateConfig del backend (camelCase) a TemplateConfigPdf (snake_case).
 */
function buildTemplateConfig(
  tc: DocumentRenderData['templateConfig'],
  doctor: DocumentRenderData['doctor'],
): TemplateConfigPdf {
  if (tc) {
    return {
      header_text: tc.headerText ?? doctor.fullName ?? '',
      footer_text: tc.footerText ?? '',
      primary_color: tc.primaryColor ?? '#0891b2',
      font_family: tc.fontFamily ?? 'Helvetica',
      logo_url: tc.logoUrl ?? doctor.logoUrl,
      signature_url: tc.signatureUrl ?? doctor.signatureUrl,
      show_logo: tc.showLogo,
      show_signature: tc.showSignature,
    };
  }
  return {
    header_text: doctor.fullName ?? '',
    footer_text: '',
    primary_color: '#0891b2',
    font_family: 'Helvetica',
    logo_url: doctor.logoUrl,
    signature_url: doctor.signatureUrl,
    show_logo: true,
    show_signature: true,
  };
}

/**
 * Deriva selectedTypes e informeBlockKeys desde sections (para documentos
 * compartidos con el flujo viejo que no tenía docSelection).
 */
function deriveSelectionFromSections(
  sections: DocumentRenderData['sections'],
  consultationBlocks: ConsultationBlock[],
): { selectedTypes: DocumentTypeKey[]; informeBlockKeys: string[] } {
  const selectedTypes: DocumentTypeKey[] = [];
  if (sections.report) selectedTypes.push('informe');
  if (sections.prescriptions) selectedTypes.push('recipe');
  if (sections.ehr) selectedTypes.push('history');

  // Defaults: chief_complaint, history, diagnosis si existen en consultationBlocks
  const defaultKeys = consultationBlocks
    .filter((b) => INFORME_CHECKED_BY_DEFAULT.has(b.key))
    .map((b) => b.key);

  return { selectedTypes, informeBlockKeys: defaultKeys };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const { searchParams } = new URL(req.url);
  const sessionToken = searchParams.get('sessionToken');

  if (!sessionToken) {
    return NextResponse.json({ error: 'sessionToken requerido' }, { status: 400 });
  }

  // 1. Fetch render data from backend
  let renderData: DocumentRenderData;
  try {
    const backendRes = await fetch(
      `${BACKEND_URL}/api/documents/${token}/render-data?sessionToken=${encodeURIComponent(sessionToken)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
    );

    if (!backendRes.ok) {
      let errorMsg = 'No se pudo obtener los datos del documento.';
      try {
        const errJson = (await backendRes.json()) as { message?: string; error?: string };
        errorMsg = errJson?.message ?? errJson?.error ?? errorMsg;
      } catch {
        /* ignore */
      }
      return NextResponse.json({ error: errorMsg }, { status: backendRes.status });
    }

    const envelope = (await backendRes.json()) as { success: boolean; data: DocumentRenderData };
    renderData = envelope.data;
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  // 2. Map data to helper inputs
  const informeContent = buildInformeContent(
    renderData.consultationBlocks,
    renderData.consultation.blocksSnapshot,
  );
  const savedPrescriptions = mapPrescriptions(renderData.prescriptions);
  const ehrRecords = mapEhrRecords(renderData.ehrRecords);

  // 3. Resolve doc selection
  let selectedTypes: DocumentTypeKey[];
  let informeSelectedBlockKeys: Set<string>;
  let restContent: string | null;

  if (renderData.docSelection) {
    selectedTypes = renderData.docSelection.types as DocumentTypeKey[];
    informeSelectedBlockKeys = new Set(renderData.docSelection.informeBlockKeys);
    restContent = renderData.docSelection.restContent ?? null;
  } else {
    // Backward-compat: old links without docSelection
    const derived = deriveSelectionFromSections(renderData.sections, renderData.consultationBlocks);
    selectedTypes = derived.selectedTypes;
    informeSelectedBlockKeys = new Set(derived.informeBlockKeys);
    restContent = null;
  }

  // 4. Build multi-page document (una Page por tipo; el récipe genera 2 hojas:
  //    "Récipe" con nombre+dosis y "Indicaciones" con los detalles completos).
  //    Antes se consolidaba todo en una sola hoja → el récipe compartido salía en
  //    1 hoja, distinto a la generación. Ahora comparte el mismo formato.
  const diagnosisRaw = informeContent.find((b) => b.key === 'diagnosis')?.value;
  const diagnosisValue = typeof diagnosisRaw === 'string' ? diagnosisRaw : undefined;

  const pages = buildDocumentPages({
    selectedTypes,
    informeSelectedBlockKeys,
    informeContent,
    savedPrescriptions,
    ehrRecords,
    restContent,
    diagnosisValue,
  });

  if (pages.length === 0) {
    return NextResponse.json(
      { error: 'No hay contenido disponible para generar el documento.' },
      { status: 422 },
    );
  }

  // 5. Map template config
  const tmpl = buildTemplateConfig(renderData.templateConfig, renderData.doctor);

  // 6. Render PDF server-side
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { MedicalDocumentPdf } = await import('@/components/pdf/MedicalDocumentPdf');

    const element = React.createElement(MedicalDocumentPdf, {
      docType: pages[0].docType,
      documents: pages,
      templateConfig: tmpl,
      doctor: {
        fullName: renderData.doctor.fullName,
        specialty: renderData.doctor.specialty,
        licenseNumber: renderData.doctor.licenseNumber,
      },
      patient: {
        fullName: renderData.patient.fullName,
        cedula: renderData.patient.cedula,
      },
      docDate: renderData.consultation.consultationDate,
      consultationCode: renderData.consultation.consultationCode,
      content: pages[0].content,
    });

    // renderToBuffer espera ReactElement<DocumentProps>; MedicalDocumentPdf
    // renderiza internamente un <Document> pero TS no lo infiere desde afuera.
    // Cast tipado (sin `any`) a la firma esperada por renderToBuffer.
    const buffer = await renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);

    // NextResponse espera BodyInit; slicear el ArrayBuffer del Buffer
    // para obtener un ArrayBuffer limpio que TypeScript acepte como BodyInit.
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );

    // Build a human-readable filename from the consultation code.
    // Avoid PII (cedula, full name) — consultation code is safe.
    const safeCode = renderData.consultation.consultationCode
      ? renderData.consultation.consultationCode.replace(/[^\w-]/g, '')
      : 'documento';
    const pdfFilename = `Documentos-${safeCode}.pdf`;

    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFilename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al generar el PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
