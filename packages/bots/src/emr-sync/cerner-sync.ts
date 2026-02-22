import { BotEvent, MedplumClient } from '@medplum/core';
import type { EmrConnectionConfig } from '@health-portal/core';
import { CernerConnector } from '@health-portal/emr-connectors';
import { normalizeCernerResource, mapCernerIdentifiers } from '@health-portal/emr-connectors';
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
 * Medplum Bot: Cerner / Oracle Health FHIR Sync
 *
 * Bidirectional sync with Cerner via FHIR R4 Ignite APIs.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('Cerner sync bot triggered');

  const config: EmrConnectionConfig = {
    vendor: 'cerner',
    fhirBaseUrl: event.secrets['CERNER_FHIR_BASE_URL']?.valueString ?? '',
    clientId: event.secrets['CERNER_CLIENT_ID']?.valueString ?? '',
    clientSecret: event.secrets['CERNER_CLIENT_SECRET']?.valueString ?? '',
    tokenUrl: event.secrets['CERNER_TOKEN_URL']?.valueString ?? '',
    scopes: ['system/*.read', 'system/*.write'],
  };

  const connector = new CernerConnector(config);
  await connector.authenticate();

  const lastSync = await getLastSyncTimestamp(medplum, 'cerner');
  const since = lastSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const bundle = await connector.pullChanges(since, SYNC_RESOURCE_TYPES);
  const entries = sortByDependencyTier(bundle.entry ?? []);

  console.log(`Cerner: pulled ${entries.length} resources since ${since}`);

  const idMap = await loadIdMap(medplum, 'cerner');
  const newMappings: Array<{ vendor: 'cerner'; vendorResourceType: string; vendorId: string; medplumId: string; vendorIdentifierSystem: string }> = [];
  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) continue;

    const vendorId = resource.id;
    if (!vendorId) continue;

    const normalized = normalizeCernerResource(resource);

    if (normalized.resourceType === 'Patient') {
      const mappedPatient = mapCernerIdentifiers(normalized as import('@medplum/fhirtypes').Patient);
      const localPatient = await findOrCreatePatient(medplum, mappedPatient, 'cerner');

      const enriched = preserveVendorIdentifier(
        localPatient,
        'cerner',
        vendorId,
        config.fhirBaseUrl
      );
      if (JSON.stringify(enriched.identifier) !== JSON.stringify(localPatient.identifier)) {
        await medplum.updateResource(enriched);
      }

      idMap.set(`cerner:Patient:${vendorId}`, localPatient.id!);
      newMappings.push({
        vendor: 'cerner',
        vendorResourceType: 'Patient',
        vendorId,
        medplumId: localPatient.id!,
        vendorIdentifierSystem: config.fhirBaseUrl,
      });
      created++;
      continue;
    }

    const { resource: remapped, unresolvedRefs } = remapReferences(normalized, idMap, 'cerner');
    if (unresolvedRefs.length > 0) {
      console.log(`Cerner: ${unresolvedRefs.length} unresolved refs in ${normalized.resourceType}/${vendorId}`);
    }

    delete (remapped as { id?: string }).id;
    const localResource = await medplum.createResource(remapped);

    idMap.set(`cerner:${normalized.resourceType}:${vendorId}`, localResource.id!);
    newMappings.push({
      vendor: 'cerner',
      vendorResourceType: normalized.resourceType,
      vendorId,
      medplumId: localResource.id!,
      vendorIdentifierSystem: config.fhirBaseUrl,
    });

    await createImportProvenance(medplum, localResource, 'cerner', `${normalized.resourceType}/${vendorId}`);
    created++;
  }

  if (newMappings.length > 0) {
    await persistIdMap(medplum, 'cerner', newMappings);
  }

  const now = new Date().toISOString();
  await setLastSyncTimestamp(medplum, 'cerner', now);

  const auditEvent = buildSyncAuditEvent({
    vendor: 'cerner',
    direction: 'import',
    resourceType: 'mixed',
    created,
    updated,
    errors: [],
    timestamp: now,
  });
  await medplum.createResource(auditEvent);

  console.log(`Cerner sync complete: ${created} created, ${updated} updated`);
}
