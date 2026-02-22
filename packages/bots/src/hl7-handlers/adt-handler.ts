import { BotEvent, MedplumClient } from '@medplum/core';
import type { Encounter, Patient } from '@medplum/fhirtypes';

const HL7_ORIGIN_TAG = 'http://health-portal/origin';
const HL7_ORIGIN_CODE = 'hl7-v2';

/**
 * Medplum Bot: ADT Post-Processor
 *
 * Triggered by FHIR Subscription on Encounter resources.
 * Handles post-processing of Encounters created by the HL7 v2
 * interface engine's ADT transform (packages/hl7-engine).
 *
 * NOTE: Raw HL7 v2 parsing and FHIR transformation is NOT done here --
 * that is handled by the HL7 engine (standalone TCP service).
 * This bot runs after the FHIR resources are already in Medplum.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<void> {
  const encounter = event.input;
  console.log(`ADT post-processor triggered for Encounter/${encounter.id}`);

  // Only process resources originating from HL7 v2 feed
  if (!hasHl7Origin(encounter)) {
    console.log(`Encounter/${encounter.id} is not HL7-originated, skipping`);
    return;
  }

  // Validate the Patient reference exists
  const patientRef = encounter.subject?.reference;
  if (!patientRef) {
    console.log(`Encounter/${encounter.id} has no subject reference`);
    return;
  }

  let patient: Patient;
  try {
    const [, patientId] = patientRef.split('/');
    patient = await medplum.readResource('Patient', patientId);
  } catch {
    console.log(`Patient not found for ${patientRef}, skipping demographics validation`);
    return;
  }

  // Validate demographics consistency
  if (!patient.name?.[0]?.family) {
    console.log(`Warning: Patient/${patient.id} missing family name`);
  }
  if (!patient.birthDate) {
    console.log(`Warning: Patient/${patient.id} missing birth date`);
  }

  // Check if patient is linked to an external EMR and trigger sync
  const emrLinks = patient.link?.filter((l) => l.type === 'seealso') ?? [];
  if (emrLinks.length > 0) {
    console.log(
      `Patient/${patient.id} has ${emrLinks.length} EMR link(s), sync will be triggered by subscription`
    );
  }

  console.log(`ADT post-processing complete for Encounter/${encounter.id}`);
}

function hasHl7Origin(resource: { meta?: { tag?: Array<{ system?: string; code?: string }> } }): boolean {
  return resource.meta?.tag?.some(
    (t) => t.system === HL7_ORIGIN_TAG && t.code === HL7_ORIGIN_CODE
  ) ?? false;
}
