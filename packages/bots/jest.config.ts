import type { Config } from 'jest';

const config: Config = {
  displayName: 'bots',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@health-portal/core$': '<rootDir>/../core/src',
    '^@health-portal/phenoml$': '<rootDir>/../phenoml/src',
    '^@health-portal/emr-connectors$': '<rootDir>/../emr-connectors/src',
  },
};

export default config;
