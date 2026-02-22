import {
  PhenoMlClient,
  Lang2FhirService,
  ConstructService,
  AgentService,
} from '..';
import type { PhenoMlConfig } from '@health-portal/core';

const testConfig: PhenoMlConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://api.pheno.ml',
  fhirServerType: 'medplum',
  fhirServerUrl: 'https://fhir.example.com',
};

describe('phenoml smoke tests', () => {
  describe('PhenoMlClient', () => {
    it('instantiates with test config', () => {
      const client = new PhenoMlClient(testConfig);
      expect(client).toBeInstanceOf(PhenoMlClient);
    });
  });

  describe('Lang2FhirService', () => {
    it('instantiates with a PhenoMlClient', () => {
      const client = new PhenoMlClient(testConfig);
      const service = new Lang2FhirService(client);
      expect(service).toBeInstanceOf(Lang2FhirService);
    });

    it('has a create method', () => {
      const client = new PhenoMlClient(testConfig);
      const service = new Lang2FhirService(client);
      expect(typeof service.create).toBe('function');
    });

    it('has a search method', () => {
      const client = new PhenoMlClient(testConfig);
      const service = new Lang2FhirService(client);
      expect(typeof service.search).toBe('function');
    });
  });

  describe('ConstructService', () => {
    it('instantiates with a PhenoMlClient', () => {
      const client = new PhenoMlClient(testConfig);
      const service = new ConstructService(client);
      expect(service).toBeInstanceOf(ConstructService);
    });

    it('has an extract method', () => {
      const client = new PhenoMlClient(testConfig);
      const service = new ConstructService(client);
      expect(typeof service.extract).toBe('function');
    });
  });

  describe('AgentService', () => {
    it('instantiates with a PhenoMlClient', () => {
      const client = new PhenoMlClient(testConfig);
      const service = new AgentService(client);
      expect(service).toBeInstanceOf(AgentService);
    });

    it('has a run method', () => {
      const client = new PhenoMlClient(testConfig);
      const service = new AgentService(client);
      expect(typeof service.run).toBe('function');
    });
  });
});
