import { ExportDoctorsUseCase } from './export-doctors.use-case';
import type {
  IAdminRepository,
  DoctorExportRow,
} from '../../../domain/repositories/admin.repository';

const makeRow = (overrides: Partial<DoctorExportRow> = {}): DoctorExportRow => ({
  fullName: 'Dr. House',
  email: 'house@example.com',
  cedula: '12345678',
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
  it('returns a CSV string with header row', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([]));
    const csv = await useCase.execute();
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'Nombre,Email,Cédula,Especialidad,Plan,Estado suscripción,Vencimiento,Último acceso,Estado actividad',
    );
  });

  it('returns only header for empty doctor list', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([]));
    const csv = await useCase.execute();
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(1);
  });

  it('builds one data row per doctor with correct field order', async () => {
    const row = makeRow();
    const useCase = new ExportDoctorsUseCase(makeRepo([row]));
    const csv = await useCase.execute();
    const parts = csv.split('\r\n');
    const dataLine = parts[1] ?? '';
    expect(dataLine).toContain('Dr. House');
    expect(dataLine).toContain('house@example.com');
    expect(dataLine).toContain('12345678');
    expect(dataLine).toContain('Diagnóstico');
    expect(dataLine).toContain('professional');
    expect(dataLine).toContain('active');
    expect(dataLine).toContain('2027-01-01T00:00:00.000Z');
    expect(dataLine).toContain('2026-06-10T12:00:00.000Z');
    expect(dataLine).toContain('Frío');
  });

  it('localises activity status: active → Activo', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ activityStatus: 'active' })]));
    const csv = await useCase.execute();
    expect(csv).toContain('Activo');
  });

  it('localises activity status: inactive → Inactivo', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ activityStatus: 'inactive' })]));
    const csv = await useCase.execute();
    expect(csv).toContain('Inactivo');
  });

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

  it('outputs empty string for null cedula', async () => {
    const row = makeRow({ cedula: null });
    const useCase = new ExportDoctorsUseCase(makeRepo([row]));
    const csv = await useCase.execute();
    const parts = csv.split('\r\n');
    const dataLine = parts[1] ?? '';
    // cedula field (index 2) should be empty between commas
    const fields = dataLine.split(',');
    expect(fields[2]).toBe('');
  });

  it('outputs empty string for null lastSignInAt', async () => {
    const row = makeRow({ lastSignInAt: null });
    const useCase = new ExportDoctorsUseCase(makeRepo([row]));
    const csv = await useCase.execute();
    // The lastSignInAt field should be an empty segment
    const parts = csv.split('\r\n');
    const dataLine = parts[1] ?? '';
    expect(dataLine).toContain(',,');
  });

  it('uses CRLF line endings throughout', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow()]));
    const csv = await useCase.execute();
    expect(csv).toContain('\r\n');
    // No bare \n without preceding \r
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('produces two rows for two doctors', async () => {
    const rows = [makeRow({ fullName: 'Dr. A' }), makeRow({ fullName: 'Dr. B' })];
    const useCase = new ExportDoctorsUseCase(makeRepo(rows));
    const csv = await useCase.execute();
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });
});
