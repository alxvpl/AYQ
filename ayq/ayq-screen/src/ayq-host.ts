// The transport, and only the transport.
//
// One channel, `POST /ask`, carrying an AyqRequest and returning an AyqResponse.
// That shape is deliberate: the shipped Actual desktop app talks to its forked
// engine process over a single generic `message` channel plus a handful of
// named host channels (§12.2 of the base evaluation). When AYQ moves into
// Electron, this file is replaced by an IPC bridge and nothing else changes.
//
// Binds to 127.0.0.1 only. The ledger is personal and does not leave the
// machine.

import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { AyqEngine, AyqRequest } from './ayq-contract.ts';

const SCREEN = fileURLToPath(new URL('./ayq-screen.html', import.meta.url));

export type AyqHost = {
  url: string;
  port: number;
  close(): Promise<void>;
};

async function readBody(
  request: import('node:http').IncomingMessage,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function ayqServeScreen(
  engine: AyqEngine,
  port = 0,
): Promise<AyqHost> {
  const server: Server = createServer((request, response) => {
    void (async () => {
      try {
        if (request.method === 'GET' && (request.url === '/' || request.url === '/index.html')) {
          const html = await readFile(SCREEN, 'utf8');
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            // The page loads nothing from anywhere else.
            'content-security-policy':
              "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
          });
          response.end(html);
          return;
        }

        if (request.method === 'POST' && request.url === '/ask') {
          const parsed = JSON.parse(await readBody(request)) as AyqRequest;
          const answer = await engine.ask(parsed);
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify(answer));
          return;
        }

        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ kind: 'error', message: 'not found' }));
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ kind: 'error', message: String(error) }),
        );
      }
    })();
  });

  await new Promise<void>(resolve => {
    server.listen(port, '127.0.0.1', resolve);
  });

  const address = server.address();
  const bound = typeof address === 'object' && address !== null ? address.port : port;

  return {
    port: bound,
    url: `http://127.0.0.1:${bound}/`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    },
  };
}
