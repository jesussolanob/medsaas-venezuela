module.exports = {
  displayName: 'backend',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    // Only transform TypeScript files — .js stubs (jose-cjs-stub.js) are loaded
    // as-is by Jest's require() without needing ts-jest transformation.
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@delta/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@delta/shared-utils$': '<rootDir>/../../libs/shared-utils/src/index.ts',
    '^@delta/shared-crypto$': '<rootDir>/../../libs/shared-crypto/src/index.ts',
    /**
     * jose v6 is ESM-only. Jest runs in CommonJS mode and cannot load ESM
     * modules directly. We redirect 'jose' to a hand-crafted CJS stub that
     * exposes the same API surface used by Auth0Guard. Individual tests override
     * the functions via jest.mock('jose', () => ({ ... })).
     */
    '^jose$': '<rootDir>/src/infrastructure/auth/jose-cjs-stub.js',
  },
  coverageDirectory: '../../coverage/apps/backend',
};
