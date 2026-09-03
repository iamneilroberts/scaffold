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
  it('performs initialize then tools/call search-flight and returns structuredContent', async () => {
    const structured = { resultsCount: 1, itineraries: [{ id: 'x', price: 100 }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'kiwicom-flight-search' } } }, { 'mcp-session-id': 'sess_1' }))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { structuredContent: structured } }));

    const result = await fetchKiwiFlights(
      { flyFrom: 'PNS', flyTo: 'YUL', departureDate: '2027-01-01' },
      { fetchImpl: fetchMock as unknown as typeof fetch }
    );

    expect(result).toEqual(structured);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.method).toBe('tools/call');
    expect(secondCallBody.params.name).toBe('search-flight');
    expect(secondCallBody.params.arguments.flyFrom).toBe('PNS');
  });

  it('throws when the MCP response carries a jsonrpc error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'boom' } }));

    await expect(
      fetchKiwiFlights({ flyFrom: 'PNS', flyTo: 'YUL', departureDate: '2027-01-01' }, { fetchImpl: fetchMock as unknown as typeof fetch })
    ).rejects.toThrow(/boom/);
  });
});
