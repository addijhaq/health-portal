import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: SIU Post-Processor
 *
 * Triggered by FHIR Subscription on Appointment resources.
 * Handles post-processing of Appointments created by the HL7 v2
 * interface engine's SIU transform (packages/hl7-engine).
 *
 * NOTE: Raw HL7 v2 parsing and FHIR transformation is NOT done here —
 * that is handled by the HL7 engine (standalone TCP service).
 * This bot runs after the FHIR resources are already in Medplum.
 *
 * Responsibilities:
 * - Sync appointment to external EMRs if the patient is linked
 * - Send confirmation/cancellation notifications
 * - Update Schedule/Slot availability
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('SIU post-processor triggered');

  // TODO: Phase 2 — Read the Appointment and validate participant references
  // TODO: Phase 3 — If Patient has external EMR links, sync the Appointment
  // TODO: Phase 5 — Send appointment confirmation/cancellation via notification-sender
}
