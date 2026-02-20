import { BotEvent, MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

/**
 * Medplum Bot: Patient Onboarding
 *
 * Triggered when a new Patient resource is created.
 * 1. Checks for duplicate patients across connected EMRs (MPI matching)
 * 2. Runs PhenoML intake processing if intake documents are attached
 * 3. Sets up default access policies and consent records
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<void> {
  const patient = event.input;
  console.log(`Patient onboarding triggered for: ${patient.id}`);

  // TODO: Phase 3 — Query external EMRs for existing patient records
  // TODO: Phase 4 — Run PhenoML agent for intake document processing
  // TODO: Phase 5 — Create default Consent resource for patient
}
