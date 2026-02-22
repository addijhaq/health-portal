import {
  IDENTIFIER_SYSTEMS,
  CODE_SYSTEMS,
  HL7_DEFAULTS,
  HL7_MESSAGE_TYPES,
  PHENOML_VOCABULARIES,
  extractMatchCriteria,
  toHl7Timestamp,
  fromHl7Timestamp,
  resourceHash,
} from '..';
import type {
  EmrVendor,
  EmrConnectionConfig,
  SyncResult,
  SyncError,
  Hl7MessageMeta,
  PhenoMlConfig,
  PatientMatchCriteria,
  Patient,
} from '..';

describe('core smoke tests', () => {
  describe('constants', () => {
    it('IDENTIFIER_SYSTEMS has correct MRN and NPI URIs', () => {
      expect(IDENTIFIER_SYSTEMS.MRN).toBe('http://health-portal.local/mrn');
      expect(IDENTIFIER_SYSTEMS.NPI).toBe('http://hl7.org/fhir/sid/us-npi');
    });

    it('CODE_SYSTEMS has correct LOINC URI', () => {
      expect(CODE_SYSTEMS.LOINC).toBe('http://loinc.org');
    });

    it('CODE_SYSTEMS has correct ICD-10-CM URI', () => {
      expect(CODE_SYSTEMS.ICD10_CM).toBe('http://hl7.org/fhir/sid/icd-10-cm');
    });

    it('CODE_SYSTEMS has correct SNOMED URI', () => {
      expect(CODE_SYSTEMS.SNOMED).toBe('http://snomed.info/sct');
    });

    it('CODE_SYSTEMS has correct RXNORM URI', () => {
      expect(CODE_SYSTEMS.RXNORM).toBe('http://www.nlm.nih.gov/research/umls/rxnorm');
    });

    it('HL7_DEFAULTS has correct listen port and version', () => {
      expect(HL7_DEFAULTS.LISTEN_PORT).toBe(2575);
      expect(HL7_DEFAULTS.VERSION).toBe('2.5.1');
    });

    it('HL7_MESSAGE_TYPES contains expected message type entries', () => {
      expect(HL7_MESSAGE_TYPES.ADT_A01).toBeDefined();
      expect(HL7_MESSAGE_TYPES.ADT_A01.type).toBe('ADT');
      expect(HL7_MESSAGE_TYPES.ADT_A01.event).toBe('A01');
      expect(HL7_MESSAGE_TYPES.ORU_R01).toBeDefined();
      expect(HL7_MESSAGE_TYPES.ORU_R01.type).toBe('ORU');
      expect(HL7_MESSAGE_TYPES.ORU_R01.event).toBe('R01');
    });

    it('PHENOML_VOCABULARIES contains 7 entries', () => {
      expect(PHENOML_VOCABULARIES).toHaveLength(7);
      expect(PHENOML_VOCABULARIES).toContain('ICD-10-CM');
      expect(PHENOML_VOCABULARIES).toContain('SNOMED');
      expect(PHENOML_VOCABULARIES).toContain('LOINC');
    });
  });

  describe('extractMatchCriteria', () => {
    it('extracts firstName, lastName, DOB, and gender from a FHIR Patient', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Smith', given: ['John'] }],
        birthDate: '1990-01-15',
        gender: 'male',
      };

      const criteria = extractMatchCriteria(patient);

      expect(criteria.firstName).toBe('John');
      expect(criteria.lastName).toBe('Smith');
      expect(criteria.dateOfBirth).toBe('1990-01-15');
      expect(criteria.gender).toBe('male');
    });
  });

  describe('toHl7Timestamp', () => {
    it('converts a Date to YYYYMMDDHHmmss format', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = toHl7Timestamp(date);
      expect(result).toContain('20240115103000');
    });
  });

  describe('fromHl7Timestamp', () => {
    it('parses a YYYYMMDDHHmmss string into a Date with correct components', () => {
      const result = fromHl7Timestamp('20240115103000');
      expect(result.getUTCFullYear()).toBe(2024);
      expect(result.getUTCMonth()).toBe(0); // January is 0
      expect(result.getUTCDate()).toBe(15);
    });
  });

  describe('HL7 timestamp round-trip', () => {
    it('fromHl7Timestamp(toHl7Timestamp(date)) restores the same date to the second', () => {
      const original = new Date('2024-06-20T14:45:30Z');
      const roundTripped = fromHl7Timestamp(toHl7Timestamp(original));

      // Compare to the second (strip milliseconds)
      expect(Math.floor(roundTripped.getTime() / 1000)).toBe(
        Math.floor(original.getTime() / 1000)
      );
    });
  });

  describe('resourceHash', () => {
    it('returns a pipe-delimited hash string', () => {
      const result = resourceHash('Patient', 'http://loinc.org', '12345');
      expect(result).toBe('Patient|http://loinc.org|12345');
    });
  });

  describe('types compile', () => {
    it('typed variables can be assigned without errors', () => {
      const vendor: EmrVendor = 'epic';
      const config: EmrConnectionConfig = {
        vendor: 'epic',
        fhirBaseUrl: 'https://example.com/fhir',
        clientId: 'test-client',
        scopes: ['system/*.read'],
        tokenUrl: 'https://example.com/token',
      };
      const syncResult: SyncResult = {
        vendor: 'epic',
        direction: 'import',
        resourceType: 'Patient',
        created: 1,
        updated: 0,
        errors: [],
        timestamp: '2024-01-01T00:00:00Z',
      };
      const criteria: PatientMatchCriteria = {
        firstName: 'John',
        lastName: 'Smith',
      };
      const meta: Hl7MessageMeta = {
        messageType: 'ADT',
        triggerEvent: 'A01',
        messageControlId: '123',
        sendingFacility: 'HOSP',
        receivingFacility: 'LAB',
        timestamp: '20240115103000',
      };
      const phenoConfig: PhenoMlConfig = {
        apiKey: 'test',
        baseUrl: 'https://api.pheno.ml',
        fhirServerType: 'medplum',
      };

      // If this compiles, the types are working
      expect(vendor).toBe('epic');
      expect(config.vendor).toBe('epic');
      expect(syncResult.created).toBe(1);
      expect(criteria.firstName).toBe('John');
      expect(meta.messageType).toBe('ADT');
      expect(phenoConfig.apiKey).toBe('test');
    });
  });
});
