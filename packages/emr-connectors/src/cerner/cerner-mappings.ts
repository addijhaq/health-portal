import type { Patient, Resource } from '@medplum/fhirtypes';
import { IDENTIFIER_SYSTEMS } from '@health-portal/core';

const cernerIdSystem = process.env.CERNER_FHIR_ID_SYSTEM ?? IDENTIFIER_SYSTEMS.CERNER_FHIR_ID;

/**
 * Normalize a Cerner FHIR resource.
 *
 * Cerner may return contained resources (embedded with #fragment references).
 * These are left intact since they are self-contained and do not require
 * external reference remapping.
 */
export function normalizeCernerResource<T extends Resource>(resource: T): T {
  const clone = JSON.parse(JSON.stringify(resource)) as Record<string, unknown>;

  // Strip Cerner proprietary extensions
  if (Array.isArray(clone.extension)) {
    clone.extension = (clone.extension as Array<{ url?: string }>).filter(
      (ext) => !ext.url?.includes('cerner.com') && !ext.url?.includes('oracle.com')
    );
    if ((clone.extension as unknown[]).length === 0) {
      delete clone.extension;
    }
  }

  return clone as T;
}

/**
 * Map Cerner identifiers on a Patient resource.
 *
 * Cerner supports CMRN (Community MRN) for multi-facility organizations.
 * If a CMRN identifier is present, it is preferred as the cross-facility
 * matching key because it is stable across Cerner facility boundaries.
 *
 * Cerner returns numeric IDs (e.g., Patient/12724066).
 */
export function mapCernerIdentifiers(patient: Patient): Patient {
  const clone = JSON.parse(JSON.stringify(patient)) as Patient;

  if (!clone.identifier) return clone;

  for (const identifier of clone.identifier) {
    // Tag identifiers from the Cerner FHIR ID system as secondary
    if (identifier.system === cernerIdSystem) {
      identifier.use = 'secondary';
    }

    // Detect and tag CMRN identifiers for cross-facility matching
    const isCmrn = identifier.type?.coding?.some(
      (coding) => coding.code === 'CMRN'
    );
    if (isCmrn) {
      identifier.use = 'usual';
    }
  }

  return clone;
}

/**
 * Discover the identifier system OID from a sample Cerner Patient response.
 *
 * Cerner's generic OID (2.16.840.1.113883.6.1000) is a Millennium platform-level
 * system; each site may register its own OID. We discover it from the first Patient
 * response's identifier[].system values.
 */
export function discoverIdentifierSystem(samplePatient: Patient): string {
  if (!samplePatient.identifier) return cernerIdSystem;

  // Prefer CMRN identifier system if available
  const cmrnIdentifier = samplePatient.identifier.find((id) =>
    id.type?.coding?.some((coding) => coding.code === 'CMRN')
  );
  if (cmrnIdentifier?.system) return cmrnIdentifier.system;

  // Fallback: look for any urn:oid system
  const oidIdentifier = samplePatient.identifier.find(
    (id) => id.system?.startsWith('urn:oid:')
  );
  if (oidIdentifier?.system) return oidIdentifier.system;

  return cernerIdSystem;
}
