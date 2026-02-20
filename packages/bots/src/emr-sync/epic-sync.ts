import { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Medplum Bot: Epic FHIR Sync
 *
 * Runs on a cron schedule (every 15 minutes) and on subscription triggers.
 * Performs bidirectional sync between Medplum CDR and Epic FHIR API.
 *
 * Import: Pull new/updated resources from Epic → Medplum
 * Export: Push local changes from Medplum → Epic
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  console.log('Epic sync bot triggered');

  // TODO: Phase 3 — Implement using EpicConnector
  // 1. Authenticate with Epic (JWT backend services)
  // 2. Pull changes since last sync timestamp
  // 3. Map Epic-specific extensions to local format
  // 4. Write imported resources to Medplum
  // 5. Push local changes to Epic
  // 6. Log sync results to AuditEvent
}
