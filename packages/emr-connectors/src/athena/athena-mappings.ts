import type { Patient, Resource } from '@medplum/fhirtypes';
import { IDENTIFIER_SYSTEMS } from '@health-portal/core';

const athenaIdSystem = process.env.ATHENA_FHIR_ID_SYSTEM ?? IDENTIFIER_SYSTEMS.ATHENA_FHIR_ID;

/** athena-specific extension URLs to strip on import. */
const ATHENA_EXTENSION_PATTERNS = [
  'athena-subscription-extension-owner',
  'athena-coverage-extension-coverage-type',
  'athenahealth.com',
];

/**
 * Normalize an athenahealth FHIR resource by stripping athena-specific extensions.
 */
export function normalizeAthenaResource<T extends Resource>(resource: T): T {
  const clone = JSON.parse(JSON.stringify(resource)) as Record<string, unknown>;

  if (Array.isArray(clone.extension)) {
    clone.extension = (clone.extension as Array<{ url?: string }>).filter(
      (ext) => !ATHENA_EXTENSION_PATTERNS.some((pattern) => ext.url?.includes(pattern))
    );
    if ((clone.extension as unknown[]).length === 0) {
      delete clone.extension;
    }
  }

  return clone as T;
}

/**
 * Map athenahealth identifiers on a Patient resource.
 *
 * athena uses the HL7 v2 identifier type code "MR" for MRN but may present
 * identifier search in a non-standard format:
 *   identifier:otype=http://terminology.hl7.org/CodeSystem/v2-0203|MR|<value>
 *
 * This normalizes identifiers so they match the standard FHIR format.
 */
export function mapAthenaIdentifiers(patient: Patient): Patient {
  const clone = JSON.parse(JSON.stringify(patient)) as Patient;

  if (!clone.identifier) return clone;

  for (const identifier of clone.identifier) {
    // Tag identifiers from the athena FHIR ID system as secondary
    if (identifier.system === athenaIdSystem) {
      identifier.use = 'secondary';
    }

    // Ensure MR-type identifiers have proper coding structure
    const isMR = identifier.type?.coding?.some(
      (coding) => coding.code === 'MR'
    );
    if (isMR && !identifier.type?.text) {
      identifier.type = {
        ...identifier.type,
        text: 'MRN',
      };
    }
  }

  return clone;
}

/**
 * Discover the identifier system OID from a sample athena Patient response.
 *
 * athena's identifier system URI may vary by practice.
 */
export function discoverIdentifierSystem(samplePatient: Patient): string {
  if (!samplePatient.identifier) return athenaIdSystem;

  // Look for MR-type identifier and return its system
  const mrIdentifier = samplePatient.identifier.find((id) =>
    id.type?.coding?.some((coding) => coding.code === 'MR')
  );
  if (mrIdentifier?.system) return mrIdentifier.system;

  // Fallback: look for any urn:oid system
  const oidIdentifier = samplePatient.identifier.find(
    (id) => id.system?.startsWith('urn:oid:')
  );
  if (oidIdentifier?.system) return oidIdentifier.system;

  return athenaIdSystem;
}
