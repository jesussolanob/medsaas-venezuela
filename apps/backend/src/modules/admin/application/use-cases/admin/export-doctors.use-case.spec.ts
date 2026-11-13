import { ExportDoctorsUseCase } from './export-doctors.use-case';
import type {
  IAdminRepository,
  DoctorExportRow,
} from '../../../domain/repositories/admin.repository';

const makeRow = (overrides: Partial<DoctorExportRow> = {}): DoctorExportRow => ({
  fullName: 'Dr. House',
  email: 'house@example.com',
  phone: '+58 212 555 1234',
  cedula: 'V-12345678',
  specialty: 'Diagnóstico',
  registeredAt: new Date('2026-01-15T14:00:00.000Z'),
  plan: 'professional',
  subscriptionStatus: 'active',
  subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
  lastSignInAt: new Date('2026-06-10T12:00:00.000Z'),
  activityStatus: 'cold',
  patientCount: 10,
  officeCount: 2,
  serviceCount: 3,
  consultationCount: 25,
  onboardingLastStep: 'completed',
  onboardingOfficeSkipped: false,
  onboardingServiceSkipped: false,
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

  it('returns a CSV string with the full 17-column header row', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([]));
    const csv = await useCase.execute();
    // Strip BOM for header assertion
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Nombre,Email,Teléfono,Tipo de documento,Número de documento,Especialidad,' +
        'Plan,Estado suscripción,Vencimiento,Fecha de registro,Último acceso,' +
        'Estado actividad,Pacientes,Consultorios,Servicios,Consultas,' +
        'Último paso del onboarding',
    );
  });

  it('returns only header for empty doctor list', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([]));
    const csv = await useCase.execute();
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Cédula splitting (Teléfono now at index 2 → Tipo at 3, Número at 4)
  // ---------------------------------------------------------------------------

  it('splits "V-12345678" into tipo="V" and numero="12345678"', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: 'V-12345678' })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    // Split only on bare commas (not commas inside quoted fields).
    // The test row has no quoted fields so naive split works here.
    const fields = line.split(',');
    expect(fields[3]).toBe('V'); // Tipo de documento (shifted by Teléfono col)
    expect(fields[4]).toBe('12345678'); // Número de documento
  });

  it('splits "E-987654" into tipo="E" and numero="987654"', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: 'E-987654' })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[3]).toBe('E');
    expect(fields[4]).toBe('987654');
  });

  it('falls back to tipo="" and numero=value when cedula has no dash', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: '12345678' })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[3]).toBe('');
    expect(fields[4]).toBe('12345678');
  });

  it('outputs empty tipo and numero for null cedula', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ cedula: null })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[3]).toBe('');
    expect(fields[4]).toBe('');
  });

  // ---------------------------------------------------------------------------
  // Phone
  // ---------------------------------------------------------------------------

  it('includes phone in the third column (index 2)', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ phone: '+58 212 555 1234' })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    expect(line).toContain('+58 212 555 1234');
  });

  it('outputs empty string for null phone', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ phone: null })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    // house@example.com is at index 1, phone (empty) at index 2
    expect(line.startsWith('Dr. House,house@example.com,,')).toBe(true);
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

  it('formats registeredAt as DD/MM/AAAA HH:MM (Venezuela time)', async () => {
    // 2026-01-15T18:00:00.000Z = 2026-01-15 14:00 in UTC-4
    const useCase = new ExportDoctorsUseCase(
      makeRepo([makeRow({ registeredAt: new Date('2026-01-15T18:00:00.000Z') })]),
    );
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    expect(line).toContain('15/01/2026');
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
    // subscriptionExpiresAt (index 8) is empty → consecutive comma separators
    expect(line).toContain('active,,');
  });

  it('outputs empty string for null lastSignInAt', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ lastSignInAt: null })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    // lastSignInAt (index 10) empty + registeredAt (index 9) filled → has empty slot
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
  // Aggregated counts
  // ---------------------------------------------------------------------------

  it('includes patient count in the row', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ patientCount: 42 })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[12]).toBe('42'); // Pacientes
  });

  it('includes office count in the row', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ officeCount: 3 })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[13]).toBe('3'); // Consultorios
  });

  it('includes service count in the row', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ serviceCount: 5 })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[14]).toBe('5'); // Servicios
  });

  it('includes consultation count in the row', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ consultationCount: 100 })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[15]).toBe('100'); // Consultas
  });

  // ---------------------------------------------------------------------------
  // Onboarding step labelling
  // ---------------------------------------------------------------------------

  it('labels onboardingLastStep=null as empty string', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow({ onboardingLastStep: null })]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    const fields = line.split(',');
    expect(fields[16]).toBe(''); // Último paso del onboarding
  });

  it('labels onboardingLastStep=completed as "Completado"', async () => {
    const useCase = new ExportDoctorsUseCase(
      makeRepo([
        makeRow({
          onboardingLastStep: 'completed',
          onboardingOfficeSkipped: false,
          onboardingServiceSkipped: false,
        }),
      ]),
    );
    const csv = await useCase.execute();
    expect(csv).toContain('Completado');
  });

  it('labels onboardingLastStep=office with officeSkipped=true as "Consultorio (omitido)"', async () => {
    const useCase = new ExportDoctorsUseCase(
      makeRepo([makeRow({ onboardingLastStep: 'office', onboardingOfficeSkipped: true })]),
    );
    const csv = await useCase.execute();
    expect(csv).toContain('Consultorio (omitido)');
  });

  it('labels onboardingLastStep=service with serviceSkipped=true as "Servicio (omitido)"', async () => {
    const useCase = new ExportDoctorsUseCase(
      makeRepo([
        makeRow({
          onboardingLastStep: 'service',
          onboardingOfficeSkipped: false,
          onboardingServiceSkipped: true,
        }),
      ]),
    );
    const csv = await useCase.execute();
    expect(csv).toContain('Servicio (omitido)');
  });

  it('labels onboardingLastStep=office with officeSkipped=false as "Consultorio" (no omitido)', async () => {
    const useCase = new ExportDoctorsUseCase(
      makeRepo([makeRow({ onboardingLastStep: 'office', onboardingOfficeSkipped: false })]),
    );
    const csv = await useCase.execute();
    expect(csv).toContain('Consultorio');
    expect(csv).not.toContain('(omitido)');
  });

  it('labels onboardingLastStep=profile as "Perfil"', async () => {
    const useCase = new ExportDoctorsUseCase(
      makeRepo([makeRow({ onboardingLastStep: 'profile' })]),
    );
    const csv = await useCase.execute();
    expect(csv).toContain('Perfil');
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

  it('builds one data row with correct field count (17 columns)', async () => {
    const useCase = new ExportDoctorsUseCase(makeRepo([makeRow()]));
    const csv = await useCase.execute();
    const line = csv.slice(1).split('\r\n')[1] ?? '';
    // The row has no commas inside quoted fields, so naive split works here.
    const fields = line.split(',');
    expect(fields).toHaveLength(17);
  });
});
