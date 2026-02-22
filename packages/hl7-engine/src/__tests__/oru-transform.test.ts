import * as fs from 'fs';
import * as path from 'path';
import type { Hl7MessageMeta } from '@health-portal/core';
import type { Bundle, DiagnosticReport, Observation, DocumentReference } from '@medplum/fhirtypes';
import { transformOru } from '../transforms/oru-transform';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');
const ORIGIN_TAG = { system: 'http://health-portal/origin', code: 'hl7-v2' };

function loadFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES, filename), 'utf-8').replace(/\n/g, '\r');
}

function makeMeta(overrides: Partial<Hl7MessageMeta> = {}): Hl7MessageMeta {
  return {
    messageType: 'ORU',
    triggerEvent: 'R01',
    messageControlId: 'MSG00004',
    sendingFacility: 'LAB_FAC',
    receivingFacility: 'PORTAL_FAC',
    timestamp: '20240117120000',
    ...overrides,
  };
}

describe('ORU Transform', () => {
  describe('ORU^R01 CBC', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      const raw = loadFixture('oru-r01-cbc.hl7');
      bundle = await transformOru(raw, makeMeta());
    });

    it('returns a transaction Bundle', () => {
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('transaction');
    });

    it('creates a Patient resource', () => {
      const patientEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Patient'
      );
      expect(patientEntry).toBeDefined();
    });

    it('creates a DiagnosticReport', () => {
      const reportEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'DiagnosticReport'
      );
      expect(reportEntry).toBeDefined();

      const report = reportEntry!.resource as DiagnosticReport;
      expect(report.code?.coding?.[0].code).toBe('58410-2');
      expect(report.code?.coding?.[0].display).toBe('CBC');
      expect(report.status).toBe('final');
    });

    it('creates 5 Observations for CBC panel', () => {
      const observations = bundle.entry!.filter(
        (e) => (e.resource as any)?.resourceType === 'Observation'
      );
      expect(observations).toHaveLength(5);
    });

    it('parses NM value type to valueQuantity', () => {
      const wbcEntry = bundle.entry!.find((e) => {
        const obs = e.resource as Observation;
        return obs.resourceType === 'Observation' && obs.code?.coding?.[0].code === '6690-2';
      });
      expect(wbcEntry).toBeDefined();

      const wbc = wbcEntry!.resource as Observation;
      expect(wbc.valueQuantity?.value).toBe(7.5);
      expect(wbc.valueQuantity?.unit).toBe('10*3/uL');
    });

    it('maps OBX-11 status F to final', () => {
      const observations = bundle.entry!.filter(
        (e) => (e.resource as any)?.resourceType === 'Observation'
      );
      for (const obsEntry of observations) {
        const obs = obsEntry.resource as Observation;
        expect(obs.status).toBe('final');
      }
    });

    it('DiagnosticReport references all Observations', () => {
      const report = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'DiagnosticReport'
      )!.resource as DiagnosticReport;

      expect(report.result).toHaveLength(5);
      for (const ref of report.result!) {
        expect(ref.reference).toMatch(/^urn:uuid:obs-/);
      }
    });

    it('includes reference ranges from OBX-7', () => {
      const wbcEntry = bundle.entry!.find((e) => {
        const obs = e.resource as Observation;
        return obs.resourceType === 'Observation' && obs.code?.coding?.[0].code === '6690-2';
      });
      const wbc = wbcEntry!.resource as Observation;
      expect(wbc.referenceRange?.[0].text).toBe('4.5-11.0');
    });

    it('all resources have hl7-v2 origin tag', () => {
      for (const entry of bundle.entry!) {
        const tags = (entry.resource as any)?.meta?.tag;
        expect(tags).toEqual(expect.arrayContaining([ORIGIN_TAG]));
      }
    });
  });

  describe('ORU^R01 BMP', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      const raw = loadFixture('oru-r01-bmp.hl7');
      bundle = await transformOru(raw, makeMeta({ messageControlId: 'MSG00005' }));
    });

    it('creates 7 Observations for BMP panel', () => {
      const observations = bundle.entry!.filter(
        (e) => (e.resource as any)?.resourceType === 'Observation'
      );
      expect(observations).toHaveLength(7);
    });

    it('creates a DiagnosticReport with BMP code', () => {
      const report = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'DiagnosticReport'
      )!.resource as DiagnosticReport;

      expect(report.code?.coding?.[0].code).toBe('24323-8');
      expect(report.code?.coding?.[0].display).toBe('BMP');
    });
  });

  describe('Unmatched patient scenario', () => {
    it('creates DocumentReference with unmatched-oru category when no MRN', async () => {
      // ORU message without PID.3 (no MRN)
      const rawNoMrn = [
        'MSH|^~\\&|LAB|FAC|HP|PF|20240117||ORU^R01|MSG999|P|2.5.1',
        'PID|1||||Smith^John||19900115|M',
        'OBR|1|ORD001||58410-2^CBC^LOINC',
        'OBX|1|NM|6690-2^WBC^LOINC||7.5|10*3/uL',
      ].join('\r');

      const bundle = await transformOru(
        rawNoMrn,
        makeMeta({ messageControlId: 'MSG999' })
      );

      expect(bundle.entry).toHaveLength(1);
      const docRef = bundle.entry![0].resource as DocumentReference;
      expect(docRef.resourceType).toBe('DocumentReference');
      expect(docRef.category?.[0].coding?.[0].code).toBe('unmatched-oru');
      expect(docRef.content?.[0].attachment?.contentType).toBe('text/plain');
    });
  });

  describe('OBX value type parsing', () => {
    it('parses ST (string) value type', async () => {
      const raw = [
        'MSH|^~\\&|LAB|FAC|HP|PF|20240117||ORU^R01|MSG_ST|P|2.5.1',
        'PID|1||MRN_ST^^^MRN||Test^Patient||19900101|M',
        'OBR|1|ORD_ST||TEST^Test Panel^LOINC',
        'OBX|1|ST|COMMENT^Comment^LOINC||Normal appearance|||N||F',
      ].join('\r');

      const bundle = await transformOru(raw, makeMeta({ messageControlId: 'MSG_ST' }));
      const obs = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Observation'
      )!.resource as Observation;

      expect(obs.valueString).toBe('Normal appearance');
    });

    it('parses CE (coded element) value type', async () => {
      const raw = [
        'MSH|^~\\&|LAB|FAC|HP|PF|20240117||ORU^R01|MSG_CE|P|2.5.1',
        'PID|1||MRN_CE^^^MRN||Test^Patient||19900101|M',
        'OBR|1|ORD_CE||TEST^Test Panel^LOINC',
        'OBX|1|CE|BLOOD_TYPE^Blood Type^LOINC||A+^A Positive^LOCAL|||N||F',
      ].join('\r');

      const bundle = await transformOru(raw, makeMeta({ messageControlId: 'MSG_CE' }));
      const obs = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Observation'
      )!.resource as Observation;

      expect(obs.valueCodeableConcept?.coding?.[0].code).toBe('A+');
      expect(obs.valueCodeableConcept?.coding?.[0].display).toBe('A Positive');
    });
  });
});
