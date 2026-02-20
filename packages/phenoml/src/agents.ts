import type { Bundle } from '@medplum/fhirtypes';
import { PhenoMlClient } from './client';

export interface AgentRunRequest {
  task: string;
  patientId?: string;
  fhirServer?: string;
  tools?: string[];
}

export interface AgentRunResult {
  response: string;
  fhirResources?: Bundle;
  codesExtracted?: Array<{ code: string; display: string; system: string }>;
}

/**
 * Service wrapper for PhenoML Agent API.
 * Orchestrates Lang2FHIR + Construe for complex clinical tasks.
 */
export class AgentService {
  constructor(private readonly client: PhenoMlClient) {}

  /**
   * Run an AI agent for a complex clinical task.
   * The agent routes through specialized models (Lang2FHIR, Construe, reasoning)
   * to produce structured, FHIR-compliant output.
   */
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    return this.client.request<AgentRunResult>('/agents/run', request);
  }
}
