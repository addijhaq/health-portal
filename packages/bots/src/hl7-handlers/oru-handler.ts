import { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Communication,
  DiagnosticReport,
  Observation,
} from '@medplum/fhirtypes';
import { PhenoMlClient, ConstructService } from '@health-portal/phenoml';
import { CODE_SYSTEMS } from '@health-portal/core';

const HL7_ORIGIN_TAG = 'http://health-portal/origin';
const HL7_ORIGIN_CODE = 'hl7-v2';
const AUTO_APPLY_CONFIDENCE = 0.90;

/**
 * Medplum Bot: ORU Post-Processor
 *
 * Triggered by FHIR Subscription on DiagnosticReport resources.
 * Handles post-processing of DiagnosticReports created by the HL7 v2
 * interface engine's ORU transform.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<DiagnosticReport>): Promise<void> {
  const report = event.input;
  console.log(`ORU post-processor triggered for DiagnosticReport/${report.id}`);

  // Only process resources originating from HL7 v2 feed
  if (!hasHl7Origin(report)) {
    console.log(`DiagnosticReport/${report.id} is not HL7-originated, skipping`);
    return;
  }

  // Read linked Observations
  const observationRefs = report.result ?? [];
  const observations: Observation[] = [];
  for (const ref of observationRefs) {
    if (!ref.reference) continue;
    try {
      const [, obsId] = ref.reference.split('/');
      const obs = await medplum.readResource('Observation', obsId);
      observations.push(obs);
    } catch {
      console.log(`Could not read ${ref.reference}`);
    }
  }

  console.log(`Found ${observations.length} linked Observation(s)`);

  // Run Construe for LOINC validation on Observations missing codes
  const phenoml = new PhenoMlClient({
    apiKey: event.secrets['PHENOML_API_KEY']?.valueString ?? '',
    baseUrl: event.secrets['PHENOML_BASE_URL']?.valueString ?? 'https://api.pheno.ml',
    fhirServerType: 'medplum',
  });
  const construe = new ConstructService(phenoml);

  for (const obs of observations) {
    const hasLoinc = obs.code?.coding?.some((c) => c.system === CODE_SYSTEMS.LOINC);
    if (!hasLoinc) {
      const displayText = obs.code?.text ?? obs.code?.coding?.[0]?.display;
      if (displayText) {
        try {
          const results = await construe.extract({
            text: displayText,
            vocabularies: ['LOINC'],
            maxResults: 1,
          });
          if (results.length > 0 && results[0].codes.length > 0) {
            const topCode = results[0].codes[0];
            if (topCode.confidence >= AUTO_APPLY_CONFIDENCE) {
              const existingCoding = obs.code?.coding ?? [];
              await medplum.updateResource({
                ...obs,
                code: {
                  ...obs.code,
                  coding: [
                    ...existingCoding,
                    {
                      system: CODE_SYSTEMS.LOINC,
                      code: topCode.code,
                      display: topCode.display,
                    },
                  ],
                },
              });
              console.log(`Auto-applied LOINC ${topCode.code} to Observation/${obs.id}`);
            }
          }
        } catch (err) {
          console.log(`Construe lookup failed for Observation/${obs.id}: ${err}`);
        }
      }
    }

    // Check for critical values
    if (isCriticalValue(obs)) {
      await createCriticalNotification(medplum, obs);
    }
  }

  console.log(`ORU post-processing complete for DiagnosticReport/${report.id}`);
}

function hasHl7Origin(resource: { meta?: { tag?: Array<{ system?: string; code?: string }> } }): boolean {
  return resource.meta?.tag?.some(
    (t) => t.system === HL7_ORIGIN_TAG && t.code === HL7_ORIGIN_CODE
  ) ?? false;
}

function isCriticalValue(obs: Observation): boolean {
  const interpretations = obs.interpretation ?? [];
  for (const interp of interpretations) {
    for (const coding of interp.coding ?? []) {
      if (['HH', 'LL', 'AA', 'HU', 'LU'].includes(coding.code ?? '')) {
        return true;
      }
    }
  }
  return false;
}

async function createCriticalNotification(
  medplum: MedplumClient,
  observation: Observation
): Promise<void> {
  const codeSummary =
    observation.code?.coding?.[0]?.display ?? observation.code?.text ?? 'Lab result';

  const communication: Communication = {
    resourceType: 'Communication',
    status: 'preparation',
    priority: 'urgent',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/communication-category',
            code: 'alert',
            display: 'Alert',
          },
        ],
      },
    ],
    subject: observation.subject?.reference ? { reference: observation.subject.reference } : undefined,
    about: [{ reference: `Observation/${observation.id}` }],
    recipient: observation.performer ?? [],
    payload: [
      {
        contentString: `CRITICAL LAB RESULT: ${codeSummary} for ${observation.subject?.reference ?? 'unknown patient'}. Immediate review required.`,
      },
    ],
  };

  await medplum.createResource(communication);
  console.log(`Created critical notification for Observation/${observation.id}`);
}
