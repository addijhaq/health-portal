import type { Bundle } from '@medplum/fhirtypes';
import { PhenoMlClient } from './client';

export interface Lang2FhirCreateRequest {
  text: string;
  patientId?: string;
  fhirServer?: string;
  resourceTypes?: string[];
}

export interface Lang2FhirSearchRequest {
  query: string;
  resourceType?: string;
}

export interface Lang2FhirSearchResult {
  fhirSearchUrl: string;
  parameters: Record<string, string>;
}

/**
 * Service wrapper for PhenoML Lang2FHIR API.
 * Converts natural language clinical text into structured FHIR resources.
 */
export class Lang2FhirService {
  constructor(private readonly client: PhenoMlClient) {}

  /**
   * Convert free-text clinical notes into FHIR resources.
   * Example: "Patient has type 2 diabetes, on metformin 500mg BID"
   * → Condition + MedicationRequest FHIR resources
   */
  async create(request: Lang2FhirCreateRequest): Promise<Bundle> {
    return this.client.request<Bundle>('/lang2fhir/create', request);
  }

  /**
   * Convert natural language query into FHIR search parameters.
   * Example: "Show me all diabetic patients with A1C > 9"
   * → FHIR search URL with appropriate parameters
   */
  async search(request: Lang2FhirSearchRequest): Promise<Lang2FhirSearchResult> {
    return this.client.request<Lang2FhirSearchResult>('/lang2fhir/search', request);
  }
}
