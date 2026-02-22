import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import type { EmrConnectionConfig } from '@health-portal/core';

interface AuthResult {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Authenticate with Epic's backend services using JWT assertion flow.
 *
 * Flow:
 * 1. Build a JWT with iss=client_id, sub=client_id, aud=token_endpoint, jti=uuid, exp=5min
 * 2. Sign with RS384 using the private key at EPIC_PRIVATE_KEY_PATH
 * 3. POST to /oauth2/token with grant_type=client_credentials + client_assertion
 */
export async function authenticateEpic(config: EmrConnectionConfig): Promise<AuthResult> {
  const privateKeyPem = fs.readFileSync(config.privateKeyPath!, 'utf-8');

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS384',
    typ: 'JWT',
  };
  const payload = {
    iss: config.clientId,
    sub: config.clientId,
    aud: config.tokenUrl,
    jti: crypto.randomUUID(),
    nbf: now,
    iat: now,
    exp: now + 300, // 5 minutes
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA384');
  sign.update(signingInput);
  const signature = sign.sign(privateKeyPem);
  const encodedSignature = base64UrlEncodeBuffer(signature);

  const clientAssertion = `${signingInput}.${encodedSignature}`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Epic auth failed (${res.status}): ${errorText}`);
  }

  const token = (await res.json()) as { access_token: string; expires_in: number };

  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  };
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlEncodeBuffer(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
