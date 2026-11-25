import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSseParser, speakableSegments, streamAi } from './ai';
import { ApiError } from './api';

const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function sseResponse(chunks: string[], status = 200) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((ch) => c.enqueue(enc.encode(ch)));
      c.close();
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('createSseParser', () => {
  it('handles events split across chunks and CRLF', () => {
    const p = createSseParser();
    const all = ev('delta', { t: 'Bon' }) + ev('delta', { t: 'jour é' }).replace(/\n/g, '\r\n') + ev('done', {});
    const out = [p(all.slice(0, 7)), p(all.slice(7, 40)), p(all.slice(40))].flat();
    expect(out).toEqual([
      { event: 'delta', data: { t: 'Bon' } },
      { event: 'delta', data: { t: 'jour é' } },
      { event: 'done', data: {} },
    ]);
  });

  it('keeps an incomplete event for the next chunk', () => {
    const p = createSseParser();
    expect(p('event: delta\ndata: {"t":"x"}\n')).toEqual([]);
    expect(p('\n')).toEqual([{ event: 'delta', data: { t: 'x' } }]);
  });
});

describe('streamAi', () => {
  it('dispatches deltas and tools, resolves on done', async () => {
    const chunks = [ev('tool', { name: 'get_summary', input: { company_name: 'X' } }), ev('delta', { t: 'Hé' }), ev('delta', { t: 'llo' }), ev('done', { cached: true })];
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([chunks.join('').slice(0, 30), chunks.join('').slice(30)])));
    let text = '';
    const tools: string[] = [];
    const r = await streamAi('/ai/x', {}, { onDelta: (t) => (text += t), onTool: (t) => tools.push(t.name) });
    expect(text).toBe('Héllo');
    expect(tools).toEqual(['get_summary']);
    expect(r).toEqual({ cached: true });
  });

  it('throws the server error event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([ev('delta', { t: 'a' }), ev('error', { detail: 'Quota' })])));
    await expect(streamAi('/ai/x', {}, { onDelta: () => undefined })).rejects.toThrow('Quota');
  });

  it('throws ApiError with the JSON detail on HTTP errors', async () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Limite atteinte' }), { status: 429 })));
    const p = streamAi('/ai/x', {}, { onDelta: () => undefined });
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(streamAi('/ai/x', {}, { onDelta: () => undefined })).rejects.toThrow('Limite atteinte');
  });

  it('reports a stream cut before done', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([ev('delta', { t: 'a' })])));
    await expect(streamAi('/ai/x', {}, { onDelta: () => undefined })).rejects.toThrow('interrompue');
  });
});

describe('speakableSegments', () => {
  it('strips markdown for read-aloud', () => {
    expect(speakableSegments('### Titre\n\n- **Fort** en _équipe_\nTexte.')).toEqual(['Titre', 'Fort en équipe', 'Texte.']);
  });
});
