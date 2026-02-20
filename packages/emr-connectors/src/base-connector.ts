import type { Bundle, Patient, Resource } from '@medplum/fhirtypes';
import type { EmrConnectionConfig, EmrVendor, SyncResult } from '@health-portal/core';

/**
 * Abstract base class for EMR FHIR connectors.
 * Each vendor connector (Epic, Cerner, Athena) extends this
 * and implements vendor-specific auth and mapping logic.
 */
export abstract class BaseEmrConnector {
  protected readonly config: EmrConnectionConfig;
  protected accessToken: string | null = null;
  protected tokenExpiry: Date | null = null;

  constructor(config: EmrConnectionConfig) {
    this.config = config;
  }

  get vendor(): EmrVendor {
    return this.config.vendor;
  }

  /**
   * Authenticate with the external EMR's OAuth 2.0 token endpoint.
   * Each vendor has its own auth flow (client credentials, JWT assertion, etc.).
   */
  abstract authenticate(): Promise<void>;

  /**
   * Search for a patient by match criteria in the external EMR.
   */
  abstract searchPatient(params: Record<string, string>): Promise<Bundle<Patient>>;

  /**
   * Read a specific resource by type and ID from the external EMR.
   */
  abstract read<T extends Resource>(resourceType: string, id: string): Promise<T>;

  /**
   * Search for resources in the external EMR.
   */
  abstract search<T extends Resource>(resourceType: string, params: Record<string, string>): Promise<Bundle<T>>;

  /**
   * Write a resource to the external EMR (create or update).
   */
  abstract write<T extends Resource>(resource: T): Promise<T>;

  /**
   * Pull all changes since the given timestamp (for incremental sync).
   */
  abstract pullChanges(since: string, resourceTypes: string[]): Promise<Bundle>;

  /**
   * Perform a bulk data export from the external EMR.
   */
  abstract bulkExport(resourceTypes: string[]): Promise<Bundle>;

  /**
   * Make an authenticated FHIR API request to the external EMR.
   */
  protected async fhirRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.accessToken || this.isTokenExpired()) {
      await this.authenticate();
    }

    const url = `${this.config.fhirBaseUrl}/${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`${this.config.vendor} FHIR API error ${res.status}: ${errorBody}`);
    }

    return res.json() as Promise<T>;
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    return new Date() >= this.tokenExpiry;
  }
}
