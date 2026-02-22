import type { MedplumClient } from '@medplum/core';
import type {
  AuditEvent,
  BundleEntry,
  Parameters,
  Patient,
  Provenance,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import type { EmrVendor, IdMappingEntry, SyncResult } from '@health-portal/core';
import { IDENTIFIER_SYSTEMS } from '@health-portal/core';

// ---------------------------------------------------------------------------
// Sync State
// ---------------------------------------------------------------------------

/**
 * Read the last sync timestamp for a vendor from a Medplum Parameters resource.
 */
export async function getLastSyncTimestamp(
  medplum: MedplumClient,
  vendor: EmrVendor
): Promise<string | null> {
  try {
    const params = await medplum.readResource('Parameters', `sync-state-${vendor}`);
    const ts = params.parameter?.find((p) => p.name === 'lastSync');
    return ts?.valueString ?? null;
  } catch {
    return null;
  }
}

/**
 * Update the last sync timestamp for a vendor.
 */
export async function setLastSyncTimestamp(
  medplum: MedplumClient,
  vendor: EmrVendor,
  timestamp: string
): Promise<void> {
  const params: Parameters = {
    resourceType: 'Parameters',
    id: `sync-state-${vendor}`,
    parameter: [{ name: 'lastSync', valueString: timestamp }],
  };

  try {
    await medplum.updateResource(params);
  } catch {
    await medplum.createResource(params);
  }
}

/**
 * Build an AuditEvent recording the result of a sync operation.
 */
export function buildSyncAuditEvent(result: SyncResult): AuditEvent {
  return {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://dicom.nema.org/resources/ontology/DCM',
      code: '110106',
      display: 'Export',
    },
    action: result.direction === 'import' ? 'R' : 'C',
    recorded: result.timestamp,
    outcome: result.errors.length > 0 ? '4' : '0',
    outcomeDesc: `${result.vendor} ${result.direction}: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
    agent: [
      {
        who: { display: `emr-sync-${result.vendor}` },
        requestor: false,
      },
    ],
    source: {
      observer: { display: 'health-portal-sync-engine' },
    },
  };
}

// ---------------------------------------------------------------------------
// ID Mapping (Phase 3e)
// ---------------------------------------------------------------------------

/**
 * Build an in-memory ID map from a batch of imported resources.
 * Key format: `${vendor}:${resourceType}:${vendorId}`
 */
export function buildIdMap(
  vendor: EmrVendor,
  importedResources: Array<{ vendorId: string; medplumId: string; resourceType: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of importedResources) {
    const key = `${vendor}:${entry.resourceType}:${entry.vendorId}`;
    map.set(key, entry.medplumId);
  }
  return map;
}

/**
 * Persist ID mapping entries to a Medplum Parameters resource.
 */
export async function persistIdMap(
  medplum: MedplumClient,
  vendor: EmrVendor,
  entries: IdMappingEntry[]
): Promise<void> {
  const parameterId = `id-map-${vendor}`;
  let existing: Parameters;

  try {
    existing = await medplum.readResource('Parameters', parameterId);
  } catch {
    existing = {
      resourceType: 'Parameters',
      id: parameterId,
      parameter: [],
    };
  }

  const existingParams = existing.parameter ?? [];

  for (const entry of entries) {
    // Avoid duplicates
    const alreadyExists = existingParams.some(
      (p) =>
        p.name === 'mapping' &&
        p.part?.some((pp) => pp.name === 'vendorId' && pp.valueString === entry.vendorId) &&
        p.part?.some(
          (pp) => pp.name === 'vendorResourceType' && pp.valueString === entry.vendorResourceType
        )
    );
    if (alreadyExists) continue;

    existingParams.push({
      name: 'mapping',
      part: [
        { name: 'vendorResourceType', valueString: entry.vendorResourceType },
        { name: 'vendorId', valueString: entry.vendorId },
        { name: 'medplumId', valueString: entry.medplumId },
        { name: 'vendorIdentifierSystem', valueString: entry.vendorIdentifierSystem },
        ...(entry.vendorIdentifierValue
          ? [{ name: 'vendorIdentifierValue', valueString: entry.vendorIdentifierValue }]
          : []),
      ],
    });
  }

  existing.parameter = existingParams;

  try {
    await medplum.updateResource(existing);
  } catch {
    await medplum.createResource(existing);
  }
}

/**
 * Load the ID mapping table from Medplum into an in-memory Map.
 * Key: `${vendor}:${resourceType}:${vendorId}` -> medplumId
 */
export async function loadIdMap(
  medplum: MedplumClient,
  vendor: EmrVendor
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  try {
    const params = await medplum.readResource('Parameters', `id-map-${vendor}`);
    for (const param of params.parameter ?? []) {
      if (param.name !== 'mapping') continue;
      const parts = param.part ?? [];
      const resourceType = parts.find((p) => p.name === 'vendorResourceType')?.valueString;
      const vendorId = parts.find((p) => p.name === 'vendorId')?.valueString;
      const medplumId = parts.find((p) => p.name === 'medplumId')?.valueString;
      if (resourceType && vendorId && medplumId) {
        map.set(`${vendor}:${resourceType}:${vendorId}`, medplumId);
      }
    }
  } catch {
    // No existing mapping table — return empty map
  }

  return map;
}

/**
 * Reference fields that need remapping per resource type.
 */
const REFERENCE_FIELDS: Record<string, string[]> = {
  Observation: ['subject', 'encounter', 'performer'],
  Condition: ['subject', 'encounter', 'recorder', 'asserter'],
  Encounter: ['subject', 'participant', 'serviceProvider'],
  MedicationRequest: ['subject', 'encounter', 'requester', 'performer'],
  AllergyIntolerance: ['patient', 'recorder', 'asserter', 'encounter'],
  DiagnosticReport: ['subject', 'encounter', 'performer', 'result'],
  Immunization: ['patient', 'encounter', 'performer'],
  DocumentReference: ['subject', 'author', 'context'],
  Coverage: ['beneficiary', 'payor'],
};

/**
 * Rewrite all reference fields in a resource from vendor IDs to Medplum IDs.
 *
 * Skips contained resource fragment references (starting with #).
 * Logs warnings for unresolved references.
 */
export function remapReferences(
  resource: Resource,
  idMap: Map<string, string>,
  vendor: EmrVendor
): { resource: Resource; unresolvedRefs: string[] } {
  const clone = JSON.parse(JSON.stringify(resource)) as Record<string, unknown>;
  const unresolvedRefs: string[] = [];

  rewriteReferencesDeep(clone, idMap, vendor, unresolvedRefs);

  return { resource: clone as unknown as Resource, unresolvedRefs };
}

/**
 * Rewrite all reference fields in a resource from Medplum IDs back to vendor IDs.
 * Used for the export flow (Medplum -> vendor).
 */
export function reverseRemapReferences(
  resource: Resource,
  idMap: Map<string, string>,
  vendor: EmrVendor
): { resource: Resource; unresolvedRefs: string[] } {
  // Build reverse map: medplumId -> `${vendor}:${resourceType}:${vendorId}`
  const reverseMap = new Map<string, string>();
  for (const [key, medplumId] of idMap) {
    // key = `${vendor}:${resourceType}:${vendorId}`
    const parts = key.split(':');
    if (parts.length >= 3 && parts[0] === vendor) {
      const resourceType = parts[1];
      const vendorId = parts.slice(2).join(':');
      reverseMap.set(`${resourceType}/${medplumId}`, `${resourceType}/${vendorId}`);
    }
  }

  const clone = JSON.parse(JSON.stringify(resource)) as Record<string, unknown>;
  const unresolvedRefs: string[] = [];

  reverseRewriteDeep(clone, reverseMap, unresolvedRefs);

  return { resource: clone as unknown as Resource, unresolvedRefs };
}

function rewriteReferencesDeep(
  obj: Record<string, unknown>,
  idMap: Map<string, string>,
  vendor: EmrVendor,
  unresolvedRefs: string[]
): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === null || value === undefined) continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      // Check if this is a FHIR reference object
      if (typeof record.reference === 'string') {
        const ref = record.reference as string;
        if (ref.startsWith('#')) continue; // contained resource fragment

        const match = ref.match(/^([A-Za-z]+)\/(.+)$/);
        if (match) {
          const [, refType, vendorId] = match;
          const mapKey = `${vendor}:${refType}:${vendorId}`;
          const medplumId = idMap.get(mapKey);
          if (medplumId) {
            record.reference = `${refType}/${medplumId}`;
          } else {
            unresolvedRefs.push(ref);
          }
        }
      }
      rewriteReferencesDeep(record, idMap, vendor, unresolvedRefs);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          rewriteReferencesDeep(item as Record<string, unknown>, idMap, vendor, unresolvedRefs);
        }
      }
    }
  }
}

function reverseRewriteDeep(
  obj: Record<string, unknown>,
  reverseMap: Map<string, string>,
  unresolvedRefs: string[]
): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === null || value === undefined) continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (typeof record.reference === 'string') {
        const ref = record.reference as string;
        if (ref.startsWith('#')) continue;

        const vendorRef = reverseMap.get(ref);
        if (vendorRef) {
          record.reference = vendorRef;
        } else {
          unresolvedRefs.push(ref);
        }
      }
      reverseRewriteDeep(record, reverseMap, unresolvedRefs);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          reverseRewriteDeep(item as Record<string, unknown>, reverseMap, unresolvedRefs);
        }
      }
    }
  }
}

/**
 * Add vendor identifier to a Patient's identifier array.
 * This preserves the vendor's ID so the patient can be looked up by vendor identifier.
 */
export function preserveVendorIdentifier(
  patient: Patient,
  vendor: EmrVendor,
  vendorId: string,
  vendorSystem: string
): Patient {
  const clone = JSON.parse(JSON.stringify(patient)) as Patient;
  clone.identifier = clone.identifier ?? [];

  // Don't add duplicate
  const alreadyPresent = clone.identifier.some(
    (id) => id.system === vendorSystem && id.value === vendorId
  );
  if (alreadyPresent) return clone;

  clone.identifier.push({
    system: vendorSystem,
    value: vendorId,
    use: 'secondary',
    type: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: 'MR',
        },
      ],
    },
  });

  return clone;
}

/**
 * Create a Provenance resource linking an imported resource to its vendor origin.
 */
export async function createImportProvenance(
  medplum: MedplumClient,
  importedResource: Resource,
  vendor: EmrVendor,
  originalVendorRef: string
): Promise<Provenance> {
  const provenance: Provenance = {
    resourceType: 'Provenance',
    target: [
      { reference: `${importedResource.resourceType}/${importedResource.id}` },
    ],
    recorded: new Date().toISOString(),
    agent: [
      {
        who: { display: `emr-sync-${vendor}` },
      },
    ],
    entity: [
      {
        role: 'source',
        what: { display: originalVendorRef },
      },
    ],
  };

  return medplum.createResource(provenance);
}

// ---------------------------------------------------------------------------
// Patient Matching (MPI - Phase 3c)
// ---------------------------------------------------------------------------

/**
 * Deterministic match: exact match on lastName + DOB + gender,
 * confirmed with an additional identifier (MRN or SSN last 4).
 */
export function deterministicMatch(
  patient: Patient,
  candidates: Patient[]
): Patient | null {
  const lastName = patient.name?.[0]?.family?.toLowerCase();
  const dob = patient.birthDate;
  const gender = patient.gender;

  if (!lastName || !dob || !gender) return null;

  const matches = candidates.filter((c) => {
    const cLastName = c.name?.[0]?.family?.toLowerCase();
    const cDob = c.birthDate;
    const cGender = c.gender;
    return cLastName === lastName && cDob === dob && cGender === gender;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches — try to narrow by MRN
  const patientMrn = patient.identifier?.find((id) =>
    id.type?.coding?.some((c) => c.code === 'MR')
  )?.value;

  if (patientMrn) {
    const mrnMatch = matches.find((m) =>
      m.identifier?.some(
        (id) =>
          id.type?.coding?.some((c) => c.code === 'MR') &&
          id.value === patientMrn
      )
    );
    if (mrnMatch) return mrnMatch;
  }

  return matches[0];
}

/**
 * Probabilistic match using weighted scoring.
 * Returns all candidates above the threshold (default 0.85), sorted by score descending.
 */
export function probabilisticMatch(
  patient: Patient,
  candidates: Patient[],
  threshold = 0.85
): Array<{ patient: Patient; score: number }> {
  const results: Array<{ patient: Patient; score: number }> = [];

  for (const candidate of candidates) {
    let score = 0;
    let weight = 0;

    // Last name exact match (weight: 0.25)
    const lastName = patient.name?.[0]?.family?.toLowerCase();
    const cLastName = candidate.name?.[0]?.family?.toLowerCase();
    if (lastName && cLastName) {
      score += (lastName === cLastName ? 1 : 0) * 0.25;
      weight += 0.25;
    }

    // First name Levenshtein similarity (weight: 0.2)
    const firstName = patient.name?.[0]?.given?.[0]?.toLowerCase();
    const cFirstName = candidate.name?.[0]?.given?.[0]?.toLowerCase();
    if (firstName && cFirstName) {
      const similarity = 1 - levenshteinDistance(firstName, cFirstName) / Math.max(firstName.length, cFirstName.length);
      score += similarity * 0.2;
      weight += 0.2;
    }

    // DOB exact match (weight: 0.25)
    if (patient.birthDate && candidate.birthDate) {
      score += (patient.birthDate === candidate.birthDate ? 1 : 0) * 0.25;
      weight += 0.25;
    }

    // Gender match (weight: 0.1)
    if (patient.gender && candidate.gender) {
      score += (patient.gender === candidate.gender ? 1 : 0) * 0.1;
      weight += 0.1;
    }

    // Phone match (weight: 0.1)
    const phone = patient.telecom?.find((t) => t.system === 'phone')?.value;
    const cPhone = candidate.telecom?.find((t) => t.system === 'phone')?.value;
    if (phone && cPhone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const normalizedCPhone = cPhone.replace(/\D/g, '');
      score += (normalizedPhone === normalizedCPhone ? 1 : 0) * 0.1;
      weight += 0.1;
    }

    // Address similarity (weight: 0.1)
    const addr = patient.address?.[0];
    const cAddr = candidate.address?.[0];
    if (addr && cAddr) {
      const addrStr = [addr.line?.join(' '), addr.city, addr.state, addr.postalCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const cAddrStr = [cAddr.line?.join(' '), cAddr.city, cAddr.state, cAddr.postalCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (addrStr && cAddrStr) {
        const addrSim = 1 - levenshteinDistance(addrStr, cAddrStr) / Math.max(addrStr.length, cAddrStr.length);
        score += addrSim * 0.1;
        weight += 0.1;
      }
    }

    // Normalize score by available weight
    const normalizedScore = weight > 0 ? score / weight : 0;

    if (normalizedScore >= threshold) {
      results.push({ patient: candidate, score: normalizedScore });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Search Medplum for a matching patient, link if found, or create new.
 * Ambiguous matches (score 0.70-0.85) are flagged as Task resources for manual review.
 */
export async function findOrCreatePatient(
  medplum: MedplumClient,
  vendorPatient: Patient,
  vendor: EmrVendor
): Promise<Patient> {
  const lastName = vendorPatient.name?.[0]?.family;
  const dob = vendorPatient.birthDate;

  // Search for candidates by last name + DOB
  let candidates: Patient[] = [];
  if (lastName && dob) {
    const bundle = await medplum.searchResources('Patient', {
      family: lastName,
      birthdate: dob,
    });
    candidates = bundle;
  }

  // Try deterministic match first
  const deterministicResult = deterministicMatch(vendorPatient, candidates);
  if (deterministicResult) {
    return linkPatient(medplum, deterministicResult, vendor);
  }

  // Try probabilistic match
  const probResults = probabilisticMatch(vendorPatient, candidates);
  if (probResults.length > 0 && probResults[0].score >= 0.85) {
    return linkPatient(medplum, probResults[0].patient, vendor);
  }

  // Log ambiguous matches (0.70-0.85) for manual review
  const ambiguous = probabilisticMatch(vendorPatient, candidates, 0.70).filter(
    (r) => r.score < 0.85
  );
  if (ambiguous.length > 0) {
    const task: Task = {
      resourceType: 'Task',
      status: 'requested',
      intent: 'proposal',
      description: `Ambiguous patient match from ${vendor}: ${vendorPatient.name?.[0]?.family}, ${vendorPatient.name?.[0]?.given?.[0]} (DOB: ${vendorPatient.birthDate}). Top candidate score: ${ambiguous[0].score.toFixed(2)}. Requires manual review.`,
      for: ambiguous[0].patient.id
        ? { reference: `Patient/${ambiguous[0].patient.id}` }
        : undefined,
    };
    await medplum.createResource(task);
  }

  // No match found — create new patient
  return medplum.createResource(vendorPatient);
}

async function linkPatient(
  medplum: MedplumClient,
  existingPatient: Patient,
  vendor: EmrVendor
): Promise<Patient> {
  // Add a seealso link if not already present
  const links = existingPatient.link ?? [];
  const alreadyLinked = links.some(
    (l) => l.type === 'seealso' && l.other?.display === `${vendor}-linked`
  );

  if (!alreadyLinked) {
    existingPatient.link = [
      ...links,
      {
        type: 'seealso',
        other: { display: `${vendor}-linked` },
      },
    ];
    return medplum.updateResource(existingPatient);
  }

  return existingPatient;
}

// ---------------------------------------------------------------------------
// Import/Export Flow Helpers
// ---------------------------------------------------------------------------

const DEPENDENCY_TIERS: Record<string, number> = {
  Organization: 1,
  Practitioner: 1,
  PractitionerRole: 1,
  Patient: 2,
  Encounter: 3,
  Condition: 4,
  AllergyIntolerance: 4,
  Immunization: 4,
  Observation: 5,
  DiagnosticReport: 5,
  MedicationRequest: 6,
  DocumentReference: 6,
  Coverage: 6,
};

/**
 * Sort resources by dependency tier for import ordering.
 * Lower tiers are imported first to ensure references can be resolved.
 */
export function sortByDependencyTier(entries: BundleEntry[]): BundleEntry[] {
  return [...entries].sort((a, b) => {
    const tierA = DEPENDENCY_TIERS[a.resource?.resourceType ?? ''] ?? 99;
    const tierB = DEPENDENCY_TIERS[b.resource?.resourceType ?? ''] ?? 99;
    return tierA - tierB;
  });
}

// ---------------------------------------------------------------------------
// Levenshtein Distance (for probabilistic matching)
// ---------------------------------------------------------------------------

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
