import { BotEvent, MedplumClient } from '@medplum/core';
import type { EmrConnectionConfig } from '@health-portal/core';
import { AthenaConnector } from '@health-portal/emr-connectors';
import { normalizeAthenaResource, mapAthenaIdentifiers } from '@health-portal/emr-connectors';
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
 * Medplum Bot: athenahealth FHIR Sync
 *
 * Bidirectional sync with athenahealth via FHIR R4 APIs.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('Athena sync bot triggered');

  const config: EmrConnectionConfig = {
    vendor: 'athena',
    fhirBaseUrl: event.secrets['ATHENA_FHIR_BASE_URL']?.valueString ?? '',
    clientId: event.secrets['ATHENA_CLIENT_ID']?.valueString ?? '',
    clientSecret: event.secrets['ATHENA_CLIENT_SECRET']?.valueString ?? '',
    tokenUrl: event.secrets['ATHENA_TOKEN_URL']?.valueString ?? '',
    scopes: ['system/*.read', 'system/*.write'],
  };

  const connector = new AthenaConnector(config);
  await connector.authenticate();

  const lastSync = await getLastSyncTimestamp(medplum, 'athena');
  const since = lastSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const bundle = await connector.pullChanges(since, SYNC_RESOURCE_TYPES);
  const entries = sortByDependencyTier(bundle.entry ?? []);

  console.log(`Athena: pulled ${entries.length} resources since ${since}`);

  const idMap = await loadIdMap(medplum, 'athena');
  const newMappings: Array<{ vendor: 'athena'; vendorResourceType: string; vendorId: string; medplumId: string; vendorIdentifierSystem: string }> = [];
  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const resource = entry.resource;
    if (!resource) continue;

    const vendorId = resource.id;
    if (!vendorId) continue;

    const normalized = normalizeAthenaResource(resource);

    if (normalized.resourceType === 'Patient') {
      const mappedPatient = mapAthenaIdentifiers(normalized as import('@medplum/fhirtypes').Patient);
      const localPatient = await findOrCreatePatient(medplum, mappedPatient, 'athena');

      const enriched = preserveVendorIdentifier(
        localPatient,
        'athena',
        vendorId,
        config.fhirBaseUrl
      );
      if (JSON.stringify(enriched.identifier) !== JSON.stringify(localPatient.identifier)) {
        await medplum.updateResource(enriched);
      }

      idMap.set(`athena:Patient:${vendorId}`, localPatient.id!);
      newMappings.push({
        vendor: 'athena',
        vendorResourceType: 'Patient',
        vendorId,
        medplumId: localPatient.id!,
        vendorIdentifierSystem: config.fhirBaseUrl,
      });
      created++;
      continue;
    }

    const { resource: remapped, unresolvedRefs } = remapReferences(normalized, idMap, 'athena');
    if (unresolvedRefs.length > 0) {
      console.log(`Athena: ${unresolvedRefs.length} unresolved refs in ${normalized.resourceType}/${vendorId}`);
    }

    delete (remapped as { id?: string }).id;
    const localResource = await medplum.createResource(remapped);

    idMap.set(`athena:${normalized.resourceType}:${vendorId}`, localResource.id!);
    newMappings.push({
      vendor: 'athena',
      vendorResourceType: normalized.resourceType,
      vendorId,
      medplumId: localResource.id!,
      vendorIdentifierSystem: config.fhirBaseUrl,
    });

    await createImportProvenance(medplum, localResource, 'athena', `${normalized.resourceType}/${vendorId}`);
    created++;
  }

  if (newMappings.length > 0) {
    await persistIdMap(medplum, 'athena', newMappings);
  }

  const now = new Date().toISOString();
  await setLastSyncTimestamp(medplum, 'athena', now);

  const auditEvent = buildSyncAuditEvent({
    vendor: 'athena',
    direction: 'import',
    resourceType: 'mixed',
    created,
    updated,
    errors: [],
    timestamp: now,
  });
  await medplum.createResource(auditEvent);

  console.log(`Athena sync complete: ${created} created, ${updated} updated`);
}
