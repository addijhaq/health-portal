import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: athenahealth FHIR Sync
 *
 * Bidirectional sync with athenahealth via FHIR R4 APIs.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('Athena sync bot triggered');

  // TODO: Phase 3 — Implement using AthenaConnector
}
