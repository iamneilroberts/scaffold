import { describe, it, expect, vi } from 'vitest';
import { fetchKiwiFlights } from '../src/kiwi-client.js';

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('fetchKiwiFlights', () => {
  it('performs initialize, notifications/initialized, then tools/call search-flight and returns structuredContent', async () => {
    const structured = { resultsCount: 1, itineraries: [{ id: 'x', price: 100 }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'kiwicom-flight-search' } } }, { 'mcp-session-id': 'sess_1' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { structuredContent: structured } }));

    const result = await fetchKiwiFlights(
      { flyFrom: 'PNS', flyTo: 'YUL', departureDate: '2027-01-01' },
      { fetchImpl: fetchMock as unknown as typeof fetch }
    );

    expect(result).toEqual(structured);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const initializedBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(initializedBody.method).toBe('notifications/initialized');
    expect(initializedBody.id).toBeUndefined();
    const initializedHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(initializedHeaders['MCP-Protocol-Version']).toBe('2025-06-18');
    expect(initializedHeaders['mcp-session-id']).toBe('sess_1');

    const thirdCallBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(thirdCallBody.method).toBe('tools/call');
    expect(thirdCallBody.params.name).toBe('search-flight');
    expect(thirdCallBody.params.arguments.flyFrom).toBe('PNS');
    const thirdCallHeaders = (fetchMock.mock.calls[2][1] as RequestInit).headers as Record<string, string>;
    expect(thirdCallHeaders['MCP-Protocol-Version']).toBe('2025-06-18');
  });

  it('throws when the MCP response carries a jsonrpc error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'boom' } }));

    await expect(
      fetchKiwiFlights({ flyFrom: 'PNS', flyTo: 'YUL', departureDate: '2027-01-01' }, { fetchImpl: fetchMock as unknown as typeof fetch })
    ).rejects.toThrow(/boom/);
  });
});
