import type { PhenoMlConfig } from '@health-portal/core';

/**
 * HTTP client for PhenoML API (https://developer.pheno.ml).
 * Wraps Lang2FHIR, Construe, Agent, and Workflows endpoints.
 */
export class PhenoMlClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: PhenoMlConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  async request<T>(path: string, body: object): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`PhenoML API error ${res.status}: ${errorBody}`);
    }

    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`PhenoML API error ${res.status}: ${errorBody}`);
    }

    return res.json() as Promise<T>;
  }
}
