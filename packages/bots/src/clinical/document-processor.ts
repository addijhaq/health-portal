import { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  DocumentReference,
  Provenance,
  Resource,
} from '@medplum/fhirtypes';
import { PhenoMlClient } from '@health-portal/phenoml';
import { Lang2FhirService } from '@health-portal/phenoml';
import { CODE_SYSTEMS } from '@health-portal/core';

const REQUIRED_CODE_SYSTEMS: Record<string, string[]> = {
  Condition: [CODE_SYSTEMS.ICD10_CM, CODE_SYSTEMS.SNOMED],
  MedicationRequest: [CODE_SYSTEMS.RXNORM],
  Procedure: [CODE_SYSTEMS.SNOMED, CODE_SYSTEMS.CPT],
};

/**
 * Medplum Bot: Document Processor
 *
 * Triggered by a Subscription on new DocumentReference resources.
 * Extracts clinical text from the document, sends it through PhenoML
 * Lang2FHIR to generate structured FHIR resources, validates coding,
 * and links results back to the source document via Provenance.
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<DocumentReference>,
): Promise<void> {
  const docRef = event.input;
  console.log(`Document processor triggered for DocumentReference: ${docRef.id}`);

  const text = extractText(docRef);
  if (!text) {
    console.log(`No extractable text content in DocumentReference/${docRef.id}, skipping`);
    return;
  }

  const patientRef = docRef.subject?.reference;
  const patientId = patientRef?.startsWith('Patient/') ? patientRef.split('/')[1] : undefined;

  const phenoml = new PhenoMlClient({
    apiKey: event.secrets['PHENOML_API_KEY']?.valueString ?? '',
    baseUrl: event.secrets['PHENOML_BASE_URL']?.valueString ?? 'https://api.pheno.ml',
    fhirServerType: 'medplum',
    fhirServerUrl: medplum.getBaseUrl(),
  });
  const lang2fhir = new Lang2FhirService(phenoml);

  const bundle = await lang2fhir.create({
    text,
    patientId,
    resourceTypes: ['Condition', 'MedicationRequest', 'AllergyIntolerance', 'Procedure'],
  });

  const createdResources: Resource[] = [];

  if (bundle.entry) {
    for (const entry of bundle.entry) {
      const resource = entry.resource;
      if (!resource?.resourceType) continue;

      validateCoding(resource);

      const created = await medplum.createResource(resource);
      createdResources.push(created);
      console.log(`Created ${created.resourceType}/${created.id}`);
    }
  }

  if (createdResources.length > 0 && docRef.id) {
    await createProvenance(medplum, docRef, createdResources);
  }

  console.log(
    `Document processing complete: ${createdResources.length} resources created from DocumentReference/${docRef.id}`,
  );
}

/**
 * Extract text content from a DocumentReference.
 * Handles base64-encoded inline content or plain text.
 */
function extractText(docRef: DocumentReference): string | undefined {
  const content = docRef.content?.[0];
  if (!content?.attachment) return undefined;

  if (content.attachment.data) {
    const decoded = Buffer.from(content.attachment.data, 'base64').toString('utf-8');
    return decoded;
  }

  // If there's a contentType indicating text, the data should be inline
  // URL-referenced documents would need a separate fetch step
  return undefined;
}

/**
 * Validate that a resource has proper clinical coding.
 * Logs warnings for resources missing expected code systems.
 */
function validateCoding(resource: Resource): void {
  const expectedSystems = REQUIRED_CODE_SYSTEMS[resource.resourceType];
  if (!expectedSystems) return;

  const coding = getResourceCoding(resource);
  if (!coding || coding.length === 0) {
    console.warn(
      `${resource.resourceType} missing coding entirely - may need manual review`,
    );
    return;
  }

  const hasSupportedSystem = coding.some((c) =>
    expectedSystems.includes(c.system ?? ''),
  );
  if (!hasSupportedSystem) {
    console.warn(
      `${resource.resourceType} lacks expected code system (expected one of: ${expectedSystems.join(', ')})`,
    );
  }
}

/**
 * Extract coding array from various resource types.
 */
function getResourceCoding(
  resource: Resource,
): Array<{ system?: string; code?: string }> {
  const r = resource as unknown as Record<string, unknown>;

  // Condition.code, Procedure.code, MedicationRequest.medicationCodeableConcept
  const codeField =
    (r['code'] as { coding?: Array<{ system?: string; code?: string }> }) ??
    (r['medicationCodeableConcept'] as {
      coding?: Array<{ system?: string; code?: string }>;
    });

  return codeField?.coding ?? [];
}

/**
 * Create a Provenance resource linking generated FHIR resources
 * back to the source DocumentReference.
 */
async function createProvenance(
  medplum: MedplumClient,
  docRef: DocumentReference,
  targets: Resource[],
): Promise<void> {
  const provenance: Provenance = {
    resourceType: 'Provenance',
    target: targets.map((r) => ({
      reference: `${r.resourceType}/${r.id}`,
    })),
    recorded: new Date().toISOString(),
    activity: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
          code: 'CREATE',
          display: 'create',
        },
      ],
    },
    agent: [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
              code: 'assembler',
              display: 'Assembler',
            },
          ],
        },
        who: {
          display: 'PhenoML Lang2FHIR Document Processor',
        },
      },
    ],
    entity: [
      {
        role: 'source',
        what: {
          reference: `DocumentReference/${docRef.id}`,
        },
      },
    ],
  };

  const created = await medplum.createResource(provenance);
  console.log(`Created Provenance/${created.id} linking ${targets.length} resources to DocumentReference/${docRef.id}`);
}
