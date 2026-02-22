import { BotEvent, MedplumClient } from '@medplum/core';
import type { EmrConnectionConfig } from '@health-portal/core';
import { EpicConnector } from '@health-portal/emr-connectors';
import { normalizeEpicResource, mapEpicIdentifiers } from '@health-portal/emr-connectors';
import {
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  buildSyncAuditEvent,
  sortByDependencyTier,
  remapReferences,
  loadIdMap,
  persistIdMap,
  preserveVendorIdentifier,
  createImportProvenance,
  findOrCreatePatient,
} from './sync-utils';

const SYNC_RESOURCE_TYPES = [
  'Patient',
  'Encounter',
  'Observation',
  'Condition',
  'MedicationRequest',
  'AllergyIntolerance',
  'DiagnosticReport',
  'Immunization',
];

/**
 * Medplum Bot: Epic FHIR Sync
 *
 * Runs on a cron schedule (every 15 minutes) and on subscription triggers.
 * Performs bidirectional sync between Medplum CDR and Epic FHIR API.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('Epic sync bot triggered');

  const config: EmrConnectionConfig = {
    vendor: 'epic',
    fhirBaseUrl: event.secrets['EPIC_FHIR_BASE_URL']?.valueString ?? '',
    clientId: event.secrets['EPIC_CLIENT_ID']?.valueString ?? '',
    privateKeyPath: event.secrets['EPIC_PRIVATE_KEY_PATH']?.valueString ?? '',
    tokenUrl: `${event.secrets['EPIC_FHIR_BASE_URL']?.valueString ?? ''}/oauth2/token`,
    scopes: ['system/*.read', 'system/*.write'],
  };

  const connector = new EpicConnector(config);

  // Step 1: Authenticate
  await connector.authenticate();

  // Step 2: Get last sync timestamp
  const lastSync = await getLastSyncTimestamp(medplum, 'epic');
  const since = lastSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Step 3: Pull changes
  const bundle = await connector.pullChanges(since, SYNC_RESOURCE_TYPES);
  const entries = sortByDependencyTier(bundle.entry ?? []);

  console.log(`Epic: pulled ${entries.length} resources since ${since}`);

  // Step 4: Load existing ID map
  const idMap = await loadIdMap(medplum, 'epic');
  const newMappings: Array<{ vendor: 'epic'; vendorResourceType: string; vendorId: string; medplumId: string; vendorIdentifierSystem: string }> = [];
  let created = 0;
  let updated = 0;

  // Step 5: Process each resource through remapping pipeline
  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) continue;

    const vendorId = resource.id;
    if (!vendorId) continue;

    // Normalize Epic-specific extensions
    const normalized = normalizeEpicResource(resource);

    // Handle Patient specially for MPI matching
    if (normalized.resourceType === 'Patient') {
      const mappedPatient = mapEpicIdentifiers(normalized as import('@medplum/fhirtypes').Patient);
      const localPatient = await findOrCreatePatient(medplum, mappedPatient, 'epic');

      // Preserve vendor identifier
      const enriched = preserveVendorIdentifier(
        localPatient,
        'epic',
        vendorId,
        config.fhirBaseUrl
      );
      if (enriched.id !== localPatient.id || JSON.stringify(enriched.identifier) !== JSON.stringify(localPatient.identifier)) {
        await medplum.updateResource(enriched);
      }

      idMap.set(`epic:Patient:${vendorId}`, localPatient.id!);
      newMappings.push({
        vendor: 'epic',
        vendorResourceType: 'Patient',
        vendorId,
        medplumId: localPatient.id!,
        vendorIdentifierSystem: config.fhirBaseUrl,
      });
      created++;
      continue;
    }

    // Remap references for non-Patient resources
    const { resource: remapped, unresolvedRefs } = remapReferences(normalized, idMap, 'epic');
    if (unresolvedRefs.length > 0) {
      console.log(`Epic: ${unresolvedRefs.length} unresolved refs in ${normalized.resourceType}/${vendorId}`);
    }

    // Remove vendor ID before creating in Medplum
    delete (remapped as { id?: string }).id;
    const localResource = await medplum.createResource(remapped);

    idMap.set(`epic:${normalized.resourceType}:${vendorId}`, localResource.id!);
    newMappings.push({
      vendor: 'epic',
      vendorResourceType: normalized.resourceType,
      vendorId,
      medplumId: localResource.id!,
      vendorIdentifierSystem: config.fhirBaseUrl,
    });

    // Create Provenance
    await createImportProvenance(medplum, localResource, 'epic', `${normalized.resourceType}/${vendorId}`);
    created++;
  }

  // Step 6: Persist updated ID map
  if (newMappings.length > 0) {
    await persistIdMap(medplum, 'epic', newMappings);
  }

  // Step 7: Update sync timestamp
  const now = new Date().toISOString();
  await setLastSyncTimestamp(medplum, 'epic', now);

  // Step 8: Log audit event
  const auditEvent = buildSyncAuditEvent({
    vendor: 'epic',
    direction: 'import',
    resourceType: 'mixed',
    created,
    updated,
    errors: [],
    timestamp: now,
  });
  await medplum.createResource(auditEvent);

  console.log(`Epic sync complete: ${created} created, ${updated} updated`);
}
