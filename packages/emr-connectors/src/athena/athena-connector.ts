import type { Bundle, Patient, Resource } from '@medplum/fhirtypes';
import type { EmrConnectionConfig } from '@health-portal/core';
import { BaseEmrConnector } from '../base-connector';

/**
 * athenahealth FHIR R4 connector.
 *
 * Auth: OAuth 2.0 client credentials via athenahealth API program.
 * Note: Athena upgraded from DSTU2 to R4 — some resource coverage
 * may be narrower than Epic/Cerner. Supplemental proprietary API
 * calls may be needed for full data access.
 */
export class AthenaConnector extends BaseEmrConnector {
  constructor(config: Omit<EmrConnectionConfig, 'vendor'>) {
    super({ ...config, vendor: 'athena' });
  }

  async authenticate(): Promise<void> {
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
      throw new Error(`Athena auth failed: ${res.status}`);
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
    throw new Error('Athena bulk export not yet implemented');
  }
}
