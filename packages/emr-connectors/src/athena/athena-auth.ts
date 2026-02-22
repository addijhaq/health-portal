import type { EmrConnectionConfig } from '@health-portal/core';

interface AuthResult {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Authenticate with athenahealth using OAuth 2.0 client credentials.
 */
export async function authenticateAthena(config: EmrConnectionConfig): Promise<AuthResult> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret ?? '',
    scope: config.scopes.join(' '),
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Athena auth failed (${res.status}): ${errorText}`);
  }

  const token = (await res.json()) as { access_token: string; expires_in: number };

  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  };
}
