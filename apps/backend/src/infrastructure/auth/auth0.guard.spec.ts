import { type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Auth0Guard } from './auth0.guard';
import { IdentityResolverService } from './identity-resolver.service';
import {
  Auth0TokenMissingError,
  Auth0TokenInvalidError,
  Auth0EmailMissingError,
  Auth0ConfigMissingError,
} from './errors/auth0.errors';

// ---- jose mock -----------------------------------------------------------
// We mock the entire 'jose' module to avoid any real network calls.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue('__mock_jwks__'),
  jwtVerify: jest.fn(),
}));

import { jwtVerify, createRemoteJWKSet } from 'jose';
const mockJwtVerify = jwtVerify as jest.Mock;
const mockCreateRemoteJWKSet = createRemoteJWKSet as jest.Mock;

// ---- helpers -------------------------------------------------------------

const PROFILE_ID = randomUUID();
const TEST_EMAIL = 'doctor@example.com';
const TEST_AUTH0_SUB = 'auth0|abc123';

function makeConfigService(overrides: Record<string, string | undefined> = {}): ConfigService {
  const defaults: Record<string, string | undefined> = {
    AUTH_MODE: 'auth0',
    AUTH0_DOMAIN: 'dev.auth0.com',
    AUTH0_CLIENT_ID: 'test-client-id',
    AUTH0_ROLE_NAMESPACE: 'https://deltamedical.app',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => defaults[key]),
  } as unknown as ConfigService;
}

function makeIdentityResolver(
  resolved: {
    profileId: string;
    email: string;
    role: 'doctor' | 'super_admin' | 'patient' | 'assistant' | 'seller';
  } = {
    profileId: PROFILE_ID,
    email: TEST_EMAIL,
    role: 'doctor',
  },
): jest.Mocked<IdentityResolverService> {
  return {
    resolve: jest.fn().mockResolvedValue(resolved),
  } as unknown as jest.Mocked<IdentityResolverService>;
}

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  const request = { headers, user: undefined as unknown };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function makeValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: TEST_AUTH0_SUB,
    email: TEST_EMAIL,
    iss: 'https://dev.auth0.com/',
    aud: 'test-client-id',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// ---- tests ---------------------------------------------------------------

describe('Auth0Guard', () => {
  let guard: Auth0Guard;
  let config: ConfigService;
  let resolver: jest.Mocked<IdentityResolverService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRemoteJWKSet.mockReturnValue('__mock_jwks__');
    config = makeConfigService();
    resolver = makeIdentityResolver();
    guard = new Auth0Guard(config, resolver);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('sets request.user with profile UUID and BD role on valid token', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload() });

    const ctx = makeContext({ 'x-auth0-token': 'valid.jwt.token' });
    const result = await guard.canActivate(ctx);

    const req = ctx.switchToHttp().getRequest() as {
      user: { sub: string; role: string; email: string };
    };
    expect(result).toBe(true);
    expect(req.user.sub).toBe(PROFILE_ID);
    expect(req.user.role).toBe('doctor');
    expect(req.user.email).toBe(TEST_EMAIL);
  });

  it('accepts token in "Bearer <jwt>" format', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload() });

    const ctx = makeContext({ 'x-auth0-token': 'Bearer valid.jwt.token' });
    await guard.canActivate(ctx);

    expect(mockJwtVerify).toHaveBeenCalledWith(
      'valid.jwt.token',
      '__mock_jwks__',
      expect.any(Object),
    );
  });

  it('accepts token in lowercase "bearer <jwt>" format', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload() });

    const ctx = makeContext({ 'x-auth0-token': 'bearer valid.jwt.token' });
    await guard.canActivate(ctx);

    expect(mockJwtVerify).toHaveBeenCalledWith(
      'valid.jwt.token',
      '__mock_jwks__',
      expect.any(Object),
    );
  });

  it('passes AUTH0_DOMAIN issuer and AUTH0_CLIENT_ID audience to jwtVerify', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload() });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    expect(mockJwtVerify).toHaveBeenCalledWith(
      'raw.jwt',
      '__mock_jwks__',
      expect.objectContaining({
        issuer: 'https://dev.auth0.com/',
        audience: 'test-client-id',
        algorithms: ['RS256'],
      }),
    );
  });

  it('passes roleHint from namespace claim to IdentityResolverService', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: makeValidPayload({ 'https://deltamedical.app/role': 'doctor' }),
    });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ roleHint: 'doctor' }));
  });

  it('passes auth0Sub to IdentityResolverService', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload({ sub: 'auth0|xyz' }) });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ auth0Sub: 'auth0|xyz' }),
    );
  });

  it('normalises email to lowercase before resolving identity', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload({ email: 'Doc@Example.COM' }) });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'doc@example.com' }),
    );
  });

  it('reuses the same JWKS set across multiple requests (singleton JWKS)', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload() });

    const ctx1 = makeContext({ 'x-auth0-token': 'token1' });
    const ctx2 = makeContext({ 'x-auth0-token': 'token2' });

    await guard.canActivate(ctx1);
    await guard.canActivate(ctx2);

    // createRemoteJWKSet should be called only once (lazy init on first request)
    expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Missing / malformed token
  // -------------------------------------------------------------------------

  it('throws Auth0TokenMissingError when x-auth0-token header is absent', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenMissingError);
  });

  it('throws Auth0TokenMissingError when header is an empty string', async () => {
    const ctx = makeContext({ 'x-auth0-token': '' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenMissingError);
  });

  it('throws Auth0TokenMissingError when header is whitespace only', async () => {
    const ctx = makeContext({ 'x-auth0-token': '   ' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenMissingError);
  });

  it('throws Auth0TokenMissingError when Bearer prefix has no token after it', async () => {
    const ctx = makeContext({ 'x-auth0-token': 'Bearer ' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenMissingError);
  });

  // -------------------------------------------------------------------------
  // Invalid / expired token
  // -------------------------------------------------------------------------

  it('throws Auth0TokenInvalidError when jwtVerify rejects (expired token)', async () => {
    mockJwtVerify.mockRejectedValue(new Error('JWT expired'));

    const ctx = makeContext({ 'x-auth0-token': 'expired.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenInvalidError);
  });

  it('throws Auth0TokenInvalidError when jwtVerify rejects (wrong audience)', async () => {
    mockJwtVerify.mockRejectedValue(new Error('unexpected "aud" claim value'));

    const ctx = makeContext({ 'x-auth0-token': 'wrong.aud.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenInvalidError);
  });

  it('throws Auth0TokenInvalidError when jwtVerify rejects (bad signature)', async () => {
    mockJwtVerify.mockRejectedValue(new Error('signature verification failed'));

    const ctx = makeContext({ 'x-auth0-token': 'tampered.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenInvalidError);
  });

  it('does not expose the internal jose reason in the public error message (information disclosure)', async () => {
    const internalReason = 'JWT expired at 2024-01-01T00:00:00.000Z';
    mockJwtVerify.mockRejectedValue(new Error(internalReason));

    const ctx = makeContext({ 'x-auth0-token': 'expired.jwt' });
    const error = await guard.canActivate(ctx).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Auth0TokenInvalidError);
    expect((error as Auth0TokenInvalidError).message).toBe('Invalid Auth0 token');
    expect((error as Auth0TokenInvalidError).message).not.toContain(internalReason);
  });

  it('logs the internal jose reason via logger.warn but does not surface it to the client', async () => {
    const internalReason = 'signature verification failed — key mismatch';
    mockJwtVerify.mockRejectedValue(new Error(internalReason));

    // Spy on the private logger.warn through the guard instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loggerWarnSpy = jest.spyOn((guard as any).logger, 'warn');

    const ctx = makeContext({ 'x-auth0-token': 'tampered.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0TokenInvalidError);

    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining(internalReason));
  });

  // -------------------------------------------------------------------------
  // Missing email claim
  // -------------------------------------------------------------------------

  it('throws Auth0EmailMissingError when payload has no email claim', async () => {
    const payloadWithoutEmail = makeValidPayload();
    delete (payloadWithoutEmail as Record<string, unknown>).email;
    mockJwtVerify.mockResolvedValue({ payload: payloadWithoutEmail });

    const ctx = makeContext({ 'x-auth0-token': 'no.email.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0EmailMissingError);
  });

  it('throws Auth0EmailMissingError when email claim is not a string', async () => {
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload({ email: 42 }) });

    const ctx = makeContext({ 'x-auth0-token': 'bad.email.jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Auth0EmailMissingError);
  });

  // -------------------------------------------------------------------------
  // Missing config
  // -------------------------------------------------------------------------

  it('throws Auth0ConfigMissingError when AUTH0_DOMAIN is not set', async () => {
    const guardNoConfig = new Auth0Guard(makeConfigService({ AUTH0_DOMAIN: undefined }), resolver);

    const ctx = makeContext({ 'x-auth0-token': 'any.jwt' });
    await expect(guardNoConfig.canActivate(ctx)).rejects.toBeInstanceOf(Auth0ConfigMissingError);
  });

  it('throws Auth0ConfigMissingError when AUTH0_CLIENT_ID is not set', async () => {
    const guardNoConfig = new Auth0Guard(
      makeConfigService({ AUTH0_CLIENT_ID: undefined }),
      resolver,
    );

    const ctx = makeContext({ 'x-auth0-token': 'any.jwt' });
    await expect(guardNoConfig.canActivate(ctx)).rejects.toBeInstanceOf(Auth0ConfigMissingError);
  });

  // -------------------------------------------------------------------------
  // find-or-create (via resolver mock)
  // -------------------------------------------------------------------------

  it('uses BD role (not token role) as authoritative role in request.user', async () => {
    // Token claims super_admin but BD has doctor
    mockJwtVerify.mockResolvedValue({
      payload: makeValidPayload({ 'https://deltamedical.app/role': 'super_admin' }),
    });
    resolver.resolve.mockResolvedValue({
      profileId: PROFILE_ID,
      email: TEST_EMAIL,
      role: 'doctor', // BD overrides the token claim
    });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    const req = ctx.switchToHttp().getRequest() as { user: { role: string } };
    expect(req.user.role).toBe('doctor');
  });

  it('works when identity resolver creates a new profile (first login)', async () => {
    const newProfileId = randomUUID();
    mockJwtVerify.mockResolvedValue({ payload: makeValidPayload({ email: 'newdoc@example.com' }) });
    resolver.resolve.mockResolvedValue({
      profileId: newProfileId,
      email: 'newdoc@example.com',
      role: 'doctor',
    });

    const ctx = makeContext({ 'x-auth0-token': 'first.login.jwt' });
    const result = await guard.canActivate(ctx);

    const req = ctx.switchToHttp().getRequest() as { user: { sub: string } };
    expect(result).toBe(true);
    expect(req.user.sub).toBe(newProfileId);
  });

  it('uses custom AUTH0_ROLE_NAMESPACE when configured', async () => {
    const customConfig = makeConfigService({ AUTH0_ROLE_NAMESPACE: 'https://custom.namespace' });
    const customGuard = new Auth0Guard(customConfig, resolver);

    mockJwtVerify.mockResolvedValue({
      payload: makeValidPayload({ 'https://custom.namespace/role': 'assistant' }),
    });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await customGuard.canActivate(ctx);

    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ roleHint: 'assistant' }),
    );
  });

  // -------------------------------------------------------------------------
  // name claim (FIX 4 — fullName from token instead of email)
  // -------------------------------------------------------------------------

  it('passes name from Auth0 payload to IdentityResolverService when present', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: makeValidPayload({ name: 'Dr. House' }),
    });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dr. House' }));
  });

  it('omits name from resolve call when Auth0 payload has no name claim', async () => {
    const payloadWithoutName = makeValidPayload();
    delete (payloadWithoutName as Record<string, unknown>).name;
    mockJwtVerify.mockResolvedValue({ payload: payloadWithoutName });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    const callArg = (resolver.resolve as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['name']).toBeUndefined();
  });

  it('omits name when Auth0 name claim is an empty string', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: makeValidPayload({ name: '   ' }),
    });

    const ctx = makeContext({ 'x-auth0-token': 'raw.jwt' });
    await guard.canActivate(ctx);

    const callArg = (resolver.resolve as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['name']).toBeUndefined();
  });
});
