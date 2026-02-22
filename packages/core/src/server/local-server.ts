/**
 * Local HTTP server wrapper for Node.js
 *
 * Bridges Node.js `http.createServer` to `ScaffoldServer.fetch(request, env, ctx)`.
 * Zero external dependencies — uses only `node:http`.
 *
 * @internal
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScaffoldServer } from './scaffold-server.js';
import type { ExecutionContext } from '../types/public-api.js';

export interface LocalServerOptions {
  port?: number;
  host?: string;
}

export interface LocalServerHandle {
  port: number;
  close: () => void;
}

/**
 * Start a local HTTP server that forwards requests to a ScaffoldServer.
 *
 * @example
 * ```typescript
 * const handle = startLocalServer(server, env, { port: 3001 });
 * console.log(`Listening on http://localhost:${handle.port}`);
 * ```
 */
export function startLocalServer(
  server: ScaffoldServer,
  env: Record<string, unknown>,
  options?: LocalServerOptions
): LocalServerHandle {
  const port = options?.port ?? 3001;
  const host = options?.host ?? '127.0.0.1';

  const ctx: ExecutionContext = {
    waitUntil(_promise: Promise<unknown>) { /* no-op in local mode */ },
    passThroughOnException() { /* no-op in local mode */ },
  };

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const request = nodeToWebRequest(req, port);
      const response = await server.fetch(request, env, ctx);
      await webToNodeResponse(response, res);
    } catch (err) {
      console.error('[scaffold] Request error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  httpServer.listen(port, host, () => {
    console.log(`[scaffold] Local server running at http://localhost:${port}`);
    console.log(`[scaffold] Admin dashboard: http://localhost:${port}/admin`);
    console.log(`[scaffold] MCP endpoint:    http://localhost:${port}/`);
  });

  return {
    port,
    close: () => httpServer.close(),
  };
}

/**
 * Convert Node.js IncomingMessage to Web API Request.
 */
function nodeToWebRequest(req: IncomingMessage, port: number): Request {
  const url = `http://localhost:${port}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val) {
      headers.set(key, Array.isArray(val) ? val.join(', ') : val);
    }
  }

  const method = (req.method ?? 'GET').toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  return new Request(url, {
    method,
    headers,
    body: hasBody ? readableStreamFromNode(req) : undefined,
    // @ts-expect-error — Node 18+ supports duplex on Request but the types lag behind
    duplex: hasBody ? 'half' : undefined,
  });
}

/**
 * Convert a Node.js IncomingMessage to a ReadableStream for use as Request body.
 */
function readableStreamFromNode(req: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      req.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      req.on('end', () => controller.close());
      req.on('error', (err) => controller.error(err));
    },
  });
}

/**
 * Write a Web API Response to a Node.js ServerResponse.
 */
async function webToNodeResponse(response: Response, res: ServerResponse): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

/**
 * Load environment variables from `.dev.vars` then `.env` files.
 * Later files do NOT override earlier ones (`.dev.vars` takes priority).
 * Returns a flat record of key-value pairs.
 */
export function loadEnvFile(...paths: string[]): Record<string, string> {
  const defaultPaths = paths.length > 0 ? paths : ['.dev.vars', '.env'];
  const env: Record<string, string> = {};

  for (const p of defaultPaths) {
    try {
      const content = readFileSync(resolve(p), 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // First file wins — don't override
        if (!(key in env)) {
          env[key] = value;
        }
      }
    } catch {
      // File doesn't exist — skip
    }
  }

  return env;
}
