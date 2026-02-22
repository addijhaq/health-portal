import { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Communication,
  Observation,
  Task,
} from '@medplum/fhirtypes';
import { PhenoMlClient, ConstructService } from '@health-portal/phenoml';
import { CODE_SYSTEMS } from '@health-portal/core';

const AUTO_APPLY_CONFIDENCE = 0.90;

/**
 * Medplum Bot: Lab Result Processor
 *
 * Triggered when a new Observation is created (typically from HL7 ORU feed).
 * 1. Validates LOINC coding using PhenoML Construe
 * 2. Auto-applies high-confidence codes, flags low-confidence for review
 * 3. Checks for critical/abnormal values against reference ranges
 * 4. Creates Communication resource to notify provider if critical
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Observation>,
): Promise<void> {
  const observation = event.input;
  console.log(`Lab result processor triggered for Observation: ${observation.id}`);

  // Step 1: Validate/enrich LOINC coding
  await enrichLoincCoding(medplum, observation, event);

  // Step 2: Check for critical values
  const isCritical = checkCriticalValue(observation);

  // Step 3: Notify provider if critical
  if (isCritical) {
    await notifyProviderCriticalResult(medplum, observation);
  }

  console.log(
    `Lab result processing complete for Observation/${observation.id}` +
      (isCritical ? ' [CRITICAL]' : ''),
  );
}

/**
 * Check if the Observation already has a LOINC code.
 * If not, use Construe to suggest one and either auto-apply or flag for review.
 */
async function enrichLoincCoding(
  medplum: MedplumClient,
  observation: Observation,
  event: BotEvent<Observation>,
): Promise<void> {
  const hasLoinc = observation.code?.coding?.some(
    (c) => c.system === CODE_SYSTEMS.LOINC,
  );

  if (hasLoinc) {
    console.log(`Observation/${observation.id} already has LOINC coding`);
    return;
  }

  // Need display text to look up a code
  const displayText = observation.code?.text ?? observation.code?.coding?.[0]?.display;
  if (!displayText) {
    console.log(`Observation/${observation.id} has no text to look up LOINC code`);
    return;
  }

  console.log(`Looking up LOINC code for: "${displayText}"`);

  const phenoml = new PhenoMlClient({
    apiKey: event.secrets['PHENOML_API_KEY']?.valueString ?? '',
    baseUrl: event.secrets['PHENOML_BASE_URL']?.valueString ?? 'https://api.pheno.ml',
    fhirServerType: 'medplum',
  });
  const construe = new ConstructService(phenoml);

  const results = await construe.extract({
    text: displayText,
    vocabularies: ['LOINC'],
    maxResults: 3,
  });

  if (results.length === 0 || results[0].codes.length === 0) {
    console.log(`No LOINC codes found for "${displayText}"`);
    return;
  }

  const topCode = results[0].codes[0];

  if (topCode.confidence >= AUTO_APPLY_CONFIDENCE) {
    // Auto-apply the LOINC code
    const existingCoding = observation.code?.coding ?? [];
    await medplum.updateResource({
      ...observation,
      code: {
        ...observation.code,
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
    console.log(
      `Auto-applied LOINC ${topCode.code} (${topCode.display}) with confidence ${topCode.confidence}`,
    );
  } else {
    // Flag for provider review
    await createCodingReviewTask(medplum, observation, topCode);
    console.log(
      `Flagged LOINC suggestion ${topCode.code} for review (confidence ${topCode.confidence} < ${AUTO_APPLY_CONFIDENCE})`,
    );
  }
}

/**
 * Check if an Observation value falls outside reference ranges or is flagged
 * as critical by the interpretation field.
 */
function checkCriticalValue(observation: Observation): boolean {
  // Check interpretation coding for critical flags
  const interpretations = observation.interpretation ?? [];
  for (const interp of interpretations) {
    const codes = interp.coding ?? [];
    for (const coding of codes) {
      // HL7 v2 abnormal flag codes that indicate critical
      if (['HH', 'LL', 'AA', 'HU', 'LU'].includes(coding.code ?? '')) {
        return true;
      }
    }
  }

  // Check numeric value against reference range
  const value = observation.valueQuantity?.value;
  const refRange = observation.referenceRange?.[0];
  if (value != null && refRange) {
    const low = refRange.low?.value;
    const high = refRange.high?.value;
    // Critical if outside reference range by > 50% of the range span
    if (low != null && high != null) {
      const rangeSpan = high - low;
      if (value < low - rangeSpan * 0.5 || value > high + rangeSpan * 0.5) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Create a Communication resource to notify the ordering provider
 * of a critical lab result.
 */
async function notifyProviderCriticalResult(
  medplum: MedplumClient,
  observation: Observation,
): Promise<void> {
  const patientRef = observation.subject?.reference;
  const practitionerRef =
    observation.performer?.find((p) => p.reference?.startsWith('Practitioner/'))
      ?.reference;

  const valueSummary = formatObservationValue(observation);
  const codeSummary =
    observation.code?.coding?.[0]?.display ?? observation.code?.text ?? 'Unknown test';

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
    subject: patientRef ? { reference: patientRef } : undefined,
    about: [{ reference: `Observation/${observation.id}` }],
    recipient: practitionerRef ? [{ reference: practitionerRef }] : [],
    payload: [
      {
        contentString:
          `CRITICAL LAB RESULT: ${codeSummary} = ${valueSummary} ` +
          `for ${patientRef ?? 'unknown patient'}. ` +
          `Immediate review required. See Observation/${observation.id}.`,
      },
    ],
  };

  const created = await medplum.createResource(communication);
  console.log(
    `Created critical result Communication/${created.id} for Observation/${observation.id}`,
  );
}

/**
 * Create a Task for provider review of a suggested LOINC code.
 */
async function createCodingReviewTask(
  medplum: MedplumClient,
  observation: Observation,
  suggestedCode: { code: string; display: string; confidence: number },
): Promise<void> {
  const task: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'proposal',
    priority: 'routine',
    description:
      `Review suggested LOINC code for Observation/${observation.id}: ` +
      `${suggestedCode.code} (${suggestedCode.display}) ` +
      `with confidence ${suggestedCode.confidence.toFixed(2)}. ` +
      `Original text: "${observation.code?.text ?? observation.code?.coding?.[0]?.display ?? ''}"`,
    focus: {
      reference: `Observation/${observation.id}`,
    },
    input: [
      {
        type: { text: 'Suggested LOINC code' },
        valueString: suggestedCode.code,
      },
      {
        type: { text: 'Suggested display' },
        valueString: suggestedCode.display,
      },
      {
        type: { text: 'Confidence' },
        valueString: suggestedCode.confidence.toFixed(2),
      },
    ],
  };

  await medplum.createResource(task);
}

/**
 * Format an Observation's value for display in notifications.
 */
function formatObservationValue(observation: Observation): string {
  if (observation.valueQuantity) {
    const val = observation.valueQuantity.value;
    const unit = observation.valueQuantity.unit ?? observation.valueQuantity.code ?? '';
    return `${val} ${unit}`.trim();
  }
  if (observation.valueString) {
    return observation.valueString;
  }
  if (observation.valueCodeableConcept) {
    return observation.valueCodeableConcept.text ?? observation.valueCodeableConcept.coding?.[0]?.display ?? 'coded value';
  }
  return 'value not available';
}
