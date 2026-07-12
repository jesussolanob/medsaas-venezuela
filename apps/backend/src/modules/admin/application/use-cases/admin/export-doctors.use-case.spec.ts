import { ExportDoctorsUseCase } from './export-doctors.use-case';
import type {
  IAdminRepository,
  DoctorExportRow,
} from '../../../domain/repositories/admin.repository';

const makeRow = (overrides: Partial<DoctorExportRow> = {}): DoctorExportRow => ({
  fullName: 'Dr. House',
  email: 'house@example.com',
  cedula: 'V-12345678',
  specialty: 'Diagnóstico',
  plan: 'professional',
  subscriptionStatus: 'active',
  subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
  lastSignInAt: new Date('2026-06-10T12:00:00.000Z'),
  activityStatus: 'cold',
  ...overrides,
});

const makeRepo = (rows: DoctorExportRow[] = []): jest.Mocked<IAdminRepository> =>
  ({
    exportDoctors: jest.fn().mockResolvedValue(rows),
  }) as unknown as jest.Mocked<IAdminRepository>;

describe('ExportDoctorsUseCase', () => {
  // ---------------------------------------------------------------------------
  // BOM
  // ---------------------------------------------------------------------------

  it('prepends UTF-8 BOM so Excel renders accents correctly', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([]));
    const csv = await useCase.execute();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  // ---------------------------------------------------------------------------
  // Headers
  // ---------------------------------------------------------------------------

  it('returns a CSV string with updated header row (10 columns)', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([]));
    const csv = await useCase.execute();
    // Strip BOM for header assertion
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Nombre,Email,Tipo de documento,Número de documento,Especialidad,Plan,Estado suscripción,Vencimiento,Último acceso,Estado actividad',
    );
  });

  it('returns only header for empty doctor list', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([]));
    const csv = await useCase.execute();
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Cédula splitting
  // ---------------------------------------------------------------------------

  it('splits "V-12345678" into tipo="V" and numero="12345678"', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: 'V-12345678' })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[2]).toBe('V'); // Tipo de documento
    expect(fields[3]).toBe('12345678'); // Número de documento
  });

  it('splits "E-987654" into tipo="E" and numero="987654"', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: 'E-987654' })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[2]).toBe('E');
    expect(fields[3]).toBe('987654');
  });

  it('falls back to tipo="" and numero=value when cedula has no dash', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: '12345678' })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[2]).toBe('');
    expect(fields[3]).toBe('12345678');
  });

  it('outputs empty tipo and numero for null cedula', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: null })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[2]).toBe('');
    expect(fields[3]).toBe('');
  });

  // ---------------------------------------------------------------------------
  // Date formatting (Venezuela time = UTC-4)
  // ---------------------------------------------------------------------------

  it('formats subscriptionExpiresAt as DD/MM/AAAA HH:MM (Venezuela time)', async () => {
    // 2027-01-01T04:30:00.000Z = 2027-01-01 00:30 in UTC-4
    const useCase = new ExportDoctorsUseCase(
      makeRepo([makeRow({ subscriptionExpiresAt: new Date('2027-01-01T04:30:00.000Z') })]),
    );
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    expect(line).toContain('01/01/2027');
  });

  it('formats lastSignInAt as DD/MM/AAAA HH:MM (Venezuela time)', async () => {
    // 2026-06-10T06:00:00.000Z = 2026-06-10 02:00 in UTC-4
    const useCase = new ExportDoctorsUseCase(
      makeRepo([makeRow({ lastSignInAt: new Date('2026-06-10T06:00:00.000Z') })]),
    );
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    expect(line).toContain('10/06/2026');
  });

  it('outputs empty string for null subscriptionExpiresAt', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ subscriptionExpiresAt: null })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    // Check that the field is empty (consecutive commas around it)
    expect(line).toContain('active,,');
  });

  it('outputs empty string for null lastSignInAt', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ lastSignInAt: null })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    // lastSignInAt (index 8) empty → followed by activityStatus → consecutive delimiter
    expect(line).toContain(',,');
  });

  // ---------------------------------------------------------------------------
  // Activity status localisation
  // ---------------------------------------------------------------------------

  it('localises activity status: active → Activo', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ activityStatus: 'active' })]));
    const csv = await useCase.execute();
    expect(csv).toContain('Activo');
  });

  it('localises activity status: cold → Frío', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ activityStatus: 'cold' })]));
    const csv = await useCase.execute();
    expect(csv).toContain('Frío');
  });

  it('localises activity status: inactive → Inactivo', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ activityStatus: 'inactive' })]));
    const csv = await useCase.execute();
    expect(csv).toContain('Inactivo');
  });

  // ---------------------------------------------------------------------------
  // CSV escaping
  // ---------------------------------------------------------------------------

  it('escapes double-quotes in fields as double double-quotes', async () => {
    const row = makeRow({ fullName: 'Dr. "The House"' });
    const useCase = new ExportDoctorsUseCase(makeRepo([row]));
    const csv = await useCase.execute();
    expect(csv).toContain('"Dr. ""The House"""');
  });

  it('wraps fields containing commas in double-quotes', async () => {
    const row = makeRow({ specialty: 'Medicina, Interna' });
    const useCase = new ExportDoctorsUseCase(makeRepo([row]));
    const csv = await useCase.execute();
    expect(csv).toContain('"Medicina, Interna"');
  });

  // ---------------------------------------------------------------------------
  // Line endings and multi-row
  // ---------------------------------------------------------------------------

  it('uses CRLF line endings throughout', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow()]));
    const csv = await useCase.execute();
    expect(csv).toContain('\r\n');
    // No bare \n without preceding \r
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('produces two data rows for two doctors', async () => {
    const rows = [makeRow({ fullName: 'Dr. A' }), makeRow({ fullName: 'Dr. B' })];
    const useCase = new ExportDoctorsUseCase(makeRepo(rows));
    const csv = await useCase.execute();
    // Strip BOM, split by CRLF
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('builds one data row with correct field count (10 columns)', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow()]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    // naive split — safe for this row since no commas inside quoted fields here
    const fields = line.split(',');
    expect(fields).toHaveLength(10);
  });
});
