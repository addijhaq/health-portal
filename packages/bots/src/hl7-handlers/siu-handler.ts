import { BotEvent, MedplumClient } from '@medplum/core';
import type { Appointment, Patient } from '@medplum/fhirtypes';

const HL7_ORIGIN_TAG = 'http://health-portal/origin';
const HL7_ORIGIN_CODE = 'hl7-v2';

/**
 * Medplum Bot: SIU Post-Processor
 *
 * Triggered by FHIR Subscription on Appointment resources.
 * Handles post-processing of Appointments created by the HL7 v2
 * interface engine's SIU transform.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Appointment>): Promise<void> {
  const appointment = event.input;
  console.log(`SIU post-processor triggered for Appointment/${appointment.id}`);

  // Only process resources originating from HL7 v2 feed
  if (!hasHl7Origin(appointment)) {
    console.log(`Appointment/${appointment.id} is not HL7-originated, skipping`);
    return;
  }

  // Validate participant references
  const participants = appointment.participant ?? [];
  for (const participant of participants) {
    const ref = participant.actor?.reference;
    if (!ref) continue;

    try {
      const [resourceType, id] = ref.split('/');
      await medplum.readResource(resourceType as 'Patient' | 'Practitioner', id);
    } catch {
      console.log(`Warning: Appointment/${appointment.id} references non-existent ${ref}`);
    }
  }

  // Check if patient is linked to an external EMR and trigger sync
  const patientRef = participants.find(
    (p) => p.actor?.reference?.startsWith('Patient/')
  )?.actor?.reference;

  if (patientRef) {
    try {
      const [, patientId] = patientRef.split('/');
      const patient = await medplum.readResource('Patient', patientId);

      const emrLinks = patient.link?.filter((l) => l.type === 'seealso') ?? [];
      if (emrLinks.length > 0) {
        console.log(
          `Patient/${patient.id} linked to ${emrLinks.length} EMR(s), appointment sync will be triggered`
        );
      }
    } catch {
      console.log(`Could not read patient ${patientRef}`);
    }
  }

  // Log appointment status for notification handling
  const status = appointment.status;
  if (status === 'cancelled') {
    console.log(`Appointment/${appointment.id} was cancelled`);
  } else if (status === 'booked') {
    console.log(`Appointment/${appointment.id} was booked/confirmed`);
  }

  console.log(`SIU post-processing complete for Appointment/${appointment.id}`);
}

function hasHl7Origin(resource: { meta?: { tag?: Array<{ system?: string; code?: string }> } }): boolean {
  return resource.meta?.tag?.some(
    (t) => t.system === HL7_ORIGIN_TAG && t.code === HL7_ORIGIN_CODE
  ) ?? false;
}
