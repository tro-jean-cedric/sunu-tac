/** Claude AI client helpers: SSE streaming over fetch (POST), feature flag, insight types. */
import { useEffect, useState } from 'react';

import { ApiError } from './api';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Incremental Server-Sent Events parser. Feed it decoded text chunks; it returns the complete events
 * and keeps any partial event for the next call.
 */
export function createSseParser() {
  let buf = '';
  return (chunk: string): SseEvent[] => {
    buf += chunk.replace(/\r\n/g, '\n');
    const out: SseEvent[] = [];
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (!data.length) continue;
      const txt = data.join('\n');
      let parsed: unknown = txt;
      try {
        parsed = JSON.parse(txt);
      } catch {
        /* plain text data */
      }
      out.push({ event, data: parsed });
    }
    return out;
  };
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onTool?: (tool: { name: string; input: Record<string, unknown> }) => void;
  signal?: AbortSignal;
}

/** POST to an AI endpoint and dispatch its SSE events. Resolves with `{cached}` on `done`; throws ApiError. */
export async function streamAi(path: string, body: unknown, h: StreamHandlers): Promise<{ cached: boolean }> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: h.signal,
  });
  if (!res.ok) {
    let msg = res.statusText || 'Erreur réseau';
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: { msg: string }) => d.msg).join(', ');
    } catch {
      /* not json */
    }
    if (res.status === 401) window.dispatchEvent(new CustomEvent('tac:unauthorized'));
    throw new ApiError(res.status, msg);
  }
  if (!res.body) throw new ApiError(0, 'Flux indisponible');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser();
  for (;;) {
    const { value, done } = await reader.read();
    const events = parse(done ? decoder.decode() + '\n\n' : decoder.decode(value, { stream: true }));
    for (const e of events) {
      const d = (e.data ?? {}) as Record<string, unknown>;
      if (e.event === 'delta') h.onDelta(String(d.t ?? ''));
      else if (e.event === 'tool') h.onTool?.({ name: String(d.name), input: (d.input ?? {}) as Record<string, unknown> });
      else if (e.event === 'error') throw new ApiError(502, String(d.detail ?? 'Erreur IA'));
      else if (e.event === 'done') return { cached: !!d.cached };
    }
    if (done) throw new ApiError(0, 'La réponse a été interrompue.');
  }
}

// ------------------------------------------------------------------------------------ feature flag

let configPromise: Promise<{ ai_enabled?: boolean }> | null = null;

export function loadConfig() {
  configPromise ??= fetch(`${BASE}/meta/config`, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return configPromise;
}

/** true once the server confirms a Claude key is configured. */
export function useAiEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => alive && setOn(!!c.ai_enabled));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

// ------------------------------------------------------------------------------------- HR insights

export interface InsightPoint {
  title: string;
  detail: string;
}

export interface Insights {
  headline: string;
  summary: string;
  strengths: InsightPoint[];
  risks: InsightPoint[];
  gaps: InsightPoint[];
  actions: (InsightPoint & { owner: string; horizon: string })[];
  caveats: string[];
  cached: boolean;
  generated_at: string | null;
}

export async function fetchInsights(filters: Record<string, unknown>, refresh = false): Promise<Insights> {
  const body: Record<string, unknown> = { refresh };
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) body[k] = v;
  });
  const res = await fetch(`${BASE}/ai/hr/insights`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('tac:unauthorized'));
    throw new ApiError(res.status, typeof j.detail === 'string' ? j.detail : res.statusText);
  }
  return j as Insights;
}

/** Markdown → plain sentences for read-aloud. */
export function speakableSegments(md: string): string[] {
  return md
    .split(/\n+/)
    .map((l) =>
      l
        .replace(/^#{1,6}\s*/, '')
        .replace(/^\s*[-*]\s+/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .trim(),
    )
    .filter(Boolean);
}
