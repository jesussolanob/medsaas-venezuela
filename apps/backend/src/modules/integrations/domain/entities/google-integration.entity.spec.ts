import { GoogleIntegration } from './google-integration.entity';

const baseParams = {
  id: 'test-id',
  doctorId: 'doctor-1',
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  tokenExpiry: null,
  scope: 'calendar',
  googleEmail: 'doc@gmail.com',
  connectedAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('GoogleIntegration entity', () => {
  it('creates an entity with the given params', () => {
    const gi = GoogleIntegration.create(baseParams);
    expect(gi.id).toBe('test-id');
    expect(gi.doctorId).toBe('doctor-1');
    expect(gi.googleEmail).toBe('doc@gmail.com');
  });

  describe('isOwnedBy', () => {
    it('returns true for the owning doctor', () => {
      const gi = GoogleIntegration.create(baseParams);
      expect(gi.isOwnedBy('doctor-1')).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const gi = GoogleIntegration.create(baseParams);
      expect(gi.isOwnedBy('other-doctor')).toBe(false);
    });
  });

  describe('isTokenExpired', () => {
    it('returns false when tokenExpiry is null', () => {
      const gi = GoogleIntegration.create({ ...baseParams, tokenExpiry: null });
      expect(gi.isTokenExpired()).toBe(false);
    });

    it('returns false when token expires far in the future', () => {
      const future = new Date(Date.now() + 60 * 60 * 1000); // 1h from now
      const gi = GoogleIntegration.create({ ...baseParams, tokenExpiry: future });
      expect(gi.isTokenExpired()).toBe(false);
    });

    it('returns true when token is expired', () => {
      const past = new Date(Date.now() - 60 * 1000);
      const gi = GoogleIntegration.create({ ...baseParams, tokenExpiry: past });
      expect(gi.isTokenExpired()).toBe(true);
    });

    it('returns true within the default buffer window (5 min)', () => {
      const almostExpired = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now
      const gi = GoogleIntegration.create({ ...baseParams, tokenExpiry: almostExpired });
      expect(gi.isTokenExpired()).toBe(true);
    });
  });

  describe('withRefreshedTokens', () => {
    it('returns a new entity with updated tokens (immutable)', () => {
      const gi = GoogleIntegration.create(baseParams);
      const newExpiry = new Date(Date.now() + 3600 * 1000);
      const refreshed = gi.withRefreshedTokens('new-access', 'new-refresh', newExpiry);

      expect(refreshed).not.toBe(gi);
      expect(refreshed.accessToken).toBe('new-access');
      expect(refreshed.refreshToken).toBe('new-refresh');
      expect(refreshed.tokenExpiry).toBe(newExpiry);
      // Original is unchanged
      expect(gi.accessToken).toBe('access-tok');
    });

    it('preserves unchanged fields after refresh', () => {
      const gi = GoogleIntegration.create(baseParams);
      const refreshed = gi.withRefreshedTokens('a', 'b', null);
      expect(refreshed.id).toBe(gi.id);
      expect(refreshed.doctorId).toBe(gi.doctorId);
      expect(refreshed.googleEmail).toBe(gi.googleEmail);
    });
  });
});
