import { CredentialVerifier } from './credential-verifier.entity';

const baseProps = {
  id: '11111111-1111-1111-1111-111111111111',
  credentialType: 'mpps',
  professionCode: null,
  jurisdiction: 'nacional',
  portalName: 'SACS',
  portalUrl: 'https://sistemas.sacs.gob.ve/consultas/prfsnal_salud',
  method: 'xajax-post' as const,
  requestTemplate: null,
  requiredInput: 'cedula' as const,
  responseParser: 'sacs-xajax',
  hasCaptcha: false,
  tlsInsecure: true,
  status: 'active' as const,
  lastCheckedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('CredentialVerifier', () => {
  describe('create', () => {
    it('creates a verifier with all props', () => {
      const verifier = CredentialVerifier.create(baseProps);

      expect(verifier.id).toBe(baseProps.id);
      expect(verifier.credentialType).toBe('mpps');
      expect(verifier.jurisdiction).toBe('nacional');
      expect(verifier.tlsInsecure).toBe(true);
      expect(verifier.hasCaptcha).toBe(false);
      expect(verifier.method).toBe('xajax-post');
      expect(verifier.responseParser).toBe('sacs-xajax');
    });
  });

  describe('isActive', () => {
    it('returns true when status is active', () => {
      const verifier = CredentialVerifier.create({ ...baseProps, status: 'active' });
      expect(verifier.isActive()).toBe(true);
    });

    it('returns false when status is flaky', () => {
      const verifier = CredentialVerifier.create({ ...baseProps, status: 'flaky' });
      expect(verifier.isActive()).toBe(false);
    });

    it('returns false when status is down', () => {
      const verifier = CredentialVerifier.create({ ...baseProps, status: 'down' });
      expect(verifier.isActive()).toBe(false);
    });
  });

  describe('isManualOnly', () => {
    it('returns true when status is manual_only', () => {
      const verifier = CredentialVerifier.create({ ...baseProps, status: 'manual_only' });
      expect(verifier.isManualOnly()).toBe(true);
    });

    it('returns false when status is active', () => {
      const verifier = CredentialVerifier.create({ ...baseProps, status: 'active' });
      expect(verifier.isManualOnly()).toBe(false);
    });
  });

  describe('immutability', () => {
    it('id stays equal to the original props id', () => {
      const verifier = CredentialVerifier.create(baseProps);
      expect(verifier.id).toBe(baseProps.id);
    });

    it('creates a separate instance per create() call', () => {
      const v1 = CredentialVerifier.create(baseProps);
      const v2 = CredentialVerifier.create({ ...baseProps, id: 'other-id' });
      expect(v1.id).not.toBe(v2.id);
    });
  });
});
