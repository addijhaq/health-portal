import { BotEvent, MedplumClient } from '@medplum/core';
import type { AuditEvent, Resource } from '@medplum/fhirtypes';

/**
 * Medplum Bot: Enhanced Audit Logger
 *
 * Provides enhanced audit logging beyond Medplum's default AuditEvent generation.
 * Tracks Bot-initiated reads and enriches audit events with additional context.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const input = event.input;

  if (!input || typeof input === 'string') {
    console.log('Audit logger: no resource in event');
    return;
  }

  const resource = input as Resource;
  if (!resource.resourceType) {
    console.log('Audit logger: input has no resourceType');
    return;
  }

  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://dicom.nema.org/resources/ontology/DCM',
      code: '110110',
      display: 'Patient Record',
    },
    action: 'R',
    recorded: new Date().toISOString(),
    outcome: '0',
    agent: [
      {
        who: { display: 'bot-audit-logger' },
        requestor: false,
      },
    ],
    source: {
      observer: { display: 'health-portal-audit-system' },
    },
    entity: [
      {
        what: { reference: `${resource.resourceType}/${resource.id}` },
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
          code: '2',
          display: 'System Object',
        },
      },
    ],
  };

  await medplum.createResource(auditEvent);
}

/**
 * Query all audit events for a specific patient's data within the last N days.
 * Supports the HIPAA "accounting of disclosures" requirement.
 */
export async function queryPatientAuditTrail(
  medplum: MedplumClient,
  patientId: string,
  days = 30
): Promise<AuditEvent[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const results = await medplum.searchResources('AuditEvent', {
    entity: `Patient/${patientId}`,
    date: `ge${since}`,
    _sort: '-date',
    _count: '200',
  });

  return results;
}
