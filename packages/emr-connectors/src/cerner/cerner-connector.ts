import type { Bundle, Patient, Resource } from '@medplum/fhirtypes';
import type { EmrConnectionConfig } from '@health-portal/core';
import { BaseEmrConnector } from '../base-connector';

/**
 * Cerner / Oracle Health FHIR R4 connector.
 *
 * Auth: OAuth 2.0 client credentials via Ignite APIs.
 * DSTU2 fully deprecated as of Dec 2025 — R4 only.
 * Developer portal: Oracle Health Developer Program
 */
export class CernerConnector extends BaseEmrConnector {
  constructor(config: Omit<EmrConnectionConfig, 'vendor'>) {
    super({ ...config, vendor: 'cerner' });
  }

  async authenticate(): Promise<void> {
    // Cerner uses standard OAuth 2.0 client credentials:
    // 1. Discover token endpoint via .well-known/smart-configuration
    // 2. POST to token endpoint with client_id + client_secret
    // 3. Store access_token and compute expiry
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret ?? '',
      scope: this.config.scopes.join(' '),
    });

    const res = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Cerner auth failed: ${res.status}`);
    }

    const token = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = token.access_token;
    this.tokenExpiry = new Date(Date.now() + token.expires_in * 1000);
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
    // Cerner supports Group and Patient-level $export
    throw new Error('Cerner bulk export not yet implemented');
  }
}
