import type { Bundle, BundleEntry, Appointment, Resource } from '@medplum/fhirtypes';
import type { Hl7MessageMeta } from '@health-portal/core';
import { IDENTIFIER_SYSTEMS } from '@health-portal/core';
import { pidToPatient, parseHl7Date } from './common';

const ORIGIN_TAG = { system: 'http://health-portal/origin', code: 'hl7-v2' };

/** Map SIU trigger event to FHIR Appointment status. */
function appointmentStatus(trigger: string): Appointment['status'] {
  switch (trigger) {
    case 'S12':
    case 'S13':
    case 'S14':
      return 'booked';
    case 'S15':
      return 'cancelled';
    default:
      return 'proposed';
  }
}

/** Parse HL7 v2 datetime (YYYYMMDDHHmm) to FHIR instant format. */
function parseHl7DateTime(dateField?: string): string | undefined {
  if (!dateField || dateField.length < 8) return undefined;
  const date = `${dateField.slice(0, 4)}-${dateField.slice(4, 6)}-${dateField.slice(6, 8)}`;
  if (dateField.length >= 12) {
    return `${date}T${dateField.slice(8, 10)}:${dateField.slice(10, 12)}:00Z`;
  }
  return `${date}T00:00:00Z`;
}

/** Parse HL7 v2 segments from a raw message string. */
function parseSegments(raw: string): Map<string, string[][]> {
  const segments = new Map<string, string[][]>();
  for (const line of raw.split('\r')) {
    const fields = line.split('|');
    const segId = fields[0];
    if (!segId) continue;
    const existing = segments.get(segId) ?? [];
    existing.push(fields);
    segments.set(segId, existing);
  }
  return segments;
}

/**
 * Transform a SIU (S12-S15) HL7 v2 message into a FHIR R4 transaction Bundle.
 *
 * Mappings:
 *   SCH -> Appointment (start/end from SCH-11, status by trigger event)
 *   AIG -> Appointment.participant (provider reference)
 *   PID -> Patient reference
 */
export async function transformSiu(rawMessage: string, meta: Hl7MessageMeta): Promise<Bundle> {
  const segments = parseSegments(rawMessage);
  const entries: BundleEntry[] = [];

  // --- PID -> Patient ---
  const pidRows = segments.get('PID') ?? [];
  const pidFields = pidRows[0] ?? [];
  const patientMrn = pidFields[3]?.split('^')[0];
  const patientFullUrl = `urn:uuid:patient-${patientMrn ?? meta.messageControlId}`;

  const patient = pidToPatient(pidFields);
  entries.push({
    fullUrl: patientFullUrl,
    resource: {
      ...patient,
      resourceType: 'Patient',
      meta: { tag: [ORIGIN_TAG] },
    } as Resource,
    request: {
      method: 'PUT',
      url: patientMrn
        ? `Patient?identifier=${IDENTIFIER_SYSTEMS.MRN}|${patientMrn}`
        : 'Patient',
    },
  });

  // --- SCH -> Appointment ---
  const schRows = segments.get('SCH') ?? [];
  if (schRows.length > 0) {
    const sch = schRows[0];

    // SCH-11 contains timing: start^end or a single datetime
    const timingField = sch[11] ?? '';
    const timingParts = timingField.split('^');
    const startDateTime = parseHl7DateTime(timingParts[0]);
    const endDateTime = timingParts.length > 1 ? parseHl7DateTime(timingParts[1]) : undefined;

    const appointment: Appointment = {
      resourceType: 'Appointment',
      meta: { tag: [ORIGIN_TAG] },
      status: appointmentStatus(meta.triggerEvent),
      start: startDateTime,
      end: endDateTime,
      identifier: sch[1]
        ? [{ value: sch[1].split('^')[0] }]
        : undefined,
      description: sch[7]?.split('^')[1] ?? sch[7]?.split('^')[0] ?? undefined,
      participant: [
        {
          actor: { reference: patientFullUrl },
          status: 'accepted',
        },
      ],
    };

    // --- AIG -> Provider participants ---
    const aigRows = segments.get('AIG') ?? [];
    for (const aig of aigRows) {
      const providerField = aig[3] ?? '';
      const provParts = providerField.split('^');
      if (provParts[0]) {
        appointment.participant!.push({
          actor: {
            display: [provParts[1], provParts[2]].filter(Boolean).join(' ') || provParts[0],
            identifier: {
              system: IDENTIFIER_SYSTEMS.NPI,
              value: provParts[0],
            },
          },
          status: 'accepted',
        });
      }
    }

    entries.push({
      resource: appointment as Resource,
      request: { method: 'POST', url: 'Appointment' },
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  };
}
