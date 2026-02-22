import type { Config } from 'jest';

const config: Config = {
  projects: [
    '<rootDir>/packages/core',
    '<rootDir>/packages/hl7-engine',
    '<rootDir>/packages/emr-connectors',
    '<rootDir>/packages/phenoml',
    '<rootDir>/packages/bots',
  ],
};

export default config;
