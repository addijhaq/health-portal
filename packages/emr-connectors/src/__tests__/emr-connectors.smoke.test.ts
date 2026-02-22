import {
  BaseEmrConnector,
  EpicConnector,
  CernerConnector,
  AthenaConnector,
} from '..';
import type { EmrConnectionConfig } from '@health-portal/core';

const baseConfig: Omit<EmrConnectionConfig, 'vendor'> = {
  fhirBaseUrl: 'https://fhir.example.com/r4',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  scopes: ['system/*.read'],
  tokenUrl: 'https://auth.example.com/token',
};

describe('emr-connectors smoke tests', () => {
  describe('EpicConnector', () => {
    it('instantiates as a subclass of BaseEmrConnector', () => {
      const connector = new EpicConnector(baseConfig);
      expect(connector).toBeInstanceOf(BaseEmrConnector);
      expect(connector).toBeInstanceOf(EpicConnector);
    });

    it('has vendor property set to "epic"', () => {
      const connector = new EpicConnector(baseConfig);
      expect(connector.vendor).toBe('epic');
    });

    it('has expected methods', () => {
      const connector = new EpicConnector(baseConfig);
      expect(typeof connector.authenticate).toBe('function');
      expect(typeof connector.searchPatient).toBe('function');
      expect(typeof connector.read).toBe('function');
      expect(typeof connector.search).toBe('function');
      expect(typeof connector.write).toBe('function');
      expect(typeof connector.pullChanges).toBe('function');
      expect(typeof connector.bulkExport).toBe('function');
    });
  });

  describe('CernerConnector', () => {
    it('instantiates as a subclass of BaseEmrConnector', () => {
      const connector = new CernerConnector(baseConfig);
      expect(connector).toBeInstanceOf(BaseEmrConnector);
      expect(connector).toBeInstanceOf(CernerConnector);
    });

    it('has vendor property set to "cerner"', () => {
      const connector = new CernerConnector(baseConfig);
      expect(connector.vendor).toBe('cerner');
    });

    it('has expected methods', () => {
      const connector = new CernerConnector(baseConfig);
      expect(typeof connector.authenticate).toBe('function');
      expect(typeof connector.searchPatient).toBe('function');
      expect(typeof connector.read).toBe('function');
      expect(typeof connector.search).toBe('function');
      expect(typeof connector.write).toBe('function');
      expect(typeof connector.pullChanges).toBe('function');
      expect(typeof connector.bulkExport).toBe('function');
    });
  });

  describe('AthenaConnector', () => {
    it('instantiates as a subclass of BaseEmrConnector', () => {
      const connector = new AthenaConnector(baseConfig);
      expect(connector).toBeInstanceOf(BaseEmrConnector);
      expect(connector).toBeInstanceOf(AthenaConnector);
    });

    it('has vendor property set to "athena"', () => {
      const connector = new AthenaConnector(baseConfig);
      expect(connector.vendor).toBe('athena');
    });

    it('has expected methods', () => {
      const connector = new AthenaConnector(baseConfig);
      expect(typeof connector.authenticate).toBe('function');
      expect(typeof connector.searchPatient).toBe('function');
      expect(typeof connector.read).toBe('function');
      expect(typeof connector.search).toBe('function');
      expect(typeof connector.write).toBe('function');
      expect(typeof connector.pullChanges).toBe('function');
      expect(typeof connector.bulkExport).toBe('function');
    });
  });
});
