import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: ADT Post-Processor
 *
 * Triggered by FHIR Subscription on Encounter resources.
 * Handles post-processing of Encounters created by the HL7 v2
 * interface engine's ADT transform (packages/hl7-engine).
 *
 * NOTE: Raw HL7 v2 parsing and FHIR transformation is NOT done here —
 * that is handled by the HL7 engine (standalone TCP service).
 * This bot runs after the FHIR resources are already in Medplum.
 *
 * Responsibilities:
 * - Validate Patient demographics against existing records
 * - Trigger EMR sync if the patient is linked to an external system
 * - Enrich Encounter with additional coded data if needed
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('ADT post-processor triggered');

  // TODO: Phase 2 — Validate the Encounter's Patient reference exists and demographics are consistent
  // TODO: Phase 3 — If Patient has external EMR links, trigger sync to push the new Encounter
}
