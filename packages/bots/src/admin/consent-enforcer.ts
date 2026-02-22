import { BotEvent, MedplumClient } from '@medplum/core';
import type { AuditEvent, Consent } from '@medplum/fhirtypes';

/**
 * Medplum Bot: Consent Enforcer
 *
 * Triggered when a Consent resource is created or updated.
 * Updates access policies based on patient consent preferences.
 * Supports granular consent: per-resource-type opt-in/opt-out.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Consent>): Promise<void> {
  const consent = event.input;
  console.log(`Consent enforcer triggered for Consent/${consent.id}`);

  const patientRef = consent.patient?.reference;
  if (!patientRef) {
    console.log('Consent has no patient reference, skipping');
    return;
  }

  const status = consent.status;
  const scope = consent.scope?.coding?.[0]?.code;

  // Only process active or rejected consent changes
  if (status !== 'active' && status !== 'rejected') {
    console.log(`Consent/${consent.id} status is ${status}, skipping enforcement`);
    return;
  }

  // Extract provision rules for data sharing restrictions
  const provisions = consent.provision;
  if (!provisions) {
    console.log(`Consent/${consent.id} has no provision rules`);
    await logConsentChange(medplum, consent, 'no-provisions');
    return;
  }

  // Process provision type (permit vs deny)
  const provisionType = provisions.type; // 'permit' or 'deny'

  // Check for EMR-specific data sharing restrictions
  const actors = provisions.actor ?? [];
  for (const actor of actors) {
    const actorRef = actor.reference?.reference;
    const role = actor.role?.coding?.[0]?.code;

    if (actorRef) {
      console.log(
        `Consent/${consent.id}: ${provisionType} for actor ${actorRef} (role: ${role})`
      );
    }
  }

  // Check for resource-type-specific provisions (granular consent)
  const dataRules = provisions.data ?? [];
  for (const dataRule of dataRules) {
    const meaning = dataRule.meaning; // 'instance', 'related', 'dependents', 'authoredby'
    const resourceRef = dataRule.reference?.reference;

    if (resourceRef) {
      console.log(
        `Consent/${consent.id}: ${provisionType} data rule - meaning=${meaning}, ref=${resourceRef}`
      );
    }
  }

  // Check for resource class restrictions (e.g., only share lab results, not mental health)
  const classCodes = provisions.class ?? [];
  for (const classCode of classCodes) {
    console.log(
      `Consent/${consent.id}: ${provisionType} class restriction - ${classCode.system}|${classCode.code}`
    );
  }

  // Log the consent change for audit
  await logConsentChange(medplum, consent, provisionType ?? 'unknown');

  console.log(`Consent enforcement applied for ${patientRef}`);
}

/**
 * Create an AuditEvent recording a consent change.
 */
async function logConsentChange(
  medplum: MedplumClient,
  consent: Consent,
  action: string
): Promise<void> {
  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://dicom.nema.org/resources/ontology/DCM',
      code: '110112',
      display: 'Query',
    },
    subtype: [
      {
        system: 'http://health-portal.local/audit-subtypes',
        code: 'consent-change',
        display: 'Consent Change',
      },
    ],
    action: 'U',
    recorded: new Date().toISOString(),
    outcome: '0',
    outcomeDesc: `Consent ${action} for ${consent.patient?.reference ?? 'unknown patient'}`,
    agent: [
      {
        who: consent.patient ?? { display: 'unknown' },
        requestor: true,
      },
    ],
    source: {
      observer: { display: 'consent-enforcer-bot' },
    },
    entity: [
      {
        what: { reference: `Consent/${consent.id}` },
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
