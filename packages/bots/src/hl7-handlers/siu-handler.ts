import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: HL7 SIU Message Handler
 *
 * Processes SIU (Scheduling) messages.
 * SIU^S12 → New appointment
 * SIU^S13 → Rescheduled appointment
 * SIU^S14 → Modified appointment
 * SIU^S15 → Cancelled appointment
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('SIU handler triggered');

  // TODO: Phase 2 — Parse HL7 v2 SIU message
  // TODO: Transform to FHIR Appointment resource
  // TODO: Write to Medplum CDR
}
