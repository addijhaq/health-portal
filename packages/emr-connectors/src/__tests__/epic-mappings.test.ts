import type { Patient, Observation } from '@medplum/fhirtypes';
import { normalizeEpicResource, mapEpicIdentifiers, discoverIdentifierSystem } from '../epic/epic-mappings';

describe('Epic Mappings', () => {
  describe('normalizeEpicResource', () => {
    it('strips proprietary Epic extensions', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        extension: [
          { url: 'http://epic.com/fhir/extension/custom', valueString: 'proprietary' },
          { url: 'http://hl7.org/fhir/StructureDefinition/standard', valueString: 'keep' },
        ],
      };

      const normalized = normalizeEpicResource(resource);
      const ext = (normalized as unknown as { extension?: unknown[] }).extension;
      expect(ext).toHaveLength(1);
      expect((ext![0] as { url: string }).url).toContain('hl7.org');
    });

    it('removes extension array if empty after stripping', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        extension: [
          { url: 'http://epic.com/fhir/extension/custom', valueString: 'proprietary' },
        ],
      };

      const normalized = normalizeEpicResource(resource);
      expect((normalized as unknown as { extension?: unknown[] }).extension).toBeUndefined();
    });

    it('passes through resources without extensions unchanged', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
      };

      const normalized = normalizeEpicResource(resource);
      expect(normalized.code).toEqual(resource.code);
    });

    it('does not mutate the original resource', () => {
      const resource: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        extension: [
          { url: 'http://epic.com/fhir/extension/custom', valueString: 'drop' },
        ],
      };

      normalizeEpicResource(resource);
      expect(resource.extension).toHaveLength(1);
    });
  });

  describe('mapEpicIdentifiers', () => {
    it('adds MR type coding to MRN-typed identifiers', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          {
            type: { text: 'MRN' },
            system: 'urn:oid:1.2.3',
            value: '12345',
          },
        ],
      };

      const mapped = mapEpicIdentifiers(patient);
      expect(mapped.identifier![0].type?.coding).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MR' }),
        ])
      );
    });

    it('tags Epic FHIR ID system identifiers as secondary', () => {
      const epicSystem = 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.0';
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          { system: epicSystem, value: 'TnOZ.elPXC.123' },
        ],
      };

      const mapped = mapEpicIdentifiers(patient);
      expect(mapped.identifier![0].use).toBe('secondary');
    });

    it('returns patient unchanged if no identifiers', () => {
      const patient: Patient = { resourceType: 'Patient' };
      const mapped = mapEpicIdentifiers(patient);
      expect(mapped).toEqual(patient);
    });
  });

  describe('discoverIdentifierSystem', () => {
    it('returns system from FHIR-typed identifier', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          { type: { text: 'FHIR' }, system: 'urn:oid:1.2.3.4.5', value: 'abc' },
          { type: { text: 'MRN' }, system: 'urn:oid:9.9.9', value: '123' },
        ],
      };

      expect(discoverIdentifierSystem(patient)).toBe('urn:oid:1.2.3.4.5');
    });

    it('falls back to urn:oid identifier when no FHIR type', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          { system: 'urn:oid:6.7.8', value: 'xyz' },
        ],
      };

      expect(discoverIdentifierSystem(patient)).toBe('urn:oid:6.7.8');
    });

    it('returns default system when no identifiers', () => {
      const patient: Patient = { resourceType: 'Patient' };
      expect(discoverIdentifierSystem(patient)).toBe('urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.0');
    });
  });
});
