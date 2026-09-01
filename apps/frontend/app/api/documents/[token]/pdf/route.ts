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
import { parseRichHtml } from '@/lib/html-to-rich-text';
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
 *
 * Adicionalmente, inyecta bloques sintéticos para datos estructurados que NO
 * viven en blocksSnapshot sino en tablas propias del backend:
 *   - prescription  → lista compacta de medicamentos desde savedPrescriptions
 *   - paraclinical  → no disponible server-side todavía (ver nota abajo)
 *
 * Nota: el bloque `paraclinical` (exámenes ordenados) se persiste SOLO en
 * `blocks_snapshot` cuando el doctor llena el campo y guarda la consulta. Si el
 * valor está en blocksSnapshot se incluye automáticamente. Si no (lista todavía
 * no guardada al compartir), no se puede reconstruir server-side porque no hay
 * tabla de exámenes independiente hoy — queda como mejora futura en el backend.
 */
function buildInformeContent(
  consultationBlocks: ConsultationBlock[],
  blocksSnapshot: Record<string, unknown> | null,
  savedPrescriptions: ReturnType<typeof mapPrescriptions>,
): ContentBlock[] {
  const snap = blocksSnapshot ?? {};

  // Bloques del snapshot
  // ADR-039 rev.2: parse rich HTML to preserve formatting in the PDF.
  const snapshotBlocks = consultationBlocks
    .filter((b) => b.printable !== false)
    .map((b) => {
      const raw = snap[b.key];
      let value: string | string[] | null = null;
      let richValue: ContentBlock['richValue'] = undefined;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        value = trimmed || null;
        if (trimmed) {
          const rich = parseRichHtml(trimmed);
          if (rich.length > 0) richValue = rich;
        }
      } else if (Array.isArray(raw)) {
        value = (raw as string[]).filter(Boolean);
      } else if (raw != null) {
        value = String(raw);
      }
      return { key: b.key, label: b.label, value, ...(richValue ? { richValue } : {}) };
    })
    .filter(
      (b) => b.value !== null && b.value !== '' && (!Array.isArray(b.value) || b.value.length > 0),
    );

  // Si el bloque 'prescription' no tiene valor en el snapshot pero hay prescripciones
  // guardadas en BD, inyectarlo como lista compacta "nombre — dosis".
  const hasPrescriptionBlock = snapshotBlocks.some((b) => b.key === 'prescription');
  if (!hasPrescriptionBlock && savedPrescriptions.length > 0) {
    const rxItems: string[] = savedPrescriptions.flatMap((rx) =>
      rx.medications
        .filter((med) => (med.name ?? '').trim().length > 0)
        .map((med) => {
          const name = (med.name ?? '').trim();
          const dose = (med.dose ?? '').trim();
          return dose ? `${name} — ${dose}` : name;
        }),
    );
    if (rxItems.length > 0) {
      // Encontrar el label del bloque prescription en consultationBlocks (si existe)
      const prescBlock = consultationBlocks.find((b) => b.key === 'prescription');
      snapshotBlocks.push({
        key: 'prescription',
        label: prescBlock?.label ?? 'Prescripción',
        value: rxItems,
      });
    }
  }

  return snapshotBlocks;
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

/** Timeout para bajar imágenes de branding (logo/firma) antes de rendear. */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
/** Máximo tamaño aceptado para una imagen de branding (evita PDFs gigantes). */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Baja una imagen (logo/firma) desde su URL firmada de GCS y la devuelve como
 * data URI base64.
 *
 * POR QUÉ: el PDF compartido se rendea server-side con `renderToBuffer`. En ese
 * contexto `@react-pdf` NO embebe imágenes remotas de forma fiable (las omite en
 * silencio → PDFs sin logo ni firma, aunque la URL sea 200 desde el server). Un
 * data URI se embebe siempre, tanto client como server-side.
 *
 * Falla suave: cualquier error (timeout, no-2xx, no-imagen, muy grande) → null,
 * y el template cae al comportamiento previo (sin imagen) sin romper el render.
 */
async function imageUrlToDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_IMAGE_BYTES) return null;
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  const savedPrescriptions = mapPrescriptions(renderData.prescriptions);
  const informeContent = buildInformeContent(
    renderData.consultationBlocks,
    renderData.consultation.blocksSnapshot,
    savedPrescriptions,
  );
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

  // 5b. Prebajar logo/firma a data URI. `@react-pdf` server-side no embebe URLs
  //     remotas de forma fiable → sin esto el PDF compartido sale sin firma ni
  //     logo. Falla suave: si no se puede bajar, se deja la URL original.
  const [logoDataUri, signatureDataUri] = await Promise.all([
    tmpl.show_logo ? imageUrlToDataUri(tmpl.logo_url) : Promise.resolve(null),
    tmpl.show_signature ? imageUrlToDataUri(tmpl.signature_url) : Promise.resolve(null),
  ]);
  const tmplWithImages: TemplateConfigPdf = {
    ...tmpl,
    // No fallback to the raw URL on purpose — see the quotes PDF route for the
    // full rationale: imageUrlToDataUri guards timeout, Content-Type and size,
    // and handing the raw URL to @react-pdf re-fetches it server-side with none
    // of those guards. A missing logo beats a server-side request we don't control.
    logo_url: logoDataUri ?? null,
    signature_url: signatureDataUri ?? null,
  };

  // 6. Render PDF server-side
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { MedicalDocumentPdf } = await import('@/components/pdf/MedicalDocumentPdf');

    const element = React.createElement(MedicalDocumentPdf, {
      docType: pages[0].docType,
      documents: pages,
      templateConfig: tmplWithImages,
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
