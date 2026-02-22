import { Client, Message, type InboundResponse } from 'node-hl7-client';
import { HL7_DEFAULTS } from '@health-portal/core';

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
  private readonly config: Required<Hl7ClientConfig>;

  constructor(config: Hl7ClientConfig) {
    this.config = {
      tls: false,
      retryAttempts: 3,
      retryDelayMs: 1000,
      ...config,
    };
  }

  /**
   * Send an HL7 v2 message string to the configured destination.
   * Returns the ACK response from the remote system.
   * Retries with exponential backoff on failure.
   */
  async send(message: string): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      try {
        return await this.sendOnce(message);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `HL7 send attempt ${attempt + 1}/${this.config.retryAttempts} failed: ${lastError.message}`
        );
      }
    }

    throw new Error(
      `Failed to send HL7 message after ${this.config.retryAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Single send attempt using node-hl7-client.
   */
  private async sendOnce(rawMessage: string): Promise<string> {
    const client = new Client({
      host: this.config.host,
      ...(this.config.tls ? { tls: true } : {}),
    });

    let ackMessage: string | undefined;

    const connection = client.createConnection(
      {
        port: this.config.port,
        waitAck: true,
      },
      async (res: InboundResponse) => {
        ackMessage = res.getMessage().toString();
      }
    );

    try {
      await connection.sendMessage(new Message({ text: rawMessage }));

      // Wait briefly for the ACK callback to fire
      await sleep(100);

      if (!ackMessage) {
        throw new Error('No ACK received from remote system');
      }

      // Parse ACK code from MSA segment
      const ackCode = parseAckCode(ackMessage);
      if (ackCode !== HL7_DEFAULTS.ACK_CODE_ACCEPT) {
        throw new Error(`Remote system rejected message with ACK code: ${ackCode}`);
      }

      return ackMessage;
    } finally {
      await connection.close();
      client.closeAll();
    }
  }
}

/**
 * Extract the acknowledgment code from an ACK message's MSA segment.
 * MSA.1 contains the acknowledgment code (AA, AE, AR).
 */
function parseAckCode(ackMessage: string): string {
  const msg = new Message({ text: ackMessage });
  return msg.get('MSA.1').toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
