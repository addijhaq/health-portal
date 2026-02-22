import { HL7_DEFAULTS } from '@health-portal/core';
import type { Hl7MessageMeta } from '@health-portal/core';
import { Server, type ListenerOptions, type Inbound } from 'node-hl7-server';
import { Message } from 'node-hl7-client';
import { Hl7Router } from './router';
import * as fs from 'fs';

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
  private readonly tlsConfig?: Hl7ServerConfig['tls'];
  private server: Server | undefined;
  private inbound: Inbound | undefined;

  constructor(router: Hl7Router, config: Hl7ServerConfig = {}) {
    this.port = config.port ?? HL7_DEFAULTS.LISTEN_PORT;
    this.router = router;
    this.tlsConfig = config.tls;
  }

  /**
   * Start listening for inbound HL7 v2 messages.
   * Each message is parsed, routed to the appropriate handler,
   * transformed to FHIR, and written to Medplum.
   */
  async start(): Promise<void> {
    const serverOpts = this.tlsConfig
      ? {
          tls: {
            key: fs.readFileSync(this.tlsConfig.keyPath),
            cert: fs.readFileSync(this.tlsConfig.certPath),
            rejectUnauthorized: false,
          },
        }
      : undefined;

    this.server = new Server(serverOpts);

    const listenerOpts: ListenerOptions = {
      port: this.port,
      encoding: HL7_DEFAULTS.ENCODING as BufferEncoding,
    };

    this.inbound = this.server.createInbound(listenerOpts, async (req, res) => {
      try {
        const message: Message = req.getMessage();
        const rawMessage = message.toString();
        const meta = extractMeta(message);

        const bundle = await this.router.route(rawMessage, meta);

        if (bundle) {
          await res.sendResponse('AA');
        } else {
          console.warn(`No handler for ${meta.messageType}^${meta.triggerEvent}`);
          await res.sendResponse('AR');
        }
      } catch (err) {
        console.error('Error processing inbound HL7 message:', err);
        await res.sendResponse('AE');
      }
    });

    return new Promise<void>((resolve) => {
      this.inbound!.on('listen', () => {
        console.log(`HL7 v2 server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.inbound) {
      await this.inbound.close();
      this.inbound = undefined;
    }
    this.server = undefined;
    console.log('HL7 v2 server stopped');
  }
}

/**
 * Extract Hl7MessageMeta from a parsed Message object by reading MSH fields.
 */
function extractMeta(message: Message): Hl7MessageMeta {
  return {
    messageType: message.get('MSH.9.1').toString(),
    triggerEvent: message.get('MSH.9.2').toString(),
    messageControlId: message.get('MSH.10').toString(),
    sendingFacility: message.get('MSH.4').toString(),
    receivingFacility: message.get('MSH.6').toString(),
    timestamp: message.get('MSH.7').toString(),
  };
}
