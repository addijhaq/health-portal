import type { Bundle, Patient, Resource } from '@medplum/fhirtypes';
import type { EmrConnectionConfig } from '@health-portal/core';
import { BaseEmrConnector } from '../base-connector';
import { authenticateEpic } from './epic-auth';

/**
 * Epic FHIR R4 connector.
 *
 * Auth: JWT-based client credentials using a private key (Epic backend services).
 * Developer portal: https://fhir.epic.com/
 * Sandbox: https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
 */
export class EpicConnector extends BaseEmrConnector {
  constructor(config: Omit<EmrConnectionConfig, 'vendor'>) {
    super({ ...config, vendor: 'epic' });
  }

  async authenticate(): Promise<void> {
    const result = await authenticateEpic(this.config);
    this.accessToken = result.accessToken;
    this.tokenExpiry = result.expiresAt;
  }

  async searchPatient(params: Record<string, string>): Promise<Bundle<Patient>> {
    const query = new URLSearchParams(params).toString();
    return this.fhirRequest<Bundle<Patient>>('GET', `Patient?${query}`);
  }

  async read<T extends Resource>(resourceType: string, id: string): Promise<T> {
    return this.fhirRequest<T>('GET', `${resourceType}/${id}`);
  }

  async search<T extends Resource>(resourceType: string, params: Record<string, string>): Promise<Bundle<T>> {
    const query = new URLSearchParams(params).toString();
    return this.fhirRequest<Bundle<T>>('GET', `${resourceType}?${query}`);
  }

  async write<T extends Resource>(resource: T): Promise<T> {
    if (resource.id) {
      return this.fhirRequest<T>('PUT', `${resource.resourceType}/${resource.id}`, resource);
    }
    return this.fhirRequest<T>('POST', resource.resourceType!, resource);
  }

  async pullChanges(since: string, resourceTypes: string[]): Promise<Bundle> {
    // Pull resources updated since timestamp using _lastUpdated parameter
    const bundles = await Promise.all(
      resourceTypes.map((rt) =>
        this.search(rt, { _lastUpdated: `ge${since}`, _count: '100' })
      )
    );

    return {
      resourceType: 'Bundle',
      type: 'collection',
      entry: bundles.flatMap((b) => b.entry ?? []),
    };
  }

  async bulkExport(resourceTypes: string[]): Promise<Bundle> {
    // Epic supports FHIR Bulk Data Access ($export)
    // POST to /$export with _type parameter
    throw new Error('Epic bulk export not yet implemented');
  }
}
