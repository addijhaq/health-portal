import type { Bundle, Patient, Resource } from '@medplum/fhirtypes';
import type { EmrConnectionConfig } from '@health-portal/core';
import { BaseEmrConnector } from '../base-connector';

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
    // Epic backend services use JWT assertion:
    // 1. Build JWT with client_id as iss, token endpoint as aud
    // 2. Sign with RS384 using private key
    // 3. POST to token endpoint with grant_type=client_credentials
    // 4. Store access_token and compute expiry
    throw new Error('Epic auth not yet implemented');
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
