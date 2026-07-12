import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DoctorExportRow,
} from '../../../domain/repositories/admin.repository';

/**
 * Builds a UTF-8 CSV string (with BOM) from the full doctor list for super_admin export.
 *
 * Columns (in order):
 *   Nombre, Email, Tipo de documento, Número de documento, Especialidad,
 *   Plan, Estado suscripción, Vencimiento, Último acceso, Estado actividad
 *
 * CSV rules applied:
 *   - UTF-8 BOM (﻿) prepended so Excel opens the file with correct accent encoding.
 *   - Fields containing commas, double-quotes, or newlines are wrapped in double-quotes.
 *   - Double-quotes within a field are escaped as two double-quotes ("").
 *   - Dates formatted as DD/MM/AAAA HH:MM in America/Caracas timezone (UTC-4). Null → empty string.
 *   - Cédula split into "Tipo de documento" (prefix before '-') and "Número de documento"
 *     (digits/value after '-'). If no '-' is present, tipo='' and número=original value.
 *   - Activity status is localised: active→Activo, cold→Frío, inactive→Inactivo.
 *
 * No external dependencies — all serialisation is inline.
 */
@Injectable()
export class ExportDoctorsUseCase {
  static readonly CSV_HEADERS = [
    'Nombre',
    'Email',
    'Tipo de documento',
    'Número de documento',
    'Especialidad',
    'Plan',
    'Estado suscripción',
    'Vencimiento',
    'Último acceso',
    'Estado actividad',
  ] as const;

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(): Promise<string> {
    const rows = await this.adminRepo.exportDoctors();
    const lines: string[] = [ExportDoctorsUseCase.CSV_HEADERS.map(csvEscape).join(',')];

    for (const row of rows) {
      lines.push(buildCsvRow(row));
    }

    // UTF-8 BOM ensures Excel opens the file with correct accented character rendering.
    return '﻿' + lines.join('\r\n');
  }
}

// ---------------------------------------------------------------------------
// CSV helpers (pure functions — no external deps)
// ---------------------------------------------------------------------------

function csvEscape(value: string | null | undefined): string {
  const s = value == null ? '' : String(value);
  // Wrap in quotes if the field contains a comma, double-quote, or newline
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Formats a Date as "DD/MM/AAAA HH:MM" in America/Caracas time (UTC-4).
 * Returns empty string for null/undefined.
 *
 * Uses Intl.DateTimeFormat with individual part extraction to guarantee the
 * exact "DD/MM/AAAA HH:MM" format with no locale-injected separators (e.g.
 * the 'es-VE' locale adds a comma between date and time in toLocaleString).
 */
function formatVenezuelanDate(date: Date | null | undefined): string {
  if (!date) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts['day']}/${parts['month']}/${parts['year']} ${parts['hour']}:${parts['minute']}`;
}

/**
 * Splits a cédula string (e.g. "V-12345678") into its prefix and numeric parts.
 *
 * - "V-12345678"  → { tipo: "V", numero: "12345678" }
 * - "E-987654"    → { tipo: "E", numero: "987654"   }
 * - "12345678"    → { tipo: "",  numero: "12345678" }  (no dash, value unchanged)
 * - null          → { tipo: "",  numero: "" }
 */
function parseCedula(cedula: string | null | undefined): { tipo: string; numero: string } {
  if (!cedula) return { tipo: '', numero: '' };
  const dashIndex = cedula.indexOf('-');
  if (dashIndex === -1) return { tipo: '', numero: cedula };
  return {
    tipo: cedula.slice(0, dashIndex),
    numero: cedula.slice(dashIndex + 1),
  };
}

const ACTIVITY_LABEL: Record<DoctorExportRow['activityStatus'], string> = {
  active: 'Activo',
  cold: 'Frío',
  inactive: 'Inactivo',
};

function buildCsvRow(row: DoctorExportRow): string {
  const { tipo, numero } = parseCedula(row.cedula);
  const fields = [
    row.fullName,
    row.email,
    tipo,
    numero,
    row.specialty ?? '',
    row.plan ?? '',
    row.subscriptionStatus ?? '',
    formatVenezuelanDate(row.subscriptionExpiresAt),
    formatVenezuelanDate(row.lastSignInAt),
    ACTIVITY_LABEL[row.activityStatus],
  ];
  return fields.map(csvEscape).join(',');
}
