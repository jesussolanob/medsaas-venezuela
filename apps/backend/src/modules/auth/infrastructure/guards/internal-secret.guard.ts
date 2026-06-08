/**
 * InternalSecretGuard is intentionally NOT used as a NestJS guard here.
 *
 * The secret validation is performed inside ResolveIdentityUseCase so that:
 *  - It runs BEFORE any DB access (fail-closed pattern).
 *  - It can distinguish 503 (secret not configured) from 401 (wrong secret).
 *  - The domain layer owns the security contract, testable without NestJS.
 *
 * The raw x-internal-auth-secret header is extracted in the controller and
 * passed directly to the use case.
 *
 * This file is kept as a placeholder to document the deliberate design choice.
 */
export const INTERNAL_AUTH_SECRET_HEADER = 'x-internal-auth-secret';
