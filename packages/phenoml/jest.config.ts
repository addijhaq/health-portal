import type { Config } from 'jest';

const config: Config = {
  displayName: 'phenoml',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@health-portal/core$': '<rootDir>/../core/src',
  },
};

export default config;
