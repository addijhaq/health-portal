import * as fs from 'fs';
import * as path from 'path';
import type { Hl7MessageMeta } from '@health-portal/core';
import type { Bundle, Appointment } from '@medplum/fhirtypes';
import { transformSiu } from '../transforms/siu-transform';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');

function loadFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES, filename), 'utf-8').replace(/\n/g, '\r');
}

function makeMeta(overrides: Partial<Hl7MessageMeta> = {}): Hl7MessageMeta {
  return {
    messageType: 'SIU',
    triggerEvent: 'S12',
    messageControlId: 'MSG00006',
    sendingFacility: 'HOSP_FAC',
    receivingFacility: 'PORTAL_FAC',
    timestamp: '20240119100000',
    ...overrides,
  };
}

describe('SIU Transform', () => {
  describe('SIU^S12 (New Appointment)', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      const raw = loadFixture('siu-s12-new-appointment.hl7');
      bundle = await transformSiu(raw, makeMeta({ triggerEvent: 'S12' }));
    });

    it('returns a transaction Bundle', () => {
      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('transaction');
    });

    it('creates an Appointment with status=booked', () => {
      const apptEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Appointment'
      );
      expect(apptEntry).toBeDefined();

      const appointment = apptEntry!.resource as Appointment;
      expect(appointment.status).toBe('booked');
    });

    it('has patient participant', () => {
      const apptEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Appointment'
      );
      const appointment = apptEntry!.resource as Appointment;

      const patientParticipant = appointment.participant!.find(
        (p) => p.actor?.reference?.includes('patient-')
      );
      expect(patientParticipant).toBeDefined();
      expect(patientParticipant!.status).toBe('accepted');
    });

    it('has provider participant from AIG', () => {
      const apptEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Appointment'
      );
      const appointment = apptEntry!.resource as Appointment;

      // Should have at least 2 participants (patient + provider)
      expect(appointment.participant!.length).toBeGreaterThanOrEqual(2);

      const providerParticipant = appointment.participant!.find(
        (p) => p.actor?.identifier?.system === 'http://hl7.org/fhir/sid/us-npi'
      );
      expect(providerParticipant).toBeDefined();
      expect(providerParticipant!.actor!.identifier!.value).toBe('1234567890');
    });

    it('creates a Patient resource', () => {
      const patientEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Patient'
      );
      expect(patientEntry).toBeDefined();
    });

    it('Appointment has identifier from SCH-1', () => {
      const apptEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Appointment'
      );
      const appointment = apptEntry!.resource as Appointment;
      expect(appointment.identifier?.[0].value).toBe('APT1001');
    });
  });

  describe('SIU^S15 (Cancel Appointment)', () => {
    let bundle: Bundle;

    beforeAll(async () => {
      const raw = loadFixture('siu-s15-cancel-appointment.hl7');
      bundle = await transformSiu(raw, makeMeta({ triggerEvent: 'S15', messageControlId: 'MSG00007' }));
    });

    it('creates an Appointment with status=cancelled', () => {
      const apptEntry = bundle.entry!.find(
        (e) => (e.resource as any)?.resourceType === 'Appointment'
      );
      expect(apptEntry).toBeDefined();

      const appointment = apptEntry!.resource as Appointment;
      expect(appointment.status).toBe('cancelled');
    });
  });
});
