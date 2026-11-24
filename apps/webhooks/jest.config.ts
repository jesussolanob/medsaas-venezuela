import type { Config } from 'jest';

const config: Config = {
  displayName: 'webhooks',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../coverage/apps/webhooks',
  passWithNoTests: true,
};

export default config;
