import { HL7_DEFAULTS } from '@health-portal/core';
import { Hl7Router } from './router';

export interface Hl7ServerConfig {
  port?: number;
  tls?: {
    certPath: string;
    keyPath: string;
  };
}

/**
 * HL7 v2 TCP listener that receives inbound messages from
 * hospital systems, labs, radiology, and other clinical systems.
 *
 * Uses node-hl7-server under the hood for MLLP protocol handling.
 */
export class Hl7Server {
  private readonly port: number;
  private readonly router: Hl7Router;

  constructor(router: Hl7Router, config: Hl7ServerConfig = {}) {
    this.port = config.port ?? HL7_DEFAULTS.LISTEN_PORT;
    this.router = router;
  }

  /**
   * Start listening for inbound HL7 v2 messages.
   * Each message is parsed, routed to the appropriate handler,
   * transformed to FHIR, and written to Medplum.
   */
  async start(): Promise<void> {
    // Implementation will use node-hl7-server to:
    // 1. Open TCP/TLS listener on configured port
    // 2. Parse inbound MLLP-framed HL7 v2 messages
    // 3. Route to handler via this.router
    // 4. Return ACK/NAK response
    console.log(`HL7 v2 server starting on port ${this.port}`);
  }

  async stop(): Promise<void> {
    console.log('HL7 v2 server stopping');
  }
}
