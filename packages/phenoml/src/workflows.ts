import { PhenoMlClient } from './client';

export interface WorkflowStep {
  name: string;
  type: 'lang2fhir' | 'construe' | 'agent' | 'fhir-query' | 'conditional';
  config: Record<string, unknown>;
  onError?: 'stop' | 'skip' | 'retry';
}

export interface WorkflowTrigger {
  type: 'subscription' | 'cron' | 'manual';
  resourceType?: string;
  criteria?: string;
  schedule?: string;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
}

export interface WorkflowResult {
  workflowId: string;
  name: string;
  status: 'active' | 'draft' | 'disabled';
  createdAt: string;
}

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'completed' | 'failed' | 'running';
  startedAt: string;
  completedAt?: string;
  stepResults: Array<{
    stepName: string;
    status: 'completed' | 'failed' | 'skipped';
    output?: unknown;
    error?: string;
  }>;
}

export interface WorkflowSummary {
  workflowId: string;
  name: string;
  description: string;
  status: 'active' | 'draft' | 'disabled';
  triggerCount: number;
  lastExecutedAt?: string;
}

/**
 * Service wrapper for PhenoML Workflows API.
 * Manages declarative clinical workflows that chain Lang2FHIR,
 * Construe, and Agent steps into automated pipelines.
 */
export class WorkflowService {
  constructor(private readonly client: PhenoMlClient) {}

  /**
   * Create a new declarative workflow from a definition.
   */
  async create(definition: WorkflowDefinition): Promise<WorkflowResult> {
    return this.client.request<WorkflowResult>('/workflows', definition);
  }

  /**
   * Execute a workflow with the given input data.
   */
  async execute(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<WorkflowExecutionResult> {
    return this.client.request<WorkflowExecutionResult>(
      `/workflows/${workflowId}/execute`,
      input,
    );
  }

  /**
   * List all available workflows.
   */
  async list(): Promise<WorkflowSummary[]> {
    return this.client.get<WorkflowSummary[]>('/workflows');
  }

  /**
   * Get full workflow definition by ID.
   */
  async get(workflowId: string): Promise<WorkflowDefinition> {
    return this.client.get<WorkflowDefinition>(`/workflows/${workflowId}`);
  }
}
