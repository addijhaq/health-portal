import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: HL7 ADT Message Handler
 *
 * Processes ADT (Admit/Discharge/Transfer) messages received
 * via the HL7 v2 interface engine.
 *
 * ADT^A01 → Create Encounter (admit)
 * ADT^A02 → Update Encounter (transfer)
 * ADT^A03 → Update Encounter (discharge)
 * ADT^A04 → Create/Update Patient (register)
 * ADT^A08 → Update Patient demographics
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('ADT handler triggered');

  // TODO: Phase 2 — Parse HL7 v2 ADT message
  // TODO: Transform to FHIR Patient/Encounter using hl7-engine transforms
  // TODO: Write to Medplum CDR
}
