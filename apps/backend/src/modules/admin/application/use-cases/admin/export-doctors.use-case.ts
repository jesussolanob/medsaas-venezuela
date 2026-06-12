import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DoctorExportRow,
} from '../../../domain/repositories/admin.repository';

/**
 * Builds a UTF-8 CSV string from the full doctor list for super_admin export.
 *
 * Columns (in order):
 *   Nombre, Email, Cédula, Especialidad, Plan, Estado suscripción,
 *   Vencimiento, Último acceso, Estado actividad
 *
 * CSV rules applied:
 *   - Fields containing commas, double-quotes, or newlines are wrapped in double-quotes.
 *   - Double-quotes within a field are escaped as two double-quotes ("").
 *   - Date values are rendered as ISO 8601 strings (UTC). Null → empty string.
 *   - Activity status is localised for the export: active→Activo, cold→Frío, inactive→Inactivo.
 *
 * No external dependencies — all serialisation is inline.
 */
@Injectable()
export class ExportDoctorsUseCase {
  static readonly CSV_HEADERS = [
    'Nombre',
    'Email',
    'Cédula',
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

    return lines.join('\r\n');
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

const ACTIVITY_LABEL: Record<DoctorExportRow['activityStatus'], string> = {
  active: 'Activo',
  cold: 'Frío',
  inactive: 'Inactivo',
};

function buildCsvRow(row: DoctorExportRow): string {
  const fields = [
    row.fullName,
    row.email,
    row.cedula ?? '',
    row.specialty ?? '',
    row.plan ?? '',
    row.subscriptionStatus ?? '',
    row.subscriptionExpiresAt ? row.subscriptionExpiresAt.toISOString() : '',
    row.lastSignInAt ? row.lastSignInAt.toISOString() : '',
    ACTIVITY_LABEL[row.activityStatus],
  ];
  return fields.map(csvEscape).join(',');
}
