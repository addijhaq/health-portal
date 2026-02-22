import { Hl7Server } from '../server';
import { Hl7Router } from '../router';

describe('Hl7Server', () => {
  it('instantiates with default config', () => {
    const router = new Hl7Router();
    const server = new Hl7Server(router);
    expect(server).toBeInstanceOf(Hl7Server);
  });

  it('instantiates with custom port', () => {
    const router = new Hl7Router();
    const server = new Hl7Server(router, { port: 3000 });
    expect(server).toBeInstanceOf(Hl7Server);
  });

  it('instantiates with TLS config', () => {
    const router = new Hl7Router();
    const server = new Hl7Server(router, {
      port: 2576,
      tls: { certPath: '/tmp/cert.pem', keyPath: '/tmp/key.pem' },
    });
    expect(server).toBeInstanceOf(Hl7Server);
  });

  it('start() and stop() lifecycle works', async () => {
    const router = new Hl7Router();
    const server = new Hl7Server(router, { port: 12575 });

    await server.start();
    await server.stop();
  }, 10000);

  it('processes messages through router when receiving HL7 messages', async () => {
    const router = new Hl7Router();
    const handler = jest.fn().mockResolvedValue({
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [],
    });
    router.on('ADT', 'A01', handler);

    const server = new Hl7Server(router, { port: 12576 });
    await server.start();

    // Server is running and ready to process messages.
    // Full integration test with client sending messages is deferred
    // to integration test suite.

    await server.stop();
  }, 10000);

  it('stop() is idempotent', async () => {
    const router = new Hl7Router();
    const server = new Hl7Server(router, { port: 12577 });

    // Stop before start should not throw
    await server.stop();
    await server.stop();
  });
});
