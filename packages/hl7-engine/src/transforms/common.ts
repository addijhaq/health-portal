import type { Patient, HumanName, Address, ContactPoint, Identifier } from '@medplum/fhirtypes';
import { IDENTIFIER_SYSTEMS } from '@health-portal/core';

/**
 * Common HL7 v2 → FHIR R4 field transformations.
 * These map standard HL7 v2 segments/fields to FHIR resource properties.
 */

/**
 * Map HL7 PID segment fields to a FHIR Patient resource.
 */
export function pidToPatient(pidFields: string[]): Partial<Patient> {
  return {
    resourceType: 'Patient',
    identifier: buildIdentifiers(pidFields[3], pidFields[4]),
    name: [parseName(pidFields[5])],
    birthDate: parseHl7Date(pidFields[7]),
    gender: mapGender(pidFields[8]),
    address: pidFields[11] ? [parseAddress(pidFields[11])] : undefined,
    telecom: pidFields[13] ? [parsePhone(pidFields[13])] : undefined,
  };
}

function buildIdentifiers(mrnField?: string, ssnField?: string): Identifier[] {
  const identifiers: Identifier[] = [];
  if (mrnField) {
    identifiers.push({
      system: IDENTIFIER_SYSTEMS.MRN,
      value: mrnField.split('^')[0],
    });
  }
  if (ssnField) {
    identifiers.push({
      system: IDENTIFIER_SYSTEMS.SSN,
      value: ssnField,
    });
  }
  return identifiers;
}

function parseName(nameField: string): HumanName {
  const parts = nameField.split('^');
  return {
    family: parts[0],
    given: parts[1] ? [parts[1]] : undefined,
  };
}

function parseAddress(addressField: string): Address {
  const parts = addressField.split('^');
  return {
    line: parts[0] ? [parts[0]] : undefined,
    city: parts[2],
    state: parts[3],
    postalCode: parts[4],
    country: parts[5],
  };
}

function parsePhone(phoneField: string): ContactPoint {
  return {
    system: 'phone',
    value: phoneField.split('^')[0],
  };
}

function mapGender(hl7Gender?: string): Patient['gender'] {
  switch (hl7Gender?.toUpperCase()) {
    case 'M': return 'male';
    case 'F': return 'female';
    case 'O': return 'other';
    default: return 'unknown';
  }
}

function parseHl7Date(dateField?: string): string | undefined {
  if (!dateField || dateField.length < 8) return undefined;
  return `${dateField.slice(0, 4)}-${dateField.slice(4, 6)}-${dateField.slice(6, 8)}`;
}
