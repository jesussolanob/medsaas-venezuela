/**
 * components/pdf/QuotePdf.tsx
 *
 * PDF component for a Cotización / Presupuesto.
 *
 * Composition (per spec §5):
 *   - Header/footer/signature: pattern from MedicalDocumentPdf.tsx
 *   - Item table with zebra rows: pattern from SpecialistsReportPdf.tsx
 *   - Totals (USD + Bs): pattern from lib/receipt-pdf.ts
 *   - Branding: doctor_templates config (colors, logo, signature)
 *
 * ALWAYS import with dynamic({ ssr: false }) from client components.
 * For server-side rendering (PDF route handler), import directly — but
 * @react-pdf/renderer does NOT embed remote URLs server-side; use
 * imageUrlToDataUri() to pre-fetch logo and signature as data URIs first.
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteItemPdf {
  kind: 'service' | 'product';
  name: string;
  description: string;
  quantity: number;
  unit_price_usd: number;
  amount_usd: number;
}

export interface QuoteTemplatePdf {
  header_text: string;
  footer_text: string;
  primary_color: string;
  font_family: string;
  logo_url: string | null;
  signature_url: string | null;
  show_logo: boolean;
  show_signature: boolean;
}

export interface QuoteDoctorPdf {
  fullName: string;
  specialty: string | null;
  licenseNumber: string | null;
}

export interface QuotePdfProps {
  quoteNumber: string;
  status: string;
  validUntil: string | null;
  notes: string;
  subtotal_usd: number;
  discount_usd: number;
  total_usd: number;
  bcv_rate: number | null;
  total_bs: number | null;
  /** Date string "YYYY-MM-DD" or ISO timestamp. */
  created_at: string;
  items: QuoteItemPdf[];
  doctor: QuoteDoctorPdf;
  /** Recipient display name (patient or lead). */
  recipientName: string;
  templateConfig: QuoteTemplatePdf | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_COLOR = '#0891b2';

function usdFmt(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bsFmt(amount: number): string {
  return `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.split('T')[0] + 'T12:00:00');
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function buildStyles(primaryColor: string) {
  const LIGHT = '#f0fafb';

  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      backgroundColor: '#ffffff',
      paddingTop: 36,
      paddingBottom: 52,
      paddingHorizontal: 40,
      fontSize: 9,
      color: '#334155',
    },
    // -- Header --
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingBottom: 14,
      borderBottomWidth: 2,
      borderBottomColor: primaryColor,
      marginBottom: 16,
    },
    headerLogo: {
      width: 56,
      height: 56,
      objectFit: 'contain',
      borderRadius: 4,
    },
    headerLeft: {
      flex: 1,
      paddingRight: 12,
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: 'Helvetica-Bold',
      color: primaryColor,
      marginBottom: 2,
    },
    headerDoctorName: {
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
      color: '#1e293b',
    },
    headerSubtitle: {
      fontSize: 8,
      color: '#64748b',
      marginTop: 1,
    },
    headerRight: {
      alignItems: 'flex-end',
      minWidth: 120,
    },
    headerQuoteNumber: {
      fontSize: 12,
      fontFamily: 'Helvetica-Bold',
      color: '#1e293b',
    },
    headerStatusBadge: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
      backgroundColor: primaryColor,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 4,
      marginTop: 4,
      textTransform: 'uppercase',
    },
    headerDate: {
      fontSize: 7.5,
      color: '#94a3b8',
      marginTop: 3,
    },
    // -- Recipient & dates row --
    metaRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    metaCard: {
      flex: 1,
      backgroundColor: LIGHT,
      borderRadius: 5,
      padding: 9,
      borderLeftWidth: 3,
      borderLeftColor: primaryColor,
    },
    metaLabel: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 3,
    },
    metaValue: {
      fontSize: 9.5,
      fontFamily: 'Helvetica-Bold',
      color: '#1e293b',
    },
    metaValueSub: {
      fontSize: 8,
      color: '#64748b',
      marginTop: 1,
    },
    // -- Table --
    table: {
      width: '100%',
      marginBottom: 12,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: primaryColor,
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderRadius: 4,
      marginBottom: 1,
    },
    tableHeaderCell: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9',
    },
    tableRowEven: { backgroundColor: LIGHT },
    tableRowOdd: { backgroundColor: '#ffffff' },
    cell: { fontSize: 8, color: '#334155' },
    cellBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
    cellRight: { textAlign: 'right' },
    // Column widths
    colKind: { width: '8%' },
    colName: { width: '38%' },
    colQty: { width: '9%', textAlign: 'right' },
    colUnit: { width: '18%', textAlign: 'right' },
    colAmount: { width: '17%', textAlign: 'right' },
    // -- Totals --
    totalsContainer: {
      marginLeft: 'auto',
      width: 230,
      marginBottom: 16,
    },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9',
    },
    totalsLabel: { fontSize: 8, color: '#64748b' },
    totalsValue: { fontSize: 8, color: '#334155', fontFamily: 'Helvetica-Bold' },
    totalsFinalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 7,
      backgroundColor: primaryColor,
      paddingHorizontal: 10,
      borderRadius: 5,
      marginTop: 4,
    },
    totalsFinalLabel: {
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
    },
    totalsFinalValue: {
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      color: '#ffffff',
    },
    totalsBsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      paddingHorizontal: 10,
      backgroundColor: LIGHT,
      borderRadius: 3,
      marginTop: 3,
    },
    totalsBsLabel: { fontSize: 7.5, color: '#64748b' },
    totalsBsValue: { fontSize: 7.5, color: '#334155' },
    // -- Notes --
    notesSection: {
      marginBottom: 16,
      padding: 10,
      backgroundColor: '#f8fafc',
      borderRadius: 5,
      borderLeftWidth: 3,
      borderLeftColor: primaryColor,
    },
    notesSectionTitle: {
      fontSize: 7.5,
      fontFamily: 'Helvetica-Bold',
      color: '#64748b',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 5,
    },
    notesText: {
      fontSize: 8.5,
      color: '#475569',
      lineHeight: 1.5,
    },
    // -- Footer --
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: '#e2e8f0',
    },
    footerText: {
      fontSize: 7,
      color: '#94a3b8',
    },
    signature: {
      width: 80,
      height: 36,
      objectFit: 'contain',
    },
  });
}

// ---------------------------------------------------------------------------
// QuotePdf component
// ---------------------------------------------------------------------------

export default function QuotePdf({
  quoteNumber,
  status,
  validUntil,
  notes,
  subtotal_usd,
  discount_usd,
  total_usd,
  bcv_rate,
  total_bs,
  created_at,
  items,
  doctor,
  recipientName,
  templateConfig,
}: QuotePdfProps) {
  const color = templateConfig?.primary_color ?? DEFAULT_COLOR;
  const styles = buildStyles(color);
  const headerText = templateConfig?.header_text ?? doctor.fullName;
  const footerText = templateConfig?.footer_text ?? '';
  const showLogo = templateConfig?.show_logo !== false && !!templateConfig?.logo_url;
  const showSignature = templateConfig?.show_signature !== false && !!templateConfig?.signature_url;
  const logoUri = templateConfig?.logo_url ?? null;
  const signatureUri = templateConfig?.signature_url ?? null;

  const hasDiscount = discount_usd > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Presupuesto</Text>
            <Text style={styles.headerDoctorName}>{headerText}</Text>
            {doctor.specialty && <Text style={styles.headerSubtitle}>{doctor.specialty}</Text>}
            {doctor.licenseNumber && (
              <Text style={styles.headerSubtitle}>M.P.P.S. {doctor.licenseNumber}</Text>
            )}
          </View>

          <View style={styles.headerRight}>
            {showLogo && logoUri && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoUri} style={styles.headerLogo} />
            )}
            <Text style={styles.headerQuoteNumber}>{quoteNumber}</Text>
            <Text style={styles.headerStatusBadge}>{STATUS_LABELS[status] ?? status}</Text>
            <Text style={styles.headerDate}>{formatDate(created_at)}</Text>
          </View>
        </View>

        {/* Recipient + Dates meta row */}
        <View style={styles.metaRow}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Destinatario</Text>
            <Text style={styles.metaValue}>{recipientName}</Text>
          </View>
          {validUntil && (
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Vigencia</Text>
              <Text style={styles.metaValue}>{formatDate(validUntil)}</Text>
            </View>
          )}
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Emitido el</Text>
            <Text style={styles.metaValue}>{formatDate(created_at)}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colKind]}>Tipo</Text>
            <Text style={[styles.tableHeaderCell, styles.colName]}>Descripción</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Cant.</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>Precio unit.</Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>Monto</Text>
          </View>

          {/* Table rows */}
          {items.map((item, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <View
                key={idx}
                style={[styles.tableRow, isEven ? styles.tableRowEven : styles.tableRowOdd]}
              >
                <Text style={[styles.cell, styles.colKind]}>
                  {item.kind === 'service' ? 'Serv.' : 'Prod.'}
                </Text>
                <View style={styles.colName}>
                  <Text style={styles.cellBold}>{item.name}</Text>
                  {item.description ? (
                    <Text style={[styles.cell, { color: '#94a3b8', marginTop: 1 }]}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.cell, styles.colQty, styles.cellRight]}>
                  {item.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Text>
                <Text style={[styles.cell, styles.colUnit, styles.cellRight]}>
                  {usdFmt(item.unit_price_usd)}
                </Text>
                <Text style={[styles.cellBold, styles.colAmount, styles.cellRight]}>
                  {usdFmt(item.amount_usd)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{usdFmt(subtotal_usd)}</Text>
          </View>
          {hasDiscount && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Descuento</Text>
              <Text style={[styles.totalsValue, { color: '#ef4444' }]}>
                -{usdFmt(discount_usd)}
              </Text>
            </View>
          )}
          <View style={styles.totalsFinalRow}>
            <Text style={styles.totalsFinalLabel}>Total</Text>
            <Text style={styles.totalsFinalValue}>{usdFmt(total_usd)}</Text>
          </View>
          {total_bs !== null && bcv_rate !== null && (
            <View style={styles.totalsBsRow}>
              <Text style={styles.totalsBsLabel}>
                Equivalente Bs. (tasa{' '}
                {bcv_rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })})
              </Text>
              <Text style={styles.totalsBsValue}>{bsFmt(total_bs)}</Text>
            </View>
          )}
        </View>

        {/* Notes / Terms */}
        {notes && notes.trim().length > 0 && (
          <View style={styles.notesSection}>
            <Text style={styles.notesSectionTitle}>Condiciones y notas</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View>
            {footerText ? <Text style={styles.footerText}>{footerText}</Text> : null}
            <Text style={styles.footerText}>{quoteNumber}</Text>
          </View>
          {showSignature && signatureUri && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={signatureUri} style={styles.signature} />
          )}
        </View>
      </Page>
    </Document>
  );
}
