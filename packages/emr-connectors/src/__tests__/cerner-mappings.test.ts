import type { Patient, Observation } from '@medplum/fhirtypes';
import { normalizeCernerResource, mapCernerIdentifiers, discoverIdentifierSystem } from '../cerner/cerner-mappings';

describe('Cerner Mappings', () => {
  describe('normalizeCernerResource', () => {
    it('strips Cerner proprietary extensions', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        extension: [
          { url: 'http://fhir.cerner.com/extension/custom', valueString: 'drop' },
          { url: 'http://hl7.org/fhir/standard', valueString: 'keep' },
        ],
      };

      const normalized = normalizeCernerResource(resource);
      const ext = (normalized as unknown as { extension?: unknown[] }).extension;
      expect(ext).toHaveLength(1);
    });

    it('strips Oracle Health extensions', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        extension: [
          { url: 'http://fhir.oracle.com/extension/custom', valueString: 'drop' },
        ],
      };

      const normalized = normalizeCernerResource(resource);
      expect((normalized as unknown as { extension?: unknown[] }).extension).toBeUndefined();
    });
  });

  describe('mapCernerIdentifiers', () => {
    it('prefers CMRN identifiers for cross-facility matching', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          {
            type: { coding: [{ code: 'CMRN' }] },
            system: 'urn:oid:2.16.840.1.113883.6.1000',
            value: 'CMRN-789',
          },
          {
            type: { coding: [{ code: 'MR' }] },
            system: 'urn:oid:2.16.840.1.113883.6.1000',
            value: 'MR-123',
          },
        ],
      };

      const mapped = mapCernerIdentifiers(patient);
      expect(mapped.identifier![0].use).toBe('usual'); // CMRN gets 'usual'
    });

    it('tags Cerner FHIR ID system as secondary', () => {
      const cernerSystem = 'urn:oid:2.16.840.1.113883.6.1000';
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          { system: cernerSystem, value: '12724066' },
        ],
      };

      const mapped = mapCernerIdentifiers(patient);
      expect(mapped.identifier![0].use).toBe('secondary');
    });
  });

  describe('discoverIdentifierSystem', () => {
    it('returns CMRN system if available', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          {
            type: { coding: [{ code: 'CMRN' }] },
            system: 'urn:oid:2.16.840.1.113883.6.9999',
            value: 'CMRN-001',
          },
        ],
      };

      expect(discoverIdentifierSystem(patient)).toBe('urn:oid:2.16.840.1.113883.6.9999');
    });

    it('returns default when no identifiers', () => {
      const patient: Patient = { resourceType: 'Patient' };
      expect(discoverIdentifierSystem(patient)).toBe('urn:oid:2.16.840.1.113883.6.1000');
    });
  });
});
