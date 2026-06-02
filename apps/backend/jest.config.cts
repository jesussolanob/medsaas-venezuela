module.exports = {
  displayName: 'backend',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@delta/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@delta/shared-utils$': '<rootDir>/../../libs/shared-utils/src/index.ts',
    '^@delta/shared-crypto$': '<rootDir>/../../libs/shared-crypto/src/index.ts',
  },
  coverageDirectory: '../../coverage/apps/backend',
};
