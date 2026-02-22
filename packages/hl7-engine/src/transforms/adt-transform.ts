import type { Bundle, BundleEntry, Encounter, Condition, Coverage, RelatedPerson, Resource } from '@medplum/fhirtypes';
import type { Hl7MessageMeta } from '@health-portal/core';
import { CODE_SYSTEMS, IDENTIFIER_SYSTEMS } from '@health-portal/core';
import { pidToPatient, parseHl7Date } from './common';

const ORIGIN_TAG = { system: 'http://health-portal/origin', code: 'hl7-v2' };

/** Map ADT trigger event to FHIR Encounter status. */
function encounterStatus(trigger: string): Encounter['status'] {
  switch (trigger) {
    case 'A01': return 'in-progress';
    case 'A03': return 'finished';
    case 'A04': return 'planned';
    default: return 'in-progress';
  }
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
 * Transform an ADT (A01-A08) HL7 v2 message into a FHIR R4 transaction Bundle.
 *
 * Mappings:
 *   PID -> Patient (create or update by MRN match)
 *   PV1 -> Encounter
 *   DG1 -> Condition (attached to Encounter)
 *   IN1/IN2 -> Coverage
 *   NK1 -> RelatedPerson
 */
export async function transformAdt(rawMessage: string, meta: Hl7MessageMeta): Promise<Bundle> {
  const segments = parseSegments(rawMessage);
  const entries: BundleEntry[] = [];

  // --- PID -> Patient ---
  const pidRows = segments.get('PID') ?? [];
  const pidFields = pidRows[0] ?? [];
  const patient = pidToPatient(pidFields);
  const patientMrn = pidFields[3]?.split('^')[0];
  const patientFullUrl = `urn:uuid:patient-${patientMrn ?? meta.messageControlId}`;

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
        : `Patient`,
    },
  });

  // --- PV1 -> Encounter ---
  const pv1Rows = segments.get('PV1') ?? [];
  if (pv1Rows.length > 0) {
    const pv1 = pv1Rows[0];
    const encounterFullUrl = `urn:uuid:encounter-${meta.messageControlId}`;
    const encounter: Encounter = {
      resourceType: 'Encounter',
      meta: { tag: [ORIGIN_TAG] },
      status: encounterStatus(meta.triggerEvent),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: pv1[2] ?? 'IMP',
      },
      subject: { reference: patientFullUrl },
      identifier: pv1[19]
        ? [{ system: IDENTIFIER_SYSTEMS.MRN, value: pv1[19] }]
        : undefined,
    };

    // Attending physician from PV1-7
    if (pv1[7]) {
      const provParts = pv1[7].split('^');
      encounter.participant = [
        {
          type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND' }] }],
          individual: { display: [provParts[1], provParts[2]].filter(Boolean).join(' ') || provParts[0] },
        },
      ];
    }

    entries.push({
      fullUrl: encounterFullUrl,
      resource: encounter as Resource,
      request: { method: 'POST', url: 'Encounter' },
    });

    // --- DG1 -> Condition ---
    const dg1Rows = segments.get('DG1') ?? [];
    for (const dg1 of dg1Rows) {
      const codeField = dg1[3];
      if (!codeField) continue;
      const codeParts = codeField.split('^');
      const condition: Condition = {
        resourceType: 'Condition',
        meta: { tag: [ORIGIN_TAG] },
        subject: { reference: patientFullUrl },
        encounter: { reference: encounterFullUrl },
        code: {
          coding: [
            {
              system: CODE_SYSTEMS.ICD10_CM,
              code: codeParts[0],
              display: codeParts[1],
            },
          ],
        },
        recordedDate: parseHl7Date(dg1[5]),
      };
      entries.push({
        resource: condition as Resource,
        request: { method: 'POST', url: 'Condition' },
      });
    }
  }

  // --- IN1/IN2 -> Coverage ---
  const in1Rows = segments.get('IN1') ?? [];
  for (const in1 of in1Rows) {
    const coverage: Coverage = {
      resourceType: 'Coverage',
      meta: { tag: [ORIGIN_TAG] },
      status: 'active',
      beneficiary: { reference: patientFullUrl },
      subscriberId: in1[36] ?? undefined,
      payor: in1[4]
        ? [{ display: in1[4].split('^')[0] }]
        : [{ display: 'Unknown' }],
      identifier: in1[2]
        ? [{ value: in1[2] }]
        : undefined,
    };
    entries.push({
      resource: coverage as Resource,
      request: { method: 'POST', url: 'Coverage' },
    });
  }

  // --- NK1 -> RelatedPerson ---
  const nk1Rows = segments.get('NK1') ?? [];
  for (const nk1 of nk1Rows) {
    const nameParts = (nk1[2] ?? '').split('^');
    const relatedPerson: RelatedPerson = {
      resourceType: 'RelatedPerson',
      meta: { tag: [ORIGIN_TAG] },
      patient: { reference: patientFullUrl },
      name: [
        {
          family: nameParts[0] || undefined,
          given: nameParts[1] ? [nameParts[1]] : undefined,
        },
      ],
      relationship: nk1[3]
        ? [{ coding: [{ code: nk1[3].split('^')[0], display: nk1[3].split('^')[1] }] }]
        : undefined,
      telecom: nk1[5]
        ? [{ system: 'phone', value: nk1[5].split('^')[0] }]
        : undefined,
    };
    entries.push({
      resource: relatedPerson as Resource,
      request: { method: 'POST', url: 'RelatedPerson' },
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  };
}
