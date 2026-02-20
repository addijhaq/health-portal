import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: Cerner / Oracle Health FHIR Sync
 *
 * Bidirectional sync with Cerner via FHIR R4 Ignite APIs.
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('Cerner sync bot triggered');

  // TODO: Phase 3 — Implement using CernerConnector
}
