/**
 * components/pdf/SpecialistsReportPdf.tsx
 *
 * Documento PDF tabular de la lista de especialistas — para el super admin.
 * Página A4 landscape (tabla ancha), marca teal #0891b2.
 *
 * SIEMPRE importar con dynamic({ ssr: false }) desde un client component.
 * @react-pdf/renderer no soporta SSR.
 *
 * Props:
 *  - rows        : especialistas a incluir en el reporte
 *  - generatedAt : fecha/hora de generación (ISO string)
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecialistRow {
  id: string;
  full_name: string;
  email: string;
  cedula?: string | null;
  specialty?: string | null;
  plan?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
}

export interface SpecialistsReportPdfProps {
  rows: SpecialistRow[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateVE(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function formatGeneratedAt(dateStr: string): string {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function activityLabel(row: SpecialistRow): string {
  const days = daysSince(row.last_sign_in_at ?? row.created_at);
  if (days === null) return 'Sin actividad';
  if (days >= 14) return 'Inactivo';
  if (days >= 7) return 'Frío';
  return 'Activo';
}

function formatLastAccess(row: SpecialistRow): string {
  if (!row.last_sign_in_at) return 'Sin actividad';
  const d = new Date(row.last_sign_in_at);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function subscriptionLabel(status?: string | null): string {
  switch (status) {
    case 'active':
      return 'Activa';
    case 'trial':
      return 'Trial';
    case 'past_due':
      return 'Vencida';
    case 'suspended':
      return 'Suspendida';
    default:
      return status ?? '—';
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BRAND = '#0891b2';
const BRAND_LIGHT = '#e0f2fe';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 32,
  },

  // -- Header --
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 3,
    borderBottomColor: BRAND,
    marginBottom: 14,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: BRAND,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 8,
    color: '#64748b',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerBadge: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    backgroundColor: BRAND,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 7.5,
    color: '#94a3b8',
  },

  // -- Summary row --
  summary: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 5,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
  },
  summaryLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
  },

  // -- Table --
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BRAND,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: 1,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableRowEven: {
    backgroundColor: '#f8fafc',
  },
  tableRowOdd: {
    backgroundColor: '#ffffff',
  },
  cell: {
    fontSize: 7.5,
    color: '#334155',
  },
  cellMono: {
    fontSize: 7,
    fontFamily: 'Courier',
    color: '#475569',
  },
  cellBold: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
  },

  // Activity badges (inline color via style prop at render time)
  activityText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },

  // -- Footer --
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#94a3b8',
  },
  pageNumber: {
    fontSize: 7,
    color: '#cbd5e1',
  },
});

// ---------------------------------------------------------------------------
// Column definitions (widths must sum to 100%)
// ---------------------------------------------------------------------------

const COL_WIDTHS = {
  nombre: '17%',
  email: '17%',
  cedula: '9%',
  especialidad: '13%',
  plan: '7%',
  estado: '9%',
  vencimiento: '9%',
  ultimoAcceso: '10%',
  actividad: '9%',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpecialistsReportPdf({ rows, generatedAt }: SpecialistsReportPdfProps) {
  const total = rows.length;
  const activos = rows.filter((r) => {
    const d = daysSince(r.last_sign_in_at ?? r.created_at);
    return d !== null && d < 7;
  }).length;
  const frios = rows.filter((r) => {
    const d = daysSince(r.last_sign_in_at ?? r.created_at);
    return d !== null && d >= 7 && d < 14;
  }).length;
  const inactivos = rows.filter((r) => {
    const d = daysSince(r.last_sign_in_at ?? r.created_at);
    return d !== null && d >= 14;
  }).length;

  return (
    <Document
      title="Reporte de Especialistas — Delta Salud"
      author="Delta Salud"
      subject="Reporte tabular de especialistas"
      creator="Delta Salud"
    >
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        {/* ── HEADER ── */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Reporte de Especialistas</Text>
            <Text style={styles.headerSubtitle}>Delta Salud — Panel Administrador</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerBadge}>Super Admin</Text>
            <Text style={styles.headerDate}>Generado: {formatGeneratedAt(generatedAt)}</Text>
          </View>
        </View>

        {/* ── RESUMEN ── */}
        <View style={styles.summary} fixed>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>{total}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: '#047857' }]}>
            <Text style={styles.summaryLabel}>Activos</Text>
            <Text style={[styles.summaryValue, { color: '#047857' }]}>{activos}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: '#92400e' }]}>
            <Text style={styles.summaryLabel}>Fríos</Text>
            <Text style={[styles.summaryValue, { color: '#92400e' }]}>{frios}</Text>
          </View>
          <View style={[styles.summaryCard, { borderLeftColor: '#b91c1c' }]}>
            <Text style={styles.summaryLabel}>Inactivos</Text>
            <Text style={[styles.summaryValue, { color: '#b91c1c' }]}>{inactivos}</Text>
          </View>
        </View>

        {/* ── TABLE HEADER ── */}
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.nombre }]}>Nombre</Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.email }]}>Email</Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.cedula }]}>Cédula</Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.especialidad }]}>
            Especialidad
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.plan }]}>Plan</Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.estado }]}>Estado</Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.vencimiento }]}>
            Vencimiento
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.ultimoAcceso }]}>
            Últ. acceso
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL_WIDTHS.actividad }]}>Actividad</Text>
        </View>

        {/* ── TABLE ROWS ── */}
        <View style={styles.table}>
          {rows.map((row, idx) => {
            const activity = activityLabel(row);
            const activityColor =
              activity === 'Sin actividad'
                ? '#94a3b8'
                : activity === 'Inactivo'
                  ? '#b91c1c'
                  : activity === 'Frío'
                    ? '#92400e'
                    : '#047857';
            const activityBg =
              activity === 'Sin actividad'
                ? '#f1f5f9'
                : activity === 'Inactivo'
                  ? '#fee2e2'
                  : activity === 'Frío'
                    ? '#fef3c7'
                    : '#d1fae5';

            return (
              <View
                key={row.id}
                style={[styles.tableRow, idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd]}
                wrap={false}
              >
                <Text style={[styles.cellBold, { width: COL_WIDTHS.nombre }]}>
                  {row.full_name || '—'}
                </Text>
                <Text style={[styles.cellMono, { width: COL_WIDTHS.email }]}>
                  {row.email || '—'}
                </Text>
                <Text style={[styles.cellMono, { width: COL_WIDTHS.cedula }]}>
                  {row.cedula ?? '—'}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS.especialidad }]}>
                  {row.specialty ?? '—'}
                </Text>
                <Text
                  style={[
                    styles.cell,
                    { width: COL_WIDTHS.plan, color: BRAND, fontFamily: 'Helvetica-Bold' },
                  ]}
                >
                  {row.plan ?? 'trial'}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS.estado }]}>
                  {subscriptionLabel(row.subscription_status)}
                </Text>
                <Text style={[styles.cellMono, { width: COL_WIDTHS.vencimiento }]}>
                  {formatDateVE(row.subscription_expires_at)}
                </Text>
                <Text style={[styles.cellMono, { width: COL_WIDTHS.ultimoAcceso }]}>
                  {formatLastAccess(row)}
                </Text>
                {/* Actividad con color semáforo */}
                <View
                  style={{
                    width: COL_WIDTHS.actividad,
                    backgroundColor: activityBg,
                    borderRadius: 3,
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                    alignSelf: 'flex-start',
                  }}
                >
                  <Text style={[styles.activityText, { color: activityColor }]}>{activity}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Delta Salud · Reporte confidencial · {total} especialistas
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
