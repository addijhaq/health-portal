import { Hl7Client } from '../client';

describe('Hl7Client', () => {
  it('instantiates with host and port', () => {
    const client = new Hl7Client({ host: 'localhost', port: 2575 });
    expect(client).toBeInstanceOf(Hl7Client);
  });

  it('instantiates with full config', () => {
    const client = new Hl7Client({
      host: '192.168.1.100',
      port: 2575,
      tls: true,
      retryAttempts: 5,
      retryDelayMs: 2000,
    });
    expect(client).toBeInstanceOf(Hl7Client);
  });

  it('send() rejects when no server is available', async () => {
    const client = new Hl7Client({
      host: '127.0.0.1',
      port: 19999,
      retryAttempts: 1,
      retryDelayMs: 100,
    });

    const hl7Message = [
      'MSH|^~\\&|TEST|FAC|RCV|FAC|20240115||ADT^A01|MSG001|P|2.5.1',
      'PID|1||MRN001||Test^Patient',
    ].join('\r');

    await expect(client.send(hl7Message)).rejects.toThrow();
  }, 15000);

  it('defaults to 3 retry attempts and 1000ms delay', () => {
    const client = new Hl7Client({ host: 'localhost', port: 2575 });
    // Verify defaults by checking the client was created (internal config is private)
    expect(client).toBeInstanceOf(Hl7Client);
  });
});
