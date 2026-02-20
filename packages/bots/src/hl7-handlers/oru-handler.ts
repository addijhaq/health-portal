import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: ORU Post-Processor
 *
 * Triggered by FHIR Subscription on DiagnosticReport resources.
 * Handles post-processing of DiagnosticReports created by the HL7 v2
 * interface engine's ORU transform (packages/hl7-engine).
 *
 * NOTE: Raw HL7 v2 parsing and FHIR transformation is NOT done here —
 * that is handled by the HL7 engine (standalone TCP service).
 * This bot runs after the FHIR resources are already in Medplum.
 *
 * Responsibilities:
 * - Run Construe to validate/enrich LOINC codes on linked Observations
 * - Check for critical values and flag for immediate provider notification
 * - Trigger EMR sync if the patient is linked to an external system
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('ORU post-processor triggered');

  // TODO: Phase 2 — Read the DiagnosticReport and its linked Observations
  // TODO: Phase 4 — Run Construe on Observations missing LOINC codes
  // TODO: Phase 5 — Check for critical values and notify provider via notification-sender
}
