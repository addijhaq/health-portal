import { PhenoMlClient } from './client';

export interface ConstrueRequest {
  text: string;
  vocabularies: string[];
  maxResults?: number;
}

export interface ConstrueCode {
  code: string;
  display: string;
  system: string;
  confidence: number;
}

export interface ConstrueResult {
  codes: ConstrueCode[];
  sourceText: string;
}

/**
 * Service wrapper for PhenoML Construe API.
 * Extracts and normalizes standardized medical codes from unstructured text.
 * Prevents hallucinated codes via RAG-based lookup.
 */
export class ConstructService {
  constructor(private readonly client: PhenoMlClient) {}

  /**
   * Extract medical codes from clinical text.
   * Supports ICD-10-CM, CPT, SNOMED CT, LOINC, RxNorm, HPO.
   */
  async extract(request: ConstrueRequest): Promise<ConstrueResult[]> {
    return this.client.request<ConstrueResult[]>('/construe/extract', request);
  }
}
