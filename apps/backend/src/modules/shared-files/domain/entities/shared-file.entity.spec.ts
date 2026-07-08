import { SharedFile, type SharedFileCreateParams } from './shared-file.entity';

const BASE_PARAMS: SharedFileCreateParams = {
  id: 'aaaa-0001',
  doctorId: 'doctor-001',
  patientId: 'patient-001',
  title: 'Tomar medicamento',
  description: 'Tomar 1 pastilla diaria',
  filePath: null,
  fileType: null,
  fileSizeBytes: null,
  category: 'instruction',
  status: 'pending',
  createdBy: 'doctor',
  parentTaskId: null,
  readByDoctor: true,
  readByPatient: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('SharedFile entity', () => {
  it('creates with all fields via constructor', () => {
    const sf = new SharedFile(BASE_PARAMS);
    expect(sf.id).toBe('aaaa-0001');
    expect(sf.doctorId).toBe('doctor-001');
    expect(sf.patientId).toBe('patient-001');
    expect(sf.title).toBe('Tomar medicamento');
    expect(sf.category).toBe('instruction');
    expect(sf.status).toBe('pending');
    expect(sf.createdBy).toBe('doctor');
    expect(sf.readByDoctor).toBe(true);
    expect(sf.readByPatient).toBe(false);
  });

  it('creates via static factory', () => {
    const sf = SharedFile.create(BASE_PARAMS);
    expect(sf).toBeInstanceOf(SharedFile);
    expect(sf.id).toBe('aaaa-0001');
  });

  describe('canBeModifiedByDoctor', () => {
    it('returns true for the owning doctor', () => {
      const sf = SharedFile.create(BASE_PARAMS);
      expect(sf.canBeModifiedByDoctor('doctor-001')).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const sf = SharedFile.create(BASE_PARAMS);
      expect(sf.canBeModifiedByDoctor('doctor-999')).toBe(false);
    });
  });

  describe('canBeModifiedByPatient', () => {
    it('returns true for the owning patient', () => {
      const sf = SharedFile.create(BASE_PARAMS);
      expect(sf.canBeModifiedByPatient('patient-001')).toBe(true);
    });

    it('returns false for a different patient', () => {
      const sf = SharedFile.create(BASE_PARAMS);
      expect(sf.canBeModifiedByPatient('patient-999')).toBe(false);
    });
  });

  it('stores filePath (GCS object path) as-is, not a signed URL', () => {
    const sf = SharedFile.create({
      ...BASE_PARAMS,
      filePath: 'shared/doctor-001/1234567890-report.pdf',
      fileType: 'pdf',
      fileSizeBytes: 204800,
    });
    expect(sf.filePath).toBe('shared/doctor-001/1234567890-report.pdf');
    expect(sf.fileType).toBe('pdf');
    expect(sf.fileSizeBytes).toBe(204800);
  });

  it('handles all category values', () => {
    const categories = [
      'instruction',
      'file',
      'recipe',
      'lab_result',
      'image',
      'other',
      'comment',
    ] as const;
    for (const category of categories) {
      const sf = SharedFile.create({ ...BASE_PARAMS, category });
      expect(sf.category).toBe(category);
    }
  });

  it('handles all status values', () => {
    const statuses = ['pending', 'completed', 'reviewed'] as const;
    for (const status of statuses) {
      const sf = SharedFile.create({ ...BASE_PARAMS, status });
      expect(sf.status).toBe(status);
    }
  });

  it('handles parentTaskId when set', () => {
    const sf = SharedFile.create({ ...BASE_PARAMS, parentTaskId: 'parent-001' });
    expect(sf.parentTaskId).toBe('parent-001');
  });

  it('handles patient-created entries', () => {
    const sf = SharedFile.create({
      ...BASE_PARAMS,
      createdBy: 'patient',
      readByDoctor: false,
      readByPatient: true,
    });
    expect(sf.createdBy).toBe('patient');
    expect(sf.readByDoctor).toBe(false);
    expect(sf.readByPatient).toBe(true);
  });
});
