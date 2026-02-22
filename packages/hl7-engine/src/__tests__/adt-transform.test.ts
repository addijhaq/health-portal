import * as fs from 'fs';
import * as path from 'path';
import type { Hl7MessageMeta } from '@health-portal/core';
import type { Bundle, Patient, Encounter, Condition, Coverage, RelatedPerson } from '@medplum/fhirtypes';
import { transformAdt } from '../transforms/adt-transform';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');
const ORIGIN_TAG = { system: 'http://health-portal/origin', code: 'hl7-v2' };

function loadFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES, filename), 'utf-8').replace(/\n/g, '\r');
}

function makeMeta(overrides: Partial<Hl7MessageMeta> = {}): Hl7MessageMeta {
  return {
    messageType: 'ADT',
    triggerEvent: 'A01',
    messageControlId: 'MSG00001',
    sendingFacility: 'HOSP_FAC',
    receivingFacility: 'PORTAL_FAC',
    timestamp: '20240115103000',
    ...overrides,
  };
}

describe('ADT Transform', () => {
  describe('ADT^A01 (Admit)', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      const raw = loadFixture('adt-a01-admit.hl7');
      bundle = await transformAdt(raw, makeMeta({ triggerEvent: 'A01' }));
    });

    it('returns a transaction Bundle', () => {
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('transaction');
    });

    it('creates a Patient resource from PID', () => {
      const patientEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Patient'
      );
      expect(patientEntry).toBeDefined();

      const patient = patientEntry!.resource as Patient;
      expect(patient.name![0].family).toBe('Smith');
      expect(patient.name![0].given).toEqual(['John']);
      expect(patient.birthDate).toBe('1990-01-15');
      expect(patient.gender).toBe('male');

      // MRN identifier
      const mrn = patient.identifier!.find(
        (id) => id.system === 'http://health-portal.local/mrn'
      );
      expect(mrn?.value).toBe('MRN1001');
    });

    it('creates an Encounter with status=in-progress', () => {
      const encounterEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Encounter'
      );
      expect(encounterEntry).toBeDefined();

      const encounter = encounterEntry!.resource as Encounter;
      expect(encounter.status).toBe('in-progress');
      expect(encounter.subject?.reference).toContain('patient-MRN1001');
    });

    it('creates a Condition from DG1', () => {
      const conditionEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Condition'
      );
      expect(conditionEntry).toBeDefined();

      const condition = conditionEntry!.resource as Condition;
      expect(condition.code?.coding?.[0].code).toBe('E11.9');
      expect(condition.code?.coding?.[0].display).toBe('Type 2 diabetes mellitus');
    });

    it('creates a Coverage from IN1', () => {
      const coverageEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Coverage'
      );
      expect(coverageEntry).toBeDefined();

      const coverage = coverageEntry!.resource as Coverage;
      expect(coverage.status).toBe('active');
      expect(coverage.subscriberId).toBe('SUB12345');
      expect(coverage.payor?.[0].display).toBe('BCBS');
    });

    it('creates a RelatedPerson from NK1', () => {
      const rpEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'RelatedPerson'
      );
      expect(rpEntry).toBeDefined();

      const rp = rpEntry!.resource as RelatedPerson;
      expect(rp.name![0].family).toBe('Smith');
      expect(rp.name![0].given).toEqual(['Jane']);
      expect(rp.relationship?.[0].coding?.[0].code).toBe('SPO');
    });

    it('all resources have hl7-v2 origin tag', () => {
      for (const entry of bundle.entry!) {
        const tags = (entry.resource as any)?.meta?.tag;
        expect(tags).toEqual(expect.arrayContaining([ORIGIN_TAG]));
      }
    });

    it('Patient entry uses PUT with identifier match', () => {
      const patientEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Patient'
      );
      expect(patientEntry!.request!.method).toBe('PUT');
      expect(patientEntry!.request!.url).toContain('Patient?identifier=');
    });
  });

  describe('ADT^A03 (Discharge)', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      const raw = loadFixture('adt-a03-discharge.hl7');
      bundle = await transformAdt(raw, makeMeta({ triggerEvent: 'A03', messageControlId: 'MSG00002' }));
    });

    it('creates an Encounter with status=finished', () => {
      const encounterEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Encounter'
      );
      expect(encounterEntry).toBeDefined();

      const encounter = encounterEntry!.resource as Encounter;
      expect(encounter.status).toBe('finished');
    });
  });

  describe('ADT^A04 (Register)', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      const raw = loadFixture('adt-a04-register.hl7');
      bundle = await transformAdt(raw, makeMeta({ triggerEvent: 'A04', messageControlId: 'MSG00003' }));
    });

    it('creates Patient + Encounter', () => {
      const types = bundle.entry!.map((e) => (e.resource as any)?.resourceType);
      expect(types).toContain('Patient');
      expect(types).toContain('Encounter');
    });

    it('creates an Encounter with status=planned', () => {
      const encounterEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Encounter'
      );
      const encounter = encounterEntry!.resource as Encounter;
      expect(encounter.status).toBe('planned');
    });

    it('Patient has SSN identifier from PID.4', () => {
      const patientEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Patient'
      );
      const patient = patientEntry!.resource as Patient;
      const ssn = patient.identifier?.find(
        (id) => id.system === 'http://hl7.org/fhir/sid/us-ssn'
      );
      expect(ssn?.value).toBe('999-88-7777');
    });
  });
});
