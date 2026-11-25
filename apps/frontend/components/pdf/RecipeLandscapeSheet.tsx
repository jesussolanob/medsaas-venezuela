/**
 * components/pdf/RecipeLandscapeSheet.tsx
 *
 * Renders one LETTER-landscape page split in half by a vertical dashed cut guide:
 *   LEFT  = Récipe   (medication name + dose, numbered)
 *   RIGHT = Indicaciones (medication details: name + dose + frequency + duration + …)
 *
 * The same header, patient meta, and signature appear on both halves so each
 * can be cut and stand alone.
 *
 * Usage: instantiated by MedicalDocumentPdf when templateConfig.page_orientation
 * === 'landscape' and the document set contains a 'recipe' page.
 *
 * MEDS_PER_LANDSCAPE_SHEET — constant governing how many medication items appear
 * per sheet before wrapping to the next landscape page. Keep it conservative so
 * long indication text (frequency + duration + presentation + indications) does
 * not overflow the right half.
 */

import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { TemplateConfigPdf, DoctorInfoPdf, PatientInfoPdf } from './MedicalDocumentPdf';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of medications shown per landscape sheet (both halves). */
export const MEDS_PER_LANDSCAPE_SHEET = 7;

/** Codes of standalone documents. */
const STANDALONE_CODE_RE = /^(REC|PAR|REP)-\d{6}-\d+$/;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function makeLandscapeStyles(primaryColor: string) {
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      backgroundColor: '#ffffff',
      paddingTop: 20,
      paddingBottom: 20,
      paddingHorizontal: 22,
      flexDirection: 'column',
    },
    bodyRow: {
      flexDirection: 'row',
      flex: 1,
    },

    // ── Half columns ──────────────────────────────────────────────────────
    half: {
      flex: 1,
      flexDirection: 'column',
      paddingHorizontal: 6,
    },
    halfLeft: {
      paddingLeft: 0,
      paddingRight: 8,
    },
    halfRight: {
      paddingLeft: 8,
      paddingRight: 0,
    },

    // ── Divider ───────────────────────────────────────────────────────────
    divider: {
      width: 1,
      borderLeftWidth: 1,
      borderLeftColor: '#94a3b8',
      borderLeftStyle: 'dashed',
      alignSelf: 'stretch',
    },

    // ── Header ────────────────────────────────────────────────────────────
    header: {
      paddingBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: primaryColor,
      marginBottom: 8,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginBottom: 5,
    },
    headerLeft: {
      flex: 1,
    },
    logo: {
      width: 52,
      height: 28,
      objectFit: 'contain',
      marginBottom: 4,
    },
    headerTitle: {
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      marginBottom: 1,
    },
    headerSubtitle: {
      fontSize: 6.5,
      color: '#64748b',
      marginBottom: 1,
    },
    docTypeLabel: {
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      textAlign: 'center',
    },

    // ── Meta row ──────────────────────────────────────────────────────────
    metaRow: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: '#f8fafc',
      borderRadius: 4,
      padding: 6,
      marginBottom: 10,
    },
    metaItem: {
      flex: 1,
    },
    metaLabel: {
      fontSize: 5.5,
      fontFamily: 'Helvetica-Bold',
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 1,
    },
    metaValue: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: '#1e293b',
    },
    metaValueMono: {
      fontSize: 6.5,
      fontFamily: 'Courier',
      color: '#475569',
    },

    // ── Content ───────────────────────────────────────────────────────────
    contentArea: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 6,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 5,
      paddingBottom: 2,
      borderBottomWidth: 1,
      borderBottomColor: primaryColor,
      borderBottomStyle: 'solid',
    },
    listItem: {
      flexDirection: 'row',
      gap: 5,
      marginBottom: 4,
      alignItems: 'flex-start',
    },
    listBullet: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: primaryColor,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    listBulletText: {
      fontSize: 5.5,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
    },
    listItemText: {
      fontSize: 7,
      color: '#334155',
      lineHeight: 1.4,
      flex: 1,
    },
    emptyLabel: {
      fontSize: 7,
      color: '#94a3b8',
      fontFamily: 'Helvetica-Oblique',
    },

    // ── Signature ─────────────────────────────────────────────────────────
    signatureArea: {
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: '#e2e8f0',
      paddingTop: 8,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
    },
    signatureBlock: {
      alignItems: 'center',
      minWidth: 110,
    },
    signatureImage: {
      width: 88,
      height: 36,
      objectFit: 'contain',
      marginBottom: 4,
    },
    signatureLine: {
      width: 100,
      height: 1,
      backgroundColor: '#94a3b8',
      marginBottom: 3,
    },
    signatureName: {
      fontSize: 8,
      fontFamily: 'Helvetica-Bold',
      color: '#1e293b',
      textAlign: 'center',
    },
    signatureSpecialty: {
      fontSize: 6.5,
      color: '#64748b',
      textAlign: 'center',
      marginTop: 1,
    },
    signatureLicense: {
      fontSize: 6,
      color: '#94a3b8',
      textAlign: 'center',
      marginTop: 1,
    },

    // ── Footer ────────────────────────────────────────────────────────────
    footerArea: {
      borderTopWidth: 1,
      borderTopColor: '#e2e8f0',
      paddingTop: 5,
      marginTop: 6,
    },
    footerText: {
      fontSize: 5.5,
      color: '#94a3b8',
      textAlign: 'center',
    },

    // ── Page number (single, bottom center of full page) ──────────────────
    pageNumberRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 4,
    },
    pageNumberText: {
      fontSize: 5.5,
      color: '#cbd5e1',
    },
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RecipeLandscapeSheetProps {
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  patient: PatientInfoPdf;
  formattedDate: string;
  consultationCode?: string | null;
  /** Medication items for the LEFT half (Récipe): "Name — Dose". */
  recipeItems: string[];
  /** Medication items for the RIGHT half (Indicaciones): "Name — Dose — Freq…". Empty = blank right. */
  indicationItems: string[];
  /** 1-based offset so bullet numbering continues across sheets (e.g. 8 for the second sheet). */
  itemOffset: number;
  /** True when this sheet is not the last one (more sheets follow). */
  hasNextSheet: boolean;
}

// ---------------------------------------------------------------------------
// Internal sub-component: HalfColumn
// ---------------------------------------------------------------------------

interface HalfColumnProps {
  styles: ReturnType<typeof makeLandscapeStyles>;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  patient: PatientInfoPdf;
  formattedDate: string;
  consultationCode?: string | null;
  docLabel: string;
  items: string[];
  itemOffset: number;
  isLeft: boolean;
}

function proxyGcsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url;
}

function HalfColumn({
  styles,
  templateConfig,
  doctor,
  patient,
  formattedDate,
  consultationCode,
  docLabel,
  items,
  itemOffset,
  isLeft,
}: HalfColumnProps) {
  const headerTitle = templateConfig.header_text || doctor.fullName || 'Delta Salud';

  return (
    <View style={[styles.half, isLeft ? styles.halfLeft : styles.halfRight]}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {templateConfig.show_logo && templateConfig.logo_url ? (
            <Image
              src={proxyGcsUrl(templateConfig.logo_url) ?? templateConfig.logo_url}
              style={styles.logo}
            />
          ) : null}
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            {doctor.specialty ? (
              <Text style={styles.headerSubtitle}>{doctor.specialty}</Text>
            ) : null}
            {doctor.licenseNumber ? (
              <Text style={styles.headerSubtitle}>M.P.P.S. {doctor.licenseNumber}</Text>
            ) : null}
          </View>
        </View>
        <Text style={styles.docTypeLabel}>{docLabel}</Text>
      </View>

      {/* ── META ROW ── */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Paciente</Text>
          <Text style={styles.metaValue}>{patient.fullName}</Text>
          {patient.cedula ? (
            <Text
              style={[styles.metaValue, { fontSize: 6, fontFamily: 'Helvetica', marginTop: 1 }]}
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
            <Text style={styles.metaLabel}>
              {STANDALONE_CODE_RE.test(consultationCode) ? 'N° Documento' : 'N° Consulta'}
            </Text>
            <Text style={styles.metaValueMono}>{consultationCode}</Text>
          </View>
        ) : null}
      </View>

      {/* ── CONTENT ── */}
      <View style={styles.contentArea}>
        <Text style={styles.sectionTitle}>Medicamentos</Text>

        {items.length === 0 ? (
          <Text style={styles.emptyLabel}>—</Text>
        ) : (
          items.map((item, idx) => (
            <View key={idx} style={styles.listItem}>
              <View style={styles.listBullet}>
                <Text style={styles.listBulletText}>{itemOffset + idx + 1}</Text>
              </View>
              <Text style={styles.listItemText}>{item}</Text>
            </View>
          ))
        )}
      </View>

      {/* ── SIGNATURE ── */}
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
      <View style={styles.footerArea}>
        {templateConfig.footer_text ? (
          <Text style={styles.footerText}>{templateConfig.footer_text}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// RecipeLandscapeSheet
// ---------------------------------------------------------------------------

export function RecipeLandscapeSheet({
  templateConfig,
  doctor,
  patient,
  formattedDate,
  consultationCode,
  recipeItems,
  indicationItems,
  itemOffset,
}: RecipeLandscapeSheetProps) {
  const primaryColor = templateConfig.primary_color || '#0891b2';
  const styles = makeLandscapeStyles(primaryColor);

  return (
    <Page size="LETTER" orientation="landscape" style={styles.page}>
      <View style={styles.bodyRow}>
        {/* ── LEFT HALF: Récipe ── */}
        <HalfColumn
          styles={styles}
          templateConfig={templateConfig}
          doctor={doctor}
          patient={patient}
          formattedDate={formattedDate}
          consultationCode={consultationCode}
          docLabel="RÉCIPE"
          items={recipeItems}
          itemOffset={itemOffset}
          isLeft={true}
        />

        {/* ── DIVIDER ── */}
        <View style={styles.divider} />

        {/* ── RIGHT HALF: Indicaciones ── */}
        <HalfColumn
          styles={styles}
          templateConfig={templateConfig}
          doctor={doctor}
          patient={patient}
          formattedDate={formattedDate}
          consultationCode={consultationCode}
          docLabel="INDICACIONES"
          items={indicationItems}
          itemOffset={itemOffset}
          isLeft={false}
        />
      </View>

      {/* ── PAGE NUMBER (centered below both halves) ── */}
      <View style={styles.pageNumberRow}>
        <Text
          style={styles.pageNumberText}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </View>
    </Page>
  );
}
