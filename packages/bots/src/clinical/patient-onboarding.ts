import { BotEvent, MedplumClient } from '@medplum/core';
import type {
  AllergyIntolerance,
  Bundle,
  Condition,
  DocumentReference,
  MedicationRequest,
  Patient,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import { PhenoMlClient, AgentService } from '@health-portal/phenoml';

const LOW_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Medplum Bot: Patient Onboarding
 *
 * Triggered when a new Patient resource is created.
 * 1. Checks for attached DocumentReferences (intake forms, prior records)
 * 2. Runs PhenoML Agent to extract clinical data from documents
 * 3. Creates Condition, MedicationRequest, AllergyIntolerance resources
 * 4. Flags low-confidence items for provider review via Task resources
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Patient>,
): Promise<void> {
  const patient = event.input;
  console.log(`Patient onboarding triggered for: ${patient.id}`);

  // Find DocumentReferences attached to this patient (intake docs)
  const docRefs = await medplum.searchResources('DocumentReference', {
    subject: `Patient/${patient.id}`,
    _sort: '-_lastUpdated',
    _count: '10',
  });

  if (docRefs.length === 0) {
    console.log(`No documents found for Patient/${patient.id}, skipping intake processing`);
    return;
  }

  console.log(`Found ${docRefs.length} document(s) for Patient/${patient.id}`);

  const phenoml = new PhenoMlClient({
    apiKey: event.secrets['PHENOML_API_KEY']?.valueString ?? '',
    baseUrl: event.secrets['PHENOML_BASE_URL']?.valueString ?? 'https://api.pheno.ml',
    fhirServerType: 'medplum',
    fhirServerUrl: medplum.getBaseUrl(),
  });
  const agent = new AgentService(phenoml);

  // Build combined text from all intake documents
  const documentTexts: string[] = [];
  for (const docRef of docRefs) {
    const text = extractDocumentText(docRef);
    if (text) {
      documentTexts.push(text);
    }
  }

  if (documentTexts.length === 0) {
    console.log(`No extractable text in documents for Patient/${patient.id}`);
    return;
  }

  const combinedText = documentTexts.join('\n\n---\n\n');

  // Run PhenoML Agent to extract clinical data
  const result = await agent.run({
    task: [
      'Extract the following from this patient intake documentation:',
      '1. Problem list (active conditions and diagnoses)',
      '2. Current medications with dosages',
      '3. Known allergies and adverse reactions',
      'Return structured FHIR resources for each item found.',
    ].join('\n'),
    patientId: patient.id,
    fhirServer: medplum.getBaseUrl(),
    tools: ['lang2fhir', 'construe'],
  });

  // Process the generated FHIR resources
  const createdResources: Resource[] = [];
  const lowConfidenceItems: Resource[] = [];

  if (result.fhirResources?.entry) {
    for (const entry of result.fhirResources.entry) {
      const resource = entry.resource;
      if (!resource?.resourceType) continue;

      // Check if any extracted codes have low confidence
      const isLowConfidence = hasLowConfidenceCode(resource, result.codesExtracted);

      // Set patient reference
      setSubjectReference(resource, patient.id!);

      const created = await medplum.createResource(resource);
      createdResources.push(created);

      if (isLowConfidence) {
        lowConfidenceItems.push(created);
      }

      console.log(
        `Created ${created.resourceType}/${created.id}${isLowConfidence ? ' (flagged for review)' : ''}`,
      );
    }
  }

  // Create Task resources for items needing provider review
  if (lowConfidenceItems.length > 0) {
    await createReviewTasks(medplum, patient, lowConfidenceItems);
  }

  console.log(
    `Patient onboarding complete for Patient/${patient.id}: ` +
      `${createdResources.length} resources created, ` +
      `${lowConfidenceItems.length} flagged for review`,
  );
}

/**
 * Extract text content from a DocumentReference.
 */
function extractDocumentText(docRef: DocumentReference): string | undefined {
  const content = docRef.content?.[0];
  if (!content?.attachment) return undefined;

  if (content.attachment.data) {
    return Buffer.from(content.attachment.data, 'base64').toString('utf-8');
  }

  return undefined;
}

/**
 * Check if a resource's codes were extracted with low confidence.
 */
function hasLowConfidenceCode(
  resource: Resource,
  codesExtracted?: Array<{ code: string; display: string; system: string }>,
): boolean {
  if (!codesExtracted || codesExtracted.length === 0) return false;

  // If the agent returned codes, check if any have indicators of low confidence
  // The agent response structure may vary; we flag resources whose codes
  // don't appear in the high-confidence extracted codes list
  const r = resource as unknown as Record<string, unknown>;
  const codeField =
    (r['code'] as { coding?: Array<{ code?: string; system?: string }> }) ??
    (r['medicationCodeableConcept'] as { coding?: Array<{ code?: string; system?: string }> });

  if (!codeField?.coding) return true; // No coding at all = needs review

  const resourceCodes = codeField.coding.map((c) => `${c.system}|${c.code}`);
  const extractedCodes = new Set(codesExtracted.map((c) => `${c.system}|${c.code}`));

  // If none of the resource's codes appear in extracted codes, flag for review
  return !resourceCodes.some((rc) => extractedCodes.has(rc));
}

/**
 * Set the subject reference on a resource to point to the patient.
 */
function setSubjectReference(resource: Resource, patientId: string): void {
  const r = resource as unknown as Record<string, unknown>;
  r['subject'] = { reference: `Patient/${patientId}` };

  // Also set patient-specific reference fields
  if (resource.resourceType === 'AllergyIntolerance') {
    (resource as AllergyIntolerance).patient = { reference: `Patient/${patientId}` };
  }
}

/**
 * Create Task resources for provider review of low-confidence items.
 */
async function createReviewTasks(
  medplum: MedplumClient,
  patient: Patient,
  items: Resource[],
): Promise<void> {
  const task: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'proposal',
    priority: 'routine',
    description:
      `Review ${items.length} auto-extracted clinical item(s) for ` +
      `Patient/${patient.id} (${patient.name?.[0]?.family ?? 'Unknown'}). ` +
      `These items were extracted from intake documents with low confidence and need provider confirmation.`,
    for: {
      reference: `Patient/${patient.id}`,
    },
    focus: items.length === 1
      ? { reference: `${items[0].resourceType}/${items[0].id}` }
      : undefined,
    input: items.map((item) => ({
      type: {
        text: 'Resource needing review',
      },
      valueReference: {
        reference: `${item.resourceType}/${item.id}`,
      },
    })),
  };

  const created = await medplum.createResource(task);
  console.log(
    `Created review Task/${created.id} for ${items.length} low-confidence items`,
  );
}
