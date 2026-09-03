// Minimal Streamable-HTTP MCP client for the public, no-auth Kiwi.com flight
// search MCP (https://mcp.kiwi.com, tool `search-flight`). Pure fetch() — no
// Node-only APIs, so this also runs unmodified in a Worker if an example host
// needs that.
import type { KiwiFlightSearchRequest, KiwiSearchFlightResult } from './kiwi-types.js';

const DEFAULT_URL = 'https://mcp.kiwi.com';

export interface KiwiClientOptions {
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id?: number;
  result?: T;
  error?: { code: number; message: string };
}

function parseBody<T>(contentType: string, text: string): JsonRpcResponse<T> {
  if (contentType.includes('text/event-stream')) {
    const last = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).pop();
    if (!last) throw new Error('kiwi mcp: empty SSE response');
    return JSON.parse(last) as JsonRpcResponse<T>;
  }
  return JSON.parse(text) as JsonRpcResponse<T>;
}

export async function fetchKiwiFlights(
  request: KiwiFlightSearchRequest,
  opts: KiwiClientOptions = {}
): Promise<KiwiSearchFlightResult> {
  const url = opts.url ?? DEFAULT_URL;
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const baseHeaders = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

  const initRes = await doFetch(url, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'scaffold-travel-thin', version: '0.1.0' } },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const initText = await initRes.text();
  const initParsed = parseBody<unknown>(initRes.headers.get('content-type') ?? '', initText);
  if (initParsed.error) throw new Error(`kiwi mcp initialize error: ${initParsed.error.message}`);
  const sessionId = initRes.headers.get('mcp-session-id');
  const headers = sessionId ? { ...baseHeaders, 'mcp-session-id': sessionId } : baseHeaders;

  const callRes = await doFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'search-flight',
        arguments: {
          flyFrom: request.flyFrom,
          flyTo: request.flyTo,
          departureDate: request.departureDate,
          ...(request.returnDate ? { returnDate: request.returnDate } : {}),
          adults: request.adults ?? 1,
        },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!callRes.ok) throw new Error(`kiwi mcp search-flight → HTTP ${callRes.status}`);
  const text = await callRes.text();
  const parsed = parseBody<{ structuredContent?: KiwiSearchFlightResult }>(callRes.headers.get('content-type') ?? '', text);
  if (parsed.error) throw new Error(`kiwi mcp search-flight error: ${parsed.error.message}`);
  const structured = parsed.result?.structuredContent;
  if (!structured) throw new Error('kiwi mcp search-flight: no structuredContent in result');
  return structured;
}
