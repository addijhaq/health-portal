/**
 * HL7 v2 TCP client for sending outbound messages to downstream systems.
 * Uses node-hl7-client under the hood for MLLP protocol handling.
 */
export interface Hl7ClientConfig {
  host: string;
  port: number;
  tls?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export class Hl7Client {
  private readonly config: Hl7ClientConfig;

  constructor(config: Hl7ClientConfig) {
    this.config = {
      retryAttempts: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  /**
   * Send an HL7 v2 message to the configured destination.
   * Returns the ACK response from the remote system.
   */
  async send(message: string): Promise<string> {
    // Implementation will use node-hl7-client to:
    // 1. Connect to remote system via MLLP
    // 2. Send HL7 v2 message
    // 3. Wait for ACK/NAK response
    // 4. Retry on failure with exponential backoff
    throw new Error('Not yet implemented');
  }
}
