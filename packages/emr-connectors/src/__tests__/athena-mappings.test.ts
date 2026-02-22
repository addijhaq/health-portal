import type { Patient, Observation } from '@medplum/fhirtypes';
import { normalizeAthenaResource, mapAthenaIdentifiers, discoverIdentifierSystem } from '../athena/athena-mappings';

describe('Athena Mappings', () => {
  describe('normalizeAthenaResource', () => {
    it('strips athena-specific extensions', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        extension: [
          { url: 'http://example.com/athena-subscription-extension-owner', valueString: 'drop' },
          { url: 'http://example.com/athena-coverage-extension-coverage-type', valueString: 'drop' },
          { url: 'http://hl7.org/fhir/standard', valueString: 'keep' },
        ],
      };

      const normalized = normalizeAthenaResource(resource);
      const ext = (normalized as unknown as { extension?: unknown[] }).extension;
      expect(ext).toHaveLength(1);
      expect((ext![0] as { url: string }).url).toContain('hl7.org');
    });

    it('strips athenahealth.com extensions', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        extension: [
          { url: 'http://fhir.athenahealth.com/extension/custom', valueString: 'drop' },
        ],
      };

      const normalized = normalizeAthenaResource(resource);
      expect((normalized as unknown as { extension?: unknown[] }).extension).toBeUndefined();
    });
  });

  describe('mapAthenaIdentifiers', () => {
    it('tags athena FHIR ID system as secondary', () => {
      const athenaSystem = 'urn:oid:2.16.840.1.113883.3.666.5.2';
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          { system: athenaSystem, value: '99887766' },
        ],
      };

      const mapped = mapAthenaIdentifiers(patient);
      expect(mapped.identifier![0].use).toBe('secondary');
    });

    it('adds MRN text to MR-type identifiers', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          {
            type: { coding: [{ code: 'MR' }] },
            system: 'urn:oid:custom',
            value: '12345',
          },
        ],
      };

      const mapped = mapAthenaIdentifiers(patient);
      expect(mapped.identifier![0].type?.text).toBe('MRN');
    });
  });

  describe('discoverIdentifierSystem', () => {
    it('returns MR-type identifier system', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          {
            type: { coding: [{ code: 'MR' }] },
            system: 'urn:oid:1.2.3.4.5',
            value: '999',
          },
        ],
      };

      expect(discoverIdentifierSystem(patient)).toBe('urn:oid:1.2.3.4.5');
    });

    it('returns default when no identifiers', () => {
      const patient: Patient = { resourceType: 'Patient' };
      expect(discoverIdentifierSystem(patient)).toBe('urn:oid:2.16.840.1.113883.3.666.5.2');
    });
  });
});
