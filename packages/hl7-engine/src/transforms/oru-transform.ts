import type {
  Bundle,
  BundleEntry,
  DiagnosticReport,
  Observation,
  DocumentReference,
  Resource,
} from '@medplum/fhirtypes';
import type { Hl7MessageMeta } from '@health-portal/core';
import { CODE_SYSTEMS, IDENTIFIER_SYSTEMS } from '@health-portal/core';
import { pidToPatient, parseHl7Date } from './common';

const ORIGIN_TAG = { system: 'http://health-portal/origin', code: 'hl7-v2' };

/** Map OBX-11 observation result status to FHIR Observation.status. */
function mapObservationStatus(obx11?: string): Observation['status'] {
  switch (obx11?.toUpperCase()) {
    case 'F': return 'final';
    case 'P': return 'preliminary';
    case 'C': return 'corrected';
    default: return 'unknown';
  }
}

/** Parse OBX value based on value type (OBX-2). */
function parseObxValue(valueType: string | undefined, valueField: string | undefined): Partial<Observation> {
  if (!valueField) return {};
  switch (valueType?.toUpperCase()) {
    case 'NM': {
      const numVal = parseFloat(valueField);
      return {
        valueQuantity: {
          value: isNaN(numVal) ? undefined : numVal,
        },
      };
    }
    case 'ST':
      return { valueString: valueField };
    case 'CE': {
      const parts = valueField.split('^');
      return {
        valueCodeableConcept: {
          coding: [
            {
              code: parts[0],
              display: parts[1],
              system: parts[2] || undefined,
            },
          ],
        },
      };
    }
    default:
      return { valueString: valueField };
  }
}

/** Parse HL7 v2 segments from a raw message string. */
function parseSegments(raw: string): string[][] {
  return raw.split('\r').map((line) => line.split('|')).filter((f) => f[0]);
}

/** Group OBR and their subsequent OBX segments. */
function groupObrObx(lines: string[][]): Array<{ obr: string[]; obxList: string[][] }> {
  const groups: Array<{ obr: string[]; obxList: string[][] }> = [];
  let current: { obr: string[]; obxList: string[][] } | null = null;

  for (const fields of lines) {
    if (fields[0] === 'OBR') {
      current = { obr: fields, obxList: [] };
      groups.push(current);
    } else if (fields[0] === 'OBX' && current) {
      current.obxList.push(fields);
    }
  }
  return groups;
}

/**
 * Transform an ORU (R01) HL7 v2 message into a FHIR R4 transaction Bundle.
 *
 * Mappings:
 *   PID -> Patient (lookup by MRN; if no MRN, store raw as unmatched DocumentReference)
 *   OBR -> DiagnosticReport (one per OBR group)
 *   OBX -> Observation (one per OBX, typed by OBX-2)
 */
export async function transformOru(rawMessage: string, meta: Hl7MessageMeta): Promise<Bundle> {
  const lines = parseSegments(rawMessage);
  const entries: BundleEntry[] = [];

  // --- PID -> Patient ---
  const pidLine = lines.find((f) => f[0] === 'PID');
  const pidFields = pidLine ?? [];
  const patientMrn = pidFields[3]?.split('^')[0];

  // If no MRN, return NAK-style bundle with raw stored in DocumentReference
  if (!patientMrn) {
    const docRef: DocumentReference = {
      resourceType: 'DocumentReference',
      meta: { tag: [ORIGIN_TAG] },
      status: 'current',
      category: [
        {
          coding: [{ system: 'http://health-portal/document-category', code: 'unmatched-oru' }],
        },
      ],
      content: [
        {
          attachment: {
            contentType: 'text/plain',
            data: Buffer.from(rawMessage).toString('base64'),
          },
        },
      ],
      description: `Unmatched ORU R01 - message control ID: ${meta.messageControlId}`,
    };
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          resource: docRef as Resource,
          request: { method: 'POST', url: 'DocumentReference' },
        },
      ],
    };
  }

  const patient = pidToPatient(pidFields);
  const patientFullUrl = `urn:uuid:patient-${patientMrn}`;

  entries.push({
    fullUrl: patientFullUrl,
    resource: {
      ...patient,
      resourceType: 'Patient',
      meta: { tag: [ORIGIN_TAG] },
    } as Resource,
    request: {
      method: 'PUT',
      url: `Patient?identifier=${IDENTIFIER_SYSTEMS.MRN}|${patientMrn}`,
    },
  });

  // --- OBR/OBX groups ---
  const groups = groupObrObx(lines);

  for (let gi = 0; gi < groups.length; gi++) {
    const { obr, obxList } = groups[gi];
    const reportFullUrl = `urn:uuid:report-${meta.messageControlId}-${gi}`;
    const observationRefs: Array<{ reference: string }> = [];

    // --- OBX -> Observation ---
    for (let oi = 0; oi < obxList.length; oi++) {
      const obx = obxList[oi];
      const obsFullUrl = `urn:uuid:obs-${meta.messageControlId}-${gi}-${oi}`;
      const codeParts = (obx[3] ?? '').split('^');
      const valueParts = parseObxValue(obx[2], obx[5]);

      const observation: Observation = {
        resourceType: 'Observation',
        meta: { tag: [ORIGIN_TAG] },
        status: mapObservationStatus(obx[11]),
        code: {
          coding: [
            {
              system: CODE_SYSTEMS.LOINC,
              code: codeParts[0],
              display: codeParts[1],
            },
          ],
        },
        subject: { reference: patientFullUrl },
        ...valueParts,
      };

      // Reference range from OBX-7
      if (obx[7]) {
        observation.referenceRange = [{ text: obx[7] }];
      }

      // Units from OBX-6
      if (obx[6] && observation.valueQuantity) {
        observation.valueQuantity.unit = obx[6];
      }

      entries.push({
        fullUrl: obsFullUrl,
        resource: observation as Resource,
        request: { method: 'POST', url: 'Observation' },
      });
      observationRefs.push({ reference: obsFullUrl });
    }

    // --- OBR -> DiagnosticReport ---
    const obrCodeParts = (obr[4] ?? '').split('^');
    const report: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      meta: { tag: [ORIGIN_TAG] },
      status: 'final',
      code: {
        coding: [
          {
            system: CODE_SYSTEMS.LOINC,
            code: obrCodeParts[0],
            display: obrCodeParts[1],
          },
        ],
      },
      subject: { reference: patientFullUrl },
      effectiveDateTime: parseHl7Date(obr[7]),
      issued: parseHl7Date(obr[22]) ? `${parseHl7Date(obr[22])}T00:00:00Z` : undefined,
      result: observationRefs.length > 0 ? observationRefs : undefined,
    };

    entries.push({
      fullUrl: reportFullUrl,
      resource: report as Resource,
      request: { method: 'POST', url: 'DiagnosticReport' },
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  };
}
