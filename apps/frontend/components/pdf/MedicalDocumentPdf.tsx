/**
 * components/pdf/MedicalDocumentPdf.tsx
 *
 * Componente PDF reutilizable para los documentos médicos del doctor.
 * Genera documentos de tipo: informe, receta, indicaciones, reposo, y cualquier
 * bloque printable (el docType es flexible — coincide con el template_type del doctor).
 *
 * SIEMPRE se debe importar con dynamic({ ssr: false }) desde un client component.
 * @react-pdf/renderer no soporta SSR; importarlo en un server component rompe el build.
 *
 * Props:
 *  - docType          : tipo de documento ('informe' | 'receta' | 'indicaciones' | string)
 *  - templateConfig   : config de plantilla del doctor (colores, logo, firma, textos)
 *  - doctor           : nombre, especialidad, matrícula (del perfil, no de la plantilla)
 *  - patient          : nombre y cédula del paciente
 *  - docDate          : fecha del documento (default: hoy)
 *  - consultationCode : código de la consulta (opcional)
 *  - content          : bloques de contenido del documento (clave → texto o lista)
 */

import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateConfigPdf {
  header_text: string;
  footer_text: string;
  primary_color: string;
  font_family: string;
  logo_url: string | null;
  signature_url: string | null;
  show_logo: boolean;
  show_signature: boolean;
}

export interface DoctorInfoPdf {
  fullName: string;
  specialty: string | null;
  licenseNumber: string | null;
}

export interface PatientInfoPdf {
  fullName: string;
  cedula: string | null;
}

/** Un bloque de contenido del documento. value puede ser texto libre, array de ítems, o null. */
export interface ContentBlock {
  key: string;
  label: string;
  value: string | string[] | null;
}

/** Una página del documento multi-página (una por tipo de documento). */
export interface DocumentPage {
  docType: string;
  content: ContentBlock[];
}

export interface MedicalDocumentPdfProps {
  docType: string;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  patient: PatientInfoPdf;
  docDate?: string;
  consultationCode?: string | null;
  content: ContentBlock[];
  /**
   * Cuando se pasa, el PDF tiene una página por entrada (una por tipo de
   * documento seleccionado). La prop `content` se ignora cuando `documents`
   * está presente. Mantener la firma actual para no romper usos existentes.
   */
  documents?: DocumentPage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mapeo de tipos de documento a etiquetas en español venezolano. */
const DOC_TYPE_LABELS: Record<string, string> = {
  informe: 'Informe Médico',
  recipe: 'Récipe',
  receta: 'Receta Médica',
  prescripciones: 'Prescripción Médica',
  // Hoja 2 del récipe — detalles completos por medicamento
  indications: 'Indicaciones',
  // legacy keys
  indicaciones: 'Indicaciones Médicas',
  reposo: 'Constancia de Reposo Médico',
  nutrition_plan: 'Plan Nutricional',
  exercises: 'Plan de Ejercicios',
  tasks: 'Tareas / Indicaciones',
  requested_exams: 'Exámenes Solicitados',
  paraclinical: 'Exámenes Paraclínicos',
  history: 'Historia Clínica',
  rest: 'Constancia de Reposo Médico',
  recommendations: 'Recomendaciones Médicas',
  diagnosis: 'Diagnóstico',
  treatment: 'Tratamiento',
};

function getDocLabel(docType: string): string {
  return DOC_TYPE_LABELS[docType] ?? docType.charAt(0).toUpperCase() + docType.slice(1);
}

/**
 * Resuelve la URL de una imagen (logo/firma) para que @react-pdf/renderer la
 * pueda cargar con fetch() en el navegador.
 *
 * 2026-07-08: se configuró **CORS en el bucket GCS** (`delta-files-...` permite
 * GET/HEAD desde deltasalud.app + la URL de Cloud Run), así que react-pdf puede
 * bajar la imagen **directo de GCS** — devolvemos la URL tal cual (sin salto extra).
 *
 * El proxy BFF `/api/storage/image-proxy` se DEJA en el repo como fallback: si el
 * CORS del bucket llegara a fallar, re-habilitarlo es descomentar la línea de abajo.
 */
function proxyGcsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Fallback (proxy): descomentar si se cae el CORS del bucket GCS.
  // if (url.startsWith('https://storage.googleapis.com/')) {
  //   return `/api/storage/image-proxy?url=${encodeURIComponent(url)}`;
  // }
  return url;
}

function formatDateVE(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

// ---------------------------------------------------------------------------
// Styles factory — recibe el color primario dinámicamente
// ---------------------------------------------------------------------------

function makeStyles(primaryColor: string) {
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      backgroundColor: '#ffffff',
      paddingTop: 40,
      paddingBottom: 60,
      paddingHorizontal: 44,
    },

    // -- Header --
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingBottom: 14,
      borderBottomWidth: 3,
      borderBottomColor: primaryColor,
      marginBottom: 18,
      gap: 16,
    },
    headerLeft: {
      flex: 1,
    },
    headerRight: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    logo: {
      width: 72,
      height: 40,
      objectFit: 'contain',
      marginBottom: 6,
    },
    headerTitle: {
      fontSize: 15,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      marginBottom: 2,
    },
    headerSubtitle: {
      fontSize: 8.5,
      color: '#64748b',
      marginBottom: 1,
    },
    docTypeLabel: {
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 4,
    },

    // -- Meta row (paciente / fecha / código) --
    metaRow: {
      flexDirection: 'row',
      gap: 24,
      backgroundColor: '#f8fafc',
      borderRadius: 6,
      padding: 10,
      marginBottom: 20,
    },
    metaItem: {
      flex: 1,
    },
    metaLabel: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    metaValue: {
      fontSize: 9.5,
      fontFamily: 'Helvetica-Bold',
      color: '#1e293b',
    },
    metaValueMono: {
      fontSize: 9,
      fontFamily: 'Courier',
      color: '#475569',
    },

    // -- Content blocks --
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 8,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 6,
      paddingBottom: 3,
      borderBottomWidth: 1,
      borderBottomColor: primaryColor,
      borderBottomStyle: 'solid',
    },
    sectionBody: {
      fontSize: 10,
      color: '#334155',
      lineHeight: 1.55,
    },
    listItem: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 5,
      alignItems: 'flex-start',
    },
    listBullet: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: primaryColor,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    listBulletText: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
    },
    listItemText: {
      fontSize: 9.5,
      color: '#334155',
      lineHeight: 1.45,
      flex: 1,
    },

    // -- Signature area --
    signatureArea: {
      marginTop: 28,
      borderTopWidth: 1,
      borderTopColor: '#e2e8f0',
      paddingTop: 16,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    },
    signatureBlock: {
      alignItems: 'center',
      minWidth: 160,
    },
    signatureImage: {
      width: 120,
      height: 50,
      objectFit: 'contain',
      marginBottom: 6,
    },
    signatureLine: {
      width: 140,
      height: 1.5,
      backgroundColor: '#94a3b8',
      marginBottom: 5,
    },
    signatureName: {
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      color: '#1e293b',
      textAlign: 'center',
    },
    signatureSpecialty: {
      fontSize: 8,
      color: '#64748b',
      textAlign: 'center',
      marginTop: 1,
    },
    signatureLicense: {
      fontSize: 7.5,
      color: '#94a3b8',
      textAlign: 'center',
      marginTop: 1,
    },

    // -- Footer --
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 44,
      right: 44,
      borderTopWidth: 1,
      borderTopColor: '#e2e8f0',
      paddingTop: 8,
    },
    footerText: {
      fontSize: 7.5,
      color: '#94a3b8',
      textAlign: 'center',
    },
    pageNumber: {
      fontSize: 7,
      color: '#cbd5e1',
      textAlign: 'right',
      marginTop: 3,
    },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared sub-components (used by both single-page and multi-page variants)
// ---------------------------------------------------------------------------

interface PageContentProps {
  styles: ReturnType<typeof makeStyles>;
  headerTitle: string;
  docLabel: string;
  formattedDate: string;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  patient: PatientInfoPdf;
  consultationCode?: string | null;
  visibleBlocks: ContentBlock[];
}

function PageContent({
  styles,
  headerTitle,
  docLabel,
  formattedDate,
  templateConfig,
  doctor,
  patient,
  consultationCode,
  visibleBlocks,
}: PageContentProps) {
  return (
    <>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {templateConfig.show_logo && templateConfig.logo_url ? (
            <Image
              src={proxyGcsUrl(templateConfig.logo_url) ?? templateConfig.logo_url}
              style={styles.logo}
            />
          ) : null}
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          {doctor.specialty ? <Text style={styles.headerSubtitle}>{doctor.specialty}</Text> : null}
          {doctor.licenseNumber ? (
            <Text style={styles.headerSubtitle}>M.P.P.S. {doctor.licenseNumber}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.docTypeLabel}>{docLabel}</Text>
        </View>
      </View>

      {/* ── META ROW ── */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Paciente</Text>
          <Text style={styles.metaValue}>{patient.fullName}</Text>
          {patient.cedula ? (
            <Text
              style={[styles.metaValue, { fontSize: 8, fontFamily: 'Helvetica', marginTop: 1 }]}
            >
              C.I. {patient.cedula}
            </Text>
          ) : null}
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Fecha</Text>
          <Text style={styles.metaValue}>{formattedDate}</Text>
        </View>
        {consultationCode ? (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>N° Consulta</Text>
            <Text style={styles.metaValueMono}>{consultationCode}</Text>
          </View>
        ) : null}
      </View>

      {/* ── CONTENT BLOCKS ── */}
      {visibleBlocks.length === 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionBody}>—</Text>
        </View>
      ) : (
        visibleBlocks.map((block) => (
          <View key={block.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{block.label}</Text>
            {Array.isArray(block.value) ? (
              block.value.map((item, idx) => (
                <View key={idx} style={styles.listItem}>
                  <View style={styles.listBullet}>
                    <Text style={styles.listBulletText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.listItemText}>{item}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.sectionBody}>{block.value}</Text>
            )}
          </View>
        ))
      )}

      {/* ── FIRMA ── */}
      {templateConfig.show_signature ? (
        <View style={styles.signatureArea}>
          <View style={styles.signatureBlock}>
            {templateConfig.signature_url ? (
              <Image
                src={proxyGcsUrl(templateConfig.signature_url) ?? templateConfig.signature_url}
                style={styles.signatureImage}
              />
            ) : (
              <View style={styles.signatureLine} />
            )}
            <Text style={styles.signatureName}>{doctor.fullName}</Text>
            {doctor.specialty ? (
              <Text style={styles.signatureSpecialty}>{doctor.specialty}</Text>
            ) : null}
            {doctor.licenseNumber ? (
              <Text style={styles.signatureLicense}>M.P.P.S. {doctor.licenseNumber}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ── FOOTER ── */}
      <View style={styles.footer} fixed>
        {templateConfig.footer_text ? (
          <Text style={styles.footerText}>{templateConfig.footer_text}</Text>
        ) : null}
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </View>
    </>
  );
}

export function MedicalDocumentPdf({
  docType,
  templateConfig,
  doctor,
  patient,
  docDate,
  consultationCode,
  content,
  documents,
}: MedicalDocumentPdfProps) {
  const primaryColor = templateConfig.primary_color || '#0891b2';
  const styles = makeStyles(primaryColor);
  const headerTitle = templateConfig.header_text || doctor.fullName || 'Delta Salud';
  const formattedDate = formatDateVE(docDate);

  /** Filtra bloques con contenido real. */
  function filterVisible(blocks: ContentBlock[]): ContentBlock[] {
    return blocks.filter((b) => {
      if (!b.value) return false;
      if (typeof b.value === 'string') return b.value.trim().length > 0;
      if (Array.isArray(b.value)) return b.value.length > 0;
      return true;
    });
  }

  // ── MODO MULTI-PÁGINA: una Page por tipo de documento ──────────────────
  if (documents && documents.length > 0) {
    const docTitle = documents.map((d) => getDocLabel(d.docType)).join(' + ');
    return (
      <Document
        title={`${docTitle} — ${patient.fullName}`}
        author={doctor.fullName}
        subject={docTitle}
        creator="Delta Salud"
      >
        {documents.map((doc, idx) => {
          const pageDocLabel = getDocLabel(doc.docType);
          const visibleBlocks = filterVisible(doc.content);
          return (
            <Page key={`${doc.docType}-${idx}`} size="A4" style={styles.page}>
              <PageContent
                styles={styles}
                headerTitle={headerTitle}
                docLabel={pageDocLabel}
                formattedDate={formattedDate}
                templateConfig={templateConfig}
                doctor={doctor}
                patient={patient}
                consultationCode={consultationCode}
                visibleBlocks={visibleBlocks}
              />
            </Page>
          );
        })}
      </Document>
    );
  }

  // ── MODO SINGLE-PÁGINA: comportamiento original ─────────────────────────
  const docLabel = getDocLabel(docType);
  const visibleBlocks = filterVisible(content);

  return (
    <Document
      title={`${docLabel} — ${patient.fullName}`}
      author={doctor.fullName}
      subject={docLabel}
      creator="Delta Salud"
    >
      <Page size="A4" style={styles.page}>
        <PageContent
          styles={styles}
          headerTitle={headerTitle}
          docLabel={docLabel}
          formattedDate={formattedDate}
          templateConfig={templateConfig}
          doctor={doctor}
          patient={patient}
          consultationCode={consultationCode}
          visibleBlocks={visibleBlocks}
        />
      </Page>
    </Document>
  );
}
