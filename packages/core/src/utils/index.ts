import type { Patient } from '@medplum/fhirtypes';
import type { PatientMatchCriteria } from '../types';

/**
 * Extract patient match criteria from a FHIR Patient resource.
 */
export function extractMatchCriteria(patient: Patient): PatientMatchCriteria {
  return {
    firstName: patient.name?.[0]?.given?.[0],
    lastName: patient.name?.[0]?.family,
    dateOfBirth: patient.birthDate,
    gender: patient.gender,
  };
}

/**
 * Generate a deterministic hash for deduplication of synced resources.
 */
export function resourceHash(resourceType: string, identifierSystem: string, identifierValue: string): string {
  return `${resourceType}|${identifierSystem}|${identifierValue}`;
}

/**
 * Format a date string to HL7 v2 timestamp format (YYYYMMDDHHmmss).
 */
export function toHl7Timestamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Parse an HL7 v2 timestamp (YYYYMMDDHHmmss) to a Date object.
 */
export function fromHl7Timestamp(hl7Timestamp: string): Date {
  const year = hl7Timestamp.slice(0, 4);
  const month = hl7Timestamp.slice(4, 6);
  const day = hl7Timestamp.slice(6, 8);
  const hour = hl7Timestamp.slice(8, 10) || '00';
  const min = hl7Timestamp.slice(10, 12) || '00';
  const sec = hl7Timestamp.slice(12, 14) || '00';
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
}
