/**
 * CJS stub for the 'jose' package (ESM-only in v6).
 *
 * Jest runs in CommonJS mode and cannot import ESM modules directly.
 * This stub is wired via moduleNameMapper in jest.config.cts and provides
 * the minimal surface that Auth0Guard uses. Tests replace these functions
 * with jest.fn() implementations via jest.mock('jose', () => ({ ... })).
 *
 * This file is ONLY used during Jest test runs — webpack/tsc compiles against
 * the real 'jose' ESM package. It is intentionally a plain .js file (no TS)
 * to stay outside the tsconfig compilation target and avoid lint noise.
 */
'use strict';

module.exports = {
  createRemoteJWKSet: () => '__stub_jwks__',
  jwtVerify: () => Promise.reject(new Error('jose stub: override with jest.mock')),
};
