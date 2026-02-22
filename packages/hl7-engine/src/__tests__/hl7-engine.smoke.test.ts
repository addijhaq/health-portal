import { Hl7Router, Hl7Server, Hl7Client } from '..';
import { pidToPatient } from '../transforms/common';
import type { Hl7MessageMeta } from '@health-portal/core';
import type { Bundle } from '@medplum/fhirtypes';

describe('hl7-engine smoke tests', () => {
  describe('Hl7Router', () => {
    it('instantiates without errors', () => {
      const router = new Hl7Router();
      expect(router).toBeInstanceOf(Hl7Router);
    });

    it('registers a handler with .on() without errors', () => {
      const router = new Hl7Router();
      const handler = async (_raw: string, _meta: Hl7MessageMeta): Promise<Bundle> => ({
        resourceType: 'Bundle',
        type: 'transaction',
      });

      expect(() => router.on('ADT', 'A01', handler)).not.toThrow();
    });

    it('route() calls the registered handler and returns its result', async () => {
      const router = new Hl7Router();
      const expectedBundle: Bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [],
      };
      const handler = async (_raw: string, _meta: Hl7MessageMeta): Promise<Bundle> => expectedBundle;

      router.on('ADT', 'A01', handler);

      const meta: Hl7MessageMeta = {
        messageType: 'ADT',
        triggerEvent: 'A01',
        messageControlId: 'MSG001',
        sendingFacility: 'HOSP',
        receivingFacility: 'PORTAL',
        timestamp: '20240115103000',
      };

      const result = await router.route('MSH|...', meta);
      expect(result).toBe(expectedBundle);
    });

    it('route() returns null for unregistered message types', async () => {
      const router = new Hl7Router();
      const meta: Hl7MessageMeta = {
        messageType: 'ORU',
        triggerEvent: 'R01',
        messageControlId: 'MSG002',
        sendingFacility: 'LAB',
        receivingFacility: 'PORTAL',
        timestamp: '20240115103000',
      };

      const result = await router.route('MSH|...', meta);
      expect(result).toBeNull();
    });
  });

  describe('Hl7Server', () => {
    it('instantiates with a router', () => {
      const router = new Hl7Router();
      const server = new Hl7Server(router);
      expect(server).toBeInstanceOf(Hl7Server);
    });

    it('instantiates with a router and config', () => {
      const router = new Hl7Router();
      const server = new Hl7Server(router, { port: 3000 });
      expect(server).toBeInstanceOf(Hl7Server);
    });
  });

  describe('Hl7Client', () => {
    it('instantiates with host and port config', () => {
      const client = new Hl7Client({ host: 'localhost', port: 2575 });
      expect(client).toBeInstanceOf(Hl7Client);
    });

    it('instantiates with full config including optional fields', () => {
      const client = new Hl7Client({
        host: '192.168.1.100',
        port: 2575,
        tls: true,
        retryAttempts: 5,
        retryDelayMs: 2000,
      });
      expect(client).toBeInstanceOf(Hl7Client);
    });
  });

  describe('pidToPatient', () => {
    it('converts PID segment fields to a FHIR Patient resource', () => {
      const pidFields = [
        '',             // [0] unused
        '',             // [1]
        '',             // [2]
        'MRN123',       // [3] MRN
        '',             // [4] SSN (empty)
        'Smith^John',   // [5] name (Last^First)
        '',             // [6]
        '19900115',     // [7] DOB (YYYYMMDD)
        'M',            // [8] gender
        '',             // [9]
        '',             // [10]
        '123 Main St^Apt 4^Springfield^IL^62701', // [11] address
        '',             // [12]
        '555-1234',     // [13] phone
      ];

      const patient = pidToPatient(pidFields);

      expect(patient.resourceType).toBe('Patient');

      // Name
      expect(patient.name).toBeDefined();
      expect(patient.name![0].family).toBe('Smith');
      expect(patient.name![0].given).toEqual(['John']);

      // Birth date
      expect(patient.birthDate).toBe('1990-01-15');

      // Gender
      expect(patient.gender).toBe('male');

      // Identifiers (MRN)
      expect(patient.identifier).toBeDefined();
      expect(patient.identifier!.length).toBeGreaterThanOrEqual(1);
      const mrnIdentifier = patient.identifier!.find(
        (id) => id.system === 'http://health-portal.local/mrn'
      );
      expect(mrnIdentifier).toBeDefined();
      expect(mrnIdentifier!.value).toBe('MRN123');

      // Address
      expect(patient.address).toBeDefined();
      expect(patient.address![0].city).toBe('Springfield');
      expect(patient.address![0].state).toBe('IL');
      expect(patient.address![0].postalCode).toBe('62701');

      // Telecom (phone)
      expect(patient.telecom).toBeDefined();
      expect(patient.telecom![0].system).toBe('phone');
      expect(patient.telecom![0].value).toBe('555-1234');
    });
  });
});
