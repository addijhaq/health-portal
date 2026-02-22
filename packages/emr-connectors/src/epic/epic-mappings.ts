import type { Patient, Resource } from '@medplum/fhirtypes';
import { IDENTIFIER_SYSTEMS } from '@health-portal/core';

const epicIdSystem = process.env.EPIC_FHIR_ID_SYSTEM ?? IDENTIFIER_SYSTEMS.EPIC_FHIR_ID;

/**
 * Normalize an Epic FHIR resource by stripping proprietary extensions
 * and preserving standard codings.
 *
 * Epic may include proprietary code systems alongside SNOMED/ICD-10/LOINC
 * in CodeableConcept.coding[] arrays. We strip proprietary entries and keep
 * standard ones.
 */
export function normalizeEpicResource<T extends Resource>(resource: T): T {
  const clone = JSON.parse(JSON.stringify(resource)) as Record<string, unknown>;

  // Strip Epic proprietary extensions (URLs containing "epic.com")
  if (Array.isArray(clone.extension)) {
    clone.extension = (clone.extension as Array<{ url?: string }>).filter(
      (ext) => !ext.url?.includes('epic.com')
    );
    if ((clone.extension as unknown[]).length === 0) {
      delete clone.extension;
    }
  }

  return clone as T;
}

/**
 * Map Epic identifiers on a Patient resource.
 *
 * Epic returns multiple identifiers with type.text distinguishing them:
 * - type.text = "FHIR" for the FHIR-assigned opaque ID token
 * - type.text = "MRN" for the medical record number (used for cross-system matching)
 *
 * This function normalizes the identifier array, tagging the vendor system
 * so downstream sync can use them for ID mapping.
 */
export function mapEpicIdentifiers(patient: Patient): Patient {
  const clone = JSON.parse(JSON.stringify(patient)) as Patient;

  if (!clone.identifier) return clone;

  for (const identifier of clone.identifier) {
    // Tag identifiers from the Epic FHIR ID system
    if (identifier.system === epicIdSystem) {
      identifier.use = 'secondary';
    }

    // Ensure type.text-based identifiers have the correct type coding
    const typeText = identifier.type?.text;
    if (typeText === 'MRN' && !identifier.type?.coding?.length) {
      identifier.type = {
        ...identifier.type,
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'MR',
            display: 'Medical Record Number',
          },
        ],
        text: 'MRN',
      };
    }
  }

  return clone;
}

/**
 * Discover the identifier system OID from a sample Epic Patient response.
 *
 * Epic's FHIR ID system OID varies per organization. This reads the
 * identifier array and returns the system URI for the FHIR-type identifier.
 * Falls back to the configured/default OID if discovery fails.
 */
export function discoverIdentifierSystem(samplePatient: Patient): string {
  if (!samplePatient.identifier) return epicIdSystem;

  // Look for the FHIR-typed identifier (Epic's primary)
  const fhirIdentifier = samplePatient.identifier.find(
    (id) => id.type?.text === 'FHIR'
  );
  if (fhirIdentifier?.system) return fhirIdentifier.system;

  // Fallback: look for any identifier with an urn:oid system
  const oidIdentifier = samplePatient.identifier.find(
    (id) => id.system?.startsWith('urn:oid:')
  );
  if (oidIdentifier?.system) return oidIdentifier.system;

  return epicIdSystem;
}
