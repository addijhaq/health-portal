import type { Hl7MessageMeta } from '@health-portal/core';
import type { Bundle } from '@medplum/fhirtypes';

/**
 * Handler function for a specific HL7 v2 message type.
 * Receives raw message content and metadata, returns FHIR Bundle.
 */
export type Hl7MessageHandler = (
  rawMessage: string,
  meta: Hl7MessageMeta
) => Promise<Bundle>;

/**
 * Routes inbound HL7 v2 messages to the appropriate handler
 * based on message type and trigger event (e.g., ADT^A01, ORU^R01).
 */
export class Hl7Router {
  private handlers = new Map<string, Hl7MessageHandler>();

  /**
   * Register a handler for a specific message type + trigger event.
   * @param messageType e.g., "ADT"
   * @param triggerEvent e.g., "A01"
   * @param handler Function that transforms the HL7 message to FHIR
   */
  on(messageType: string, triggerEvent: string, handler: Hl7MessageHandler): void {
    const key = `${messageType}^${triggerEvent}`;
    this.handlers.set(key, handler);
  }

  /**
   * Route an inbound message to its registered handler.
   */
  async route(rawMessage: string, meta: Hl7MessageMeta): Promise<Bundle | null> {
    const key = `${meta.messageType}^${meta.triggerEvent}`;
    const handler = this.handlers.get(key);

    if (!handler) {
      console.warn(`No handler registered for ${key}`);
      return null;
    }

    return handler(rawMessage, meta);
  }
}
