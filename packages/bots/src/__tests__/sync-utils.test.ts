import type { BundleEntry, Observation, Patient } from '@medplum/fhirtypes';
import {
  buildIdMap,
  remapReferences,
  reverseRemapReferences,
  preserveVendorIdentifier,
  sortByDependencyTier,
  deterministicMatch,
  probabilisticMatch,
  buildSyncAuditEvent,
} from '../emr-sync/sync-utils';

describe('sync-utils', () => {
  describe('buildIdMap', () => {
    it('creates correct Map entries keyed by vendor:type:id', () => {
      const map = buildIdMap('epic', [
        { vendorId: 'TnOZ.abc', medplumId: 'med-001', resourceType: 'Patient' },
        { vendorId: 'obs-999', medplumId: 'med-002', resourceType: 'Observation' },
      ]);

      expect(map.get('epic:Patient:TnOZ.abc')).toBe('med-001');
      expect(map.get('epic:Observation:obs-999')).toBe('med-002');
      expect(map.size).toBe(2);
    });
  });

  describe('remapReferences', () => {
    it('rewrites vendor refs to Medplum IDs', () => {
      const idMap = new Map([
        ['epic:Patient:P123', 'med-patient-001'],
        ['epic:Encounter:E456', 'med-encounter-001'],
      ]);

      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: 'Patient/P123' },
        encounter: { reference: 'Encounter/E456' },
      };

      const { resource, unresolvedRefs } = remapReferences(observation, idMap, 'epic');
      const remapped = resource as Observation;

      expect(remapped.subject?.reference).toBe('Patient/med-patient-001');
      expect(remapped.encounter?.reference).toBe('Encounter/med-encounter-001');
      expect(unresolvedRefs).toHaveLength(0);
    });

    it('skips contained (#fragment) references', () => {
      const idMap = new Map<string, string>();

      const resource = {
        resourceType: 'MedicationRequest' as const,
        status: 'active' as const,
        intent: 'order' as const,
        subject: { reference: '#contained-patient' },
        medicationReference: { reference: '#contained-med' },
      };

      const { unresolvedRefs } = remapReferences(resource as any, idMap, 'cerner');
      // Fragment references should not appear in unresolved
      expect(unresolvedRefs).toHaveLength(0);
    });

    it('reports unresolved references', () => {
      const idMap = new Map([['epic:Patient:P123', 'med-001']]);

      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: 'Patient/P123' },
        encounter: { reference: 'Encounter/UNKNOWN' },
      };

      const { resource, unresolvedRefs } = remapReferences(observation, idMap, 'epic');
      expect((resource as Observation).subject?.reference).toBe('Patient/med-001');
      expect(unresolvedRefs).toContain('Encounter/UNKNOWN');
    });

    it('does not mutate original resource', () => {
      const idMap = new Map([['epic:Patient:P1', 'med-1']]);
      const original: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: 'Patient/P1' },
      };

      remapReferences(original, idMap, 'epic');
      expect(original.subject?.reference).toBe('Patient/P1');
    });
  });

  describe('reverseRemapReferences', () => {
    it('rewrites Medplum IDs back to vendor IDs', () => {
      const idMap = new Map([
        ['epic:Patient:P123', 'med-001'],
        ['epic:Encounter:E456', 'med-002'],
      ]);

      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: 'Patient/med-001' },
        encounter: { reference: 'Encounter/med-002' },
      };

      const { resource } = reverseRemapReferences(observation, idMap, 'epic');
      const remapped = resource as Observation;

      expect(remapped.subject?.reference).toBe('Patient/P123');
      expect(remapped.encounter?.reference).toBe('Encounter/E456');
    });
  });

  describe('preserveVendorIdentifier', () => {
    it('adds vendor identifier to Patient', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          { system: 'http://health-portal.local/mrn', value: 'LOCAL-001' },
        ],
      };

      const enriched = preserveVendorIdentifier(patient, 'cerner', '12724066', 'urn:oid:2.16.840.1.113883.6.1000');

      expect(enriched.identifier).toHaveLength(2);
      expect(enriched.identifier![1].system).toBe('urn:oid:2.16.840.1.113883.6.1000');
      expect(enriched.identifier![1].value).toBe('12724066');
      expect(enriched.identifier![1].use).toBe('secondary');
    });

    it('does not duplicate existing vendor identifier', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          { system: 'urn:oid:2.16.840.1.113883.6.1000', value: '12724066' },
        ],
      };

      const enriched = preserveVendorIdentifier(patient, 'cerner', '12724066', 'urn:oid:2.16.840.1.113883.6.1000');
      expect(enriched.identifier).toHaveLength(1);
    });

    it('handles Patient with no existing identifiers', () => {
      const patient: Patient = { resourceType: 'Patient' };

      const enriched = preserveVendorIdentifier(patient, 'epic', 'TnOZ.abc', 'urn:oid:1.2.3');
      expect(enriched.identifier).toHaveLength(1);
    });
  });

  describe('sortByDependencyTier', () => {
    it('sorts resources in tier order', () => {
      const entries: BundleEntry[] = [
        { resource: { resourceType: 'Observation', status: 'final', code: { text: 'x' } } },
        { resource: { resourceType: 'Patient' } },
        { resource: { resourceType: 'Organization' } },
        { resource: { resourceType: 'Encounter', status: 'finished', class: { code: 'AMB' } } },
        { resource: { resourceType: 'Coverage', status: 'active', beneficiary: { reference: 'Patient/1' }, payor: [{ reference: 'Organization/1' }] } },
      ];

      const sorted = sortByDependencyTier(entries);
      const types = sorted.map((e) => e.resource?.resourceType);

      expect(types).toEqual([
        'Organization',  // Tier 1
        'Patient',       // Tier 2
        'Encounter',     // Tier 3
        'Observation',   // Tier 5
        'Coverage',      // Tier 6
      ]);
    });
  });

  describe('deterministicMatch', () => {
    const candidates: Patient[] = [
      {
        resourceType: 'Patient',
        id: 'p1',
        name: [{ family: 'Smith', given: ['John'] }],
        birthDate: '1990-01-15',
        gender: 'male',
      },
      {
        resourceType: 'Patient',
        id: 'p2',
        name: [{ family: 'Doe', given: ['Jane'] }],
        birthDate: '1985-06-20',
        gender: 'female',
      },
    ];

    it('matches on lastName + DOB + gender', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Smith', given: ['John'] }],
        birthDate: '1990-01-15',
        gender: 'male',
      };

      const match = deterministicMatch(patient, candidates);
      expect(match?.id).toBe('p1');
    });

    it('returns null when no match found', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Nobody', given: ['No'] }],
        birthDate: '2000-01-01',
        gender: 'other',
      };

      expect(deterministicMatch(patient, candidates)).toBeNull();
    });

    it('returns null when required fields missing', () => {
      const patient: Patient = { resourceType: 'Patient' };
      expect(deterministicMatch(patient, candidates)).toBeNull();
    });
  });

  describe('probabilisticMatch', () => {
    const candidates: Patient[] = [
      {
        resourceType: 'Patient',
        id: 'p1',
        name: [{ family: 'Smith', given: ['John'] }],
        birthDate: '1990-01-15',
        gender: 'male',
        telecom: [{ system: 'phone', value: '555-1234' }],
      },
    ];

    it('returns match above threshold', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Smith', given: ['John'] }],
        birthDate: '1990-01-15',
        gender: 'male',
        telecom: [{ system: 'phone', value: '555-1234' }],
      };

      const results = probabilisticMatch(patient, candidates, 0.85);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThanOrEqual(0.85);
    });

    it('returns empty when below threshold', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Different', given: ['Person'] }],
        birthDate: '2000-12-31',
        gender: 'female',
      };

      const results = probabilisticMatch(patient, candidates, 0.85);
      expect(results).toHaveLength(0);
    });

    it('sorts results by score descending', () => {
      const moreCandidates: Patient[] = [
        ...candidates,
        {
          resourceType: 'Patient',
          id: 'p2',
          name: [{ family: 'Smith', given: ['Jon'] }], // close first name
          birthDate: '1990-01-15',
          gender: 'male',
        },
      ];

      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Smith', given: ['John'] }],
        birthDate: '1990-01-15',
        gender: 'male',
      };

      const results = probabilisticMatch(patient, moreCandidates, 0.5);
      if (results.length > 1) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      }
    });
  });

  describe('buildSyncAuditEvent', () => {
    it('creates AuditEvent with correct fields', () => {
      const event = buildSyncAuditEvent({
        vendor: 'epic',
        direction: 'import',
        resourceType: 'Patient',
        created: 10,
        updated: 2,
        errors: [],
        timestamp: '2026-01-01T00:00:00Z',
      });

      expect(event.resourceType).toBe('AuditEvent');
      expect(event.outcome).toBe('0');
      expect(event.outcomeDesc).toContain('epic');
      expect(event.outcomeDesc).toContain('10 created');
    });

    it('sets outcome to 4 when errors exist', () => {
      const event = buildSyncAuditEvent({
        vendor: 'cerner',
        direction: 'export',
        resourceType: 'Observation',
        created: 0,
        updated: 0,
        errors: [{ resourceType: 'Observation', message: 'fail', code: 'ERR' }],
        timestamp: '2026-01-01T00:00:00Z',
      });

      expect(event.outcome).toBe('4');
    });
  });
});
