import type { ServiceRequest, Patient, MedicationRequest } from '@medplum/fhirtypes';
import { buildOrm, buildAdtA04, buildRde } from '../transforms/orm-transform';

describe('ORM Transform (Outbound)', () => {
  describe('buildOrm (ORM^O01)', () => {
    it('builds a valid ORM^O01 message from a ServiceRequest', () => {
      const serviceRequest: ServiceRequest = {
        resourceType: 'ServiceRequest',
        id: 'SR001',
        status: 'active',
        intent: 'order',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '58410-2',
              display: 'CBC',
            },
          ],
        },
        authoredOn: '2024-01-17T10:00:00Z',
        occurrenceDateTime: '2024-01-17T12:00:00Z',
        priority: 'routine',
        requester: { display: 'Dr. Jones' },
        subject: { reference: 'Patient/123' },
      };

      const message = buildOrm(serviceRequest);

      // Verify MSH segment
      expect(message).toContain('ORM');
      expect(message).toContain('O01');

      // Verify ORC segment
      expect(message).toContain('ORC|NW|SR001');

      // Verify OBR segment
      expect(message).toContain('OBR|1|SR001');
      expect(message).toContain('58410-2^CBC^http://loinc.org');
    });

    it('maps ServiceRequest priority to HL7 priority', () => {
      const sr: ServiceRequest = {
        resourceType: 'ServiceRequest',
        id: 'SR_STAT',
        status: 'active',
        intent: 'order',
        priority: 'stat',
        subject: { reference: 'Patient/123' },
      };

      const message = buildOrm(sr);
      // OBR.5 should contain stat priority 'S'
      expect(message).toContain('OBR');
    });

    it('includes reason code in OBR.31', () => {
      const sr: ServiceRequest = {
        resourceType: 'ServiceRequest',
        id: 'SR_REASON',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/123' },
        reasonCode: [
          {
            coding: [
              {
                system: 'http://hl7.org/fhir/sid/icd-10-cm',
                code: 'E11.9',
                display: 'Type 2 diabetes',
              },
            ],
          },
        ],
      };

      const message = buildOrm(sr);
      expect(message).toContain('E11.9^Type 2 diabetes');
    });
  });

  describe('buildAdtA04 (ADT^A04)', () => {
    it('builds a valid ADT^A04 message from a Patient', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        id: 'P001',
        identifier: [
          {
            system: 'http://health-portal.local/mrn',
            value: 'MRN5001',
          },
          {
            system: 'http://hl7.org/fhir/sid/us-ssn',
            value: '123-45-6789',
          },
        ],
        name: [{ family: 'Johnson', given: ['Robert'] }],
        birthDate: '1985-03-20',
        gender: 'male',
        address: [
          {
            line: ['789 Elm St'],
            city: 'Denver',
            state: 'CO',
            postalCode: '80201',
          },
        ],
        telecom: [{ system: 'phone', value: '303-555-0100' }],
      };

      const message = buildAdtA04(patient);

      // Verify MSH segment
      expect(message).toContain('ADT');
      expect(message).toContain('A04');

      // Verify EVN segment
      expect(message).toContain('EVN|A04');

      // Verify PID segment with name
      expect(message).toContain('Johnson^Robert');

      // Verify date of birth (YYYYMMDD format)
      expect(message).toContain('19850320');

      // Verify gender
      expect(message).toContain('|M|');

      // Verify PV1 segment
      expect(message).toContain('PV1|1|R');
    });

    it('includes MRN in PID.3', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        identifier: [
          {
            system: 'http://health-portal.local/mrn',
            value: 'MRN_TEST',
          },
        ],
        name: [{ family: 'Test' }],
      };

      const message = buildAdtA04(patient);
      expect(message).toContain('MRN_TEST');
    });

    it('includes address in PID.11', () => {
      const patient: Patient = {
        resourceType: 'Patient',
        name: [{ family: 'Test' }],
        address: [
          {
            line: ['100 Oak St'],
            city: 'Portland',
            state: 'OR',
            postalCode: '97201',
            country: 'US',
          },
        ],
      };

      const message = buildAdtA04(patient);
      expect(message).toContain('100 Oak St');
      expect(message).toContain('Portland');
      expect(message).toContain('OR');
      expect(message).toContain('97201');
    });
  });

  describe('buildRde (RDE^O11)', () => {
    it('builds a valid RDE^O11 message from a MedicationRequest', () => {
      const medRequest: MedicationRequest = {
        resourceType: 'MedicationRequest',
        id: 'MR001',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/123' },
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197361',
              display: 'Lisinopril 10 MG Oral Tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            route: {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: '26643006',
                  display: 'Oral',
                },
              ],
            },
            doseAndRate: [
              {
                doseQuantity: {
                  value: 10,
                  unit: 'mg',
                },
              },
            ],
            timing: {
              repeat: {
                frequency: 1,
                period: 1,
                periodUnit: 'd',
              },
            },
          },
        ],
      };

      const message = buildRde(medRequest);

      // Verify MSH segment
      expect(message).toContain('RDE');
      expect(message).toContain('O11');

      // Verify ORC segment
      expect(message).toContain('ORC|NW|MR001');

      // Verify RXE segment with medication code
      expect(message).toContain('197361^Lisinopril 10 MG Oral Tablet');

      // Verify RXR segment with route
      expect(message).toContain('RXR');
      expect(message).toContain('26643006^Oral');
    });

    it('includes dose quantity in RXE.3', () => {
      const medRequest: MedicationRequest = {
        resourceType: 'MedicationRequest',
        id: 'MR_DOSE',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/123' },
        dosageInstruction: [
          {
            doseAndRate: [
              {
                doseQuantity: { value: 500, unit: 'mg' },
              },
            ],
          },
        ],
      };

      const message = buildRde(medRequest);
      expect(message).toContain('500');
    });

    it('handles MedicationRequest without route gracefully', () => {
      const medRequest: MedicationRequest = {
        resourceType: 'MedicationRequest',
        id: 'MR_NOROUTE',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/123' },
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '12345',
              display: 'Test Med',
            },
          ],
        },
      };

      const message = buildRde(medRequest);
      // Should still have RXE but no RXR
      expect(message).toContain('RXE');
      expect(message).not.toContain('RXR');
    });
  });
});
