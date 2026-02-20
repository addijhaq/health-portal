import { BotEvent, MedplumClient } from '@medplum/core';
import type { Observation } from '@medplum/fhirtypes';

/**
 * Medplum Bot: Lab Result Processor
 *
 * Triggered when a new Observation is created (typically from HL7 ORU feed).
 * 1. Validates LOINC coding using PhenoML Construe
 * 2. Checks for critical/abnormal values
 * 3. Creates Communication resource to notify provider if critical
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Observation>): Promise<void> {
  const observation = event.input;
  console.log(`Lab result processor triggered for Observation: ${observation.id}`);

  // TODO: Phase 4 — Validate/enrich LOINC codes via PhenoML Construe
  // TODO: Check reference ranges for critical values
  // TODO: Notify provider via Communication resource if critical
}
