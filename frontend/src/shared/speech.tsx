/**
 * Read-aloud with two engines:
 *  - "natural": a cloud neural French voice served by the backend (/api/tts — Google or Azure, MP3,
 *    cached server-side);
 *  - "browser": the Web Speech API (speechSynthesis), restricted to good French voices.
 * The user can pick any voice of either engine (voice picker); "automatic" uses the best natural voice
 * when the server has one, else the best browser voice. Any natural-voice failure falls back to the browser.
 * One provider holds the user's preferences (auto-read, rate, voice) and which word is being spoken.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { loadConfig } from './ai';

export const RATES = [0.8, 1, 1.2] as const;
export type Rate = (typeof RATES)[number];
export type Engine = 'natural' | 'browser';

interface Word {
  seg: number;
  start: number;
  end: number;
}

/** A French voice offered by the server's TTS provider. */
export interface ServerVoice {
  id: string;
  name: string;
  gender: 'F' | 'M' | null;
  locale: string;
  region: string;
  quality: string;
  rank: number;
}

/** The user's voice choice; null = automatic. */
export type VoiceChoice = { engine: 'natural'; id: string } | { engine: 'browser'; name: string } | null;

export const SAMPLE_TEXT = "Bonjour ! Je suis la voix qui vous lira les questions du test d'alignement culturel.";

interface SpeechCtx {
  supported: boolean;
  /** engine that will actually be used with the current choice */
  engine: Engine;
  /** the server offers natural voices */
  naturalAvailable: boolean;
  /** natural voices (null until loaded / when the server has none) */
  serverVoices: ServerVoice[] | null;
  serverDefault: string | null;
  /** French browser voices, best first */
  browserVoices: SpeechSynthesisVoice[];
  voice: VoiceChoice;
  setVoice: (v: VoiceChoice) => void;
  /** load the server voice list (lazy: it needs a logged-in user) */
  loadVoices: () => void;
  /** play the sample sentence with a voice (id "voice-preview") */
  preview: (v: VoiceChoice) => void;
  /** id of the block being read (null when silent) */
  speakingId: string | null;
  /** true while the first audio clip is being fetched */
  preparing: boolean;
  /** word currently spoken in `speakingId` (null between words / when unknown) */
  word: Word | null;
  /** index of the segment currently spoken */
  seg: number;
  auto: boolean;
  rate: Rate;
  setAuto: (v: boolean) => void;
  setRate: (r: Rate) => void;
  speak: (id: string, segments: string[]) => void;
  toggle: (id: string, segments: string[]) => void;
  stop: () => void;
}

const Ctx = createContext<SpeechCtx | null>(null);

const PREFS_KEY = 'tac-sunu-speech-v1';
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

interface Prefs {
  auto: boolean;
  rate: Rate;
  voice: VoiceChoice;
}

function validChoice(v: unknown): VoiceChoice {
  const c = v as { engine?: string; id?: unknown; name?: unknown } | null;
  if (c?.engine === 'natural' && typeof c.id === 'string') return { engine: 'natural', id: c.id };
  if (c?.engine === 'browser' && typeof c.name === 'string') return { engine: 'browser', name: c.name };
  return null;
}

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return { auto: !!p.auto, rate: RATES.includes(p.rate) ? p.rate : 1, voice: validChoice(p.voice) };
  } catch {
    return { auto: false, rate: 1, voice: null };
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

// ------------------------------------------------------------------------------- browser voices

// Apple "Eloquence" novelty voices: French, but robotic — never pick them.
const NOVELTY = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|jacques)\b/i;

/** French browser voices, best first: Edge natural voices, Google, Siri/premium/enhanced, then classic. */
export function frenchVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const fr = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('fr') && !NOVELTY.test(v.name));
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name;
    const lang = v.lang.toLowerCase().replace('_', '-');
    return (
      (/natural|neural|online/i.test(n) ? 10 : 0) +
      (/google/i.test(n) ? 6 : 0) +
      (/premium|enhanced|améliorée|siri/i.test(n) ? 5 : 0) +
      (/thomas|audrey|aurélie|aurelie|marie|denise|henri/i.test(n) ? 2 : 0) +
      (lang === 'fr-fr' ? 4 : lang === 'fr-ca' ? 1 : 2)
    );
  };
  return [...fr].sort((a, b) => score(b) - score(a));
}

/** Best French browser voice (null when the device has none). */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return frenchVoices(voices)[0] ?? null;
}

// --------------------------------------------------------------------------- natural voice clips

const clipCache = new Map<string, Promise<string>>();
const CLIP_CACHE_MAX = 80;

/** Fetch (once) the MP3 for a text in a voice (server default when omitted) and return an object URL. */
export function fetchClip(text: string, voice?: string): Promise<string> {
  const key = `${voice ?? ''}\n${text.trim()}`;
  let p = clipCache.get(key);
  if (!p) {
    p = fetch(`${BASE}/tts`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim().slice(0, 1500), ...(voice ? { voice } : {}) }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`tts ${r.status}`);
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => clipCache.delete(key));
    clipCache.set(key, p);
    if (clipCache.size > CLIP_CACHE_MAX) {
      const [oldKey, oldP] = clipCache.entries().next().value as [string, Promise<string>];
      clipCache.delete(oldKey);
      oldP.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
    }
  }
  return p;
}

/** Word ranges of a text, used to estimate which word the audio is at. */
export function wordRanges(text: string): { start: number; end: number }[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

/** Word at playback progress p (0–1), weighting words by length (+1 for the pause after each). */
export function wordAt(ranges: { start: number; end: number }[], p: number) {
  if (!ranges.length) return null;
  const weights = ranges.map((r) => r.end - r.start + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let target = Math.min(Math.max(p, 0), 0.9999) * total;
  for (let i = 0; i < ranges.length; i++) {
    target -= weights[i];
    if (target < 0) return ranges[i];
  }
  return ranges[ranges.length - 1];
}

/**
 * Rough spoken duration of a French text in seconds (≈ 16 characters/s at rate 1, plus pauses at
 * punctuation). Used to animate the highlighted word when the voice gives no word timing
 * (e.g. Chrome's network "Google" voices fire no boundary events). Refined by `pace` calibration.
 */
export function estimateSeconds(text: string, rate = 1): number {
  const chars = text.replace(/\s+/g, ' ').trim().length;
  const commas = (text.match(/[,;:]/g) ?? []).length;
  const stops = (text.match(/[.!?…]/g) ?? []).length;
  return Math.max(0.6, (chars / 16 + commas * 0.2 + stops * 0.3) / rate);
}

// ---------------------------------------------------------------------------- pace calibration
// Voices speak at different real speeds (and map `rate` differently). After each utterance we compare
// the real duration with the estimate and keep a smoothed correction factor per voice + rate.

const PACE_KEY = 'tac-sunu-pace-v1';
let paceCache: Record<string, number> | null = null;

function paces(): Record<string, number> {
  if (!paceCache) {
    try {
      paceCache = JSON.parse(localStorage.getItem(PACE_KEY) ?? '{}') ?? {};
    } catch {
      paceCache = {};
    }
  }
  return paceCache!;
}

/** Correction factor (real ÷ estimated duration) for a voice at a rate; 1 when unknown. */
export function paceFactor(voice: string, rate: number): number {
  return paces()[`${voice}|${rate}`] ?? 1;
}

/** Record one measured utterance; returns the new smoothed factor. Outliers (pauses, cut-offs) are ignored. */
export function recordPace(voice: string, rate: number, estimated: number, actual: number): number {
  const key = `${voice}|${rate}`;
  const cur = paces()[key] ?? 1;
  const ratio = actual / estimated;
  if (!Number.isFinite(ratio) || actual < 0.8 || ratio < 0.4 || ratio > 2.5) return cur;
  const next = cur * 0.4 + ratio * 0.6;
  paces()[key] = Math.round(next * 1000) / 1000;
  try {
    localStorage.setItem(PACE_KEY, JSON.stringify(paces()));
  } catch {
    /* private mode */
  }
  return next;
}

// ------------------------------------------------------------------------------------- provider

export function SpeechProvider({ children }: { children: ReactNode }) {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  const canAudio = typeof window !== 'undefined' && typeof Audio !== 'undefined';
  const [natural, setNatural] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [word, setWord] = useState<Word | null>(null);
  const [seg, setSeg] = useState(0);
  const [prefs, setPrefs] = useState(loadPrefs);
  const run = useRef(0); // bumps on every speak/stop so stale callbacks are ignored
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const rateRef = useRef(prefs.rate);
  rateRef.current = prefs.rate;
  const [serverVoices, setServerVoices] = useState<ServerVoice[] | null>(null);
  const [serverDefault, setServerDefault] = useState<string | null>(null);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voicesRequested = useRef(false);

  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => alive && setNatural(!!(c as { tts_enabled?: boolean }).tts_enabled && canAudio));
    // browser voice list (Chrome loads it asynchronously)
    const loadBrowser = () => synth && setBrowserVoices(frenchVoices(synth.getVoices()));
    loadBrowser();
    synth?.addEventListener?.('voiceschanged', loadBrowser);
    return () => {
      alive = false;
      synth?.removeEventListener?.('voiceschanged', loadBrowser);
      synth?.cancel();
      audio.current?.pause();
      cancelAnimationFrame(raf.current);
    };
  }, [synth, canAudio]);

  const loadVoices = useCallback(() => {
    if (!natural || voicesRequested.current) return;
    voicesRequested.current = true;
    fetch(`${BASE}/tts/voices`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { voices: ServerVoice[]; default: string | null }) => {
        setServerVoices(d.voices);
        setServerDefault(d.default);
        // a saved natural voice that the server no longer offers → back to automatic
        setPrefs((p) => {
          if (p.voice?.engine !== 'natural' || d.voices.some((v) => v.id === (p.voice as { id: string }).id)) return p;
          const n = { ...p, voice: null };
          savePrefs(n);
          return n;
        });
      })
      .catch(() => {
        voicesRequested.current = false; // e.g. not logged in yet: retry next time
      });
  }, [natural]);

  // live speed change for the natural voice
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = prefs.rate;
  }, [prefs.rate]);

  const stop = useCallback(() => {
    run.current++;
    synth?.cancel();
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute('src');
    }
    cancelAnimationFrame(raf.current);
    setSpeakingId(null);
    setPreparing(false);
    setWord(null);
    setSeg(0);
  }, [synth]);

  const finish = useCallback((my: number) => {
    if (run.current !== my) return;
    cancelAnimationFrame(raf.current);
    setSpeakingId(null);
    setPreparing(false);
    setWord(null);
  }, []);

  /** Web Speech engine, from segment `from`. */
  const speakBrowser = useCallback(
    (my: number, parts: string[], from = 0, voiceName?: string) => {
      if (!synth) return finish(my);
      const all = synth.getVoices();
      const voice = (voiceName && all.find((v) => v.name === voiceName)) || pickVoice(all);
      parts.slice(from).forEach((text, k) => {
        const i = from + k;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = voice?.lang ?? 'fr-FR';
        if (voice) u.voice = voice;
        u.rate = rateRef.current;
        const ranges = wordRanges(text);
        const voiceKey = voice?.name ?? 'default';
        const baseEst = estimateSeconds(text, u.rate);
        let realTiming = false; // true once the voice reports word boundaries itself
        let t0 = 0;
        u.onstart = () => {
          if (run.current !== my) return;
          setPreparing(false);
          setSeg(i);
          setWord(null);
          // estimated word animation until (unless) real boundary events arrive,
          // using this voice's calibrated pace
          t0 = performance.now();
          const est = baseEst * paceFactor(voiceKey, u.rate);
          cancelAnimationFrame(raf.current);
          const tick = () => {
            if (run.current !== my || realTiming) return;
            const w = wordAt(ranges, (performance.now() - t0) / 1000 / est);
            if (w) setWord((cur) => (cur && cur.seg === i && cur.start === w.start ? cur : { seg: i, ...w }));
            raf.current = requestAnimationFrame(tick);
          };
          raf.current = requestAnimationFrame(tick);
        };
        u.onboundary = (e) => {
          if (run.current !== my || e.name === 'sentence') return;
          realTiming = true;
          const len = e.charLength || text.slice(e.charIndex).search(/[\s,.;:!?…]|$/);
          setWord({ seg: i, start: e.charIndex, end: e.charIndex + Math.max(len, 1) });
        };
        u.onend = () => {
          cancelAnimationFrame(raf.current);
          // learn the real pace from completed (not cancelled) utterances
          if (run.current === my && t0 && !realTiming) recordPace(voiceKey, u.rate, baseEst, (performance.now() - t0) / 1000);
          if (i === parts.length - 1) finish(my);
        };
        u.onerror = () => {
          cancelAnimationFrame(raf.current);
          if (i === parts.length - 1) finish(my);
        };
        synth.speak(u);
      });
    },
    [synth, finish],
  );

  /** Server voice engine: play clips one after another, prefetching the next; falls back to the browser voice. */
  const speakNatural = useCallback(
    async (my: number, parts: string[], voiceId?: string) => {
      const el = (audio.current ??= new Audio());
      el.preload = 'auto';
      for (let i = 0; i < parts.length; i++) {
        let url: string;
        try {
          url = await fetchClip(parts[i], voiceId);
        } catch {
          if (run.current !== my) return;
          setNatural(false); // server voice unavailable: use the browser voice from now on
          return speakBrowser(my, parts, i);
        }
        if (run.current !== my) return;
        if (i + 1 < parts.length) fetchClip(parts[i + 1], voiceId).catch(() => undefined);
        const ranges = wordRanges(parts[i]);
        el.src = url;
        el.playbackRate = rateRef.current;
        (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
        const tick = () => {
          if (run.current !== my) return;
          // real audio length when known; otherwise the speaking-speed estimate
          const total = el.duration && Number.isFinite(el.duration) ? el.duration : estimateSeconds(parts[i]);
          const w = wordAt(ranges, el.currentTime / total);
          if (w) setWord((cur) => (cur && cur.seg === i && cur.start === w.start ? cur : { seg: i, ...w }));
          raf.current = requestAnimationFrame(tick);
        };
        try {
          await el.play();
          if (run.current !== my) return;
          // highlight only once sound actually starts ("Chargement…" until then)
          setPreparing(false);
          setSeg(i);
          setWord(null);
          raf.current = requestAnimationFrame(tick);
          await new Promise<void>((resolve, reject) => {
            el.onended = () => resolve();
            el.onerror = () => reject(new Error('audio'));
            el.onpause = () => run.current !== my && resolve(); // stopped by the user
          });
        } catch {
          cancelAnimationFrame(raf.current);
          if (run.current !== my) return;
          return speakBrowser(my, parts, i); // e.g. autoplay blocked: browser voice instead
        }
        cancelAnimationFrame(raf.current);
        if (run.current !== my) return;
      }
      finish(my);
    },
    [speakBrowser, finish],
  );

  const speakWith = useCallback(
    (id: string, segments: string[], choice: VoiceChoice) => {
      const parts = segments.map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return;
      stop();
      const my = run.current;
      setSpeakingId(id);
      setWord(null);
      setSeg(0);
      if (choice?.engine === 'browser') speakBrowser(my, parts, 0, choice.name);
      else if (natural) {
        setPreparing(true);
        void speakNatural(my, parts, choice?.engine === 'natural' ? choice.id : undefined);
      } else speakBrowser(my, parts);
    },
    [natural, stop, speakNatural, speakBrowser],
  );

  const speak = useCallback(
    (id: string, segments: string[]) => speakWith(id, segments, prefs.voice),
    [speakWith, prefs.voice],
  );

  const preview = useCallback(
    (choice: VoiceChoice) => speakWith('voice-preview', [SAMPLE_TEXT], choice),
    [speakWith],
  );

  const toggle = useCallback(
    (id: string, segments: string[]) => (speakingId === id ? stop() : speak(id, segments)),
    [speakingId, speak, stop],
  );

  const value = useMemo<SpeechCtx>(
    () => ({
      supported: natural || !!synth,
      engine: prefs.voice?.engine === 'browser' || !natural ? 'browser' : 'natural',
      naturalAvailable: natural,
      serverVoices,
      serverDefault,
      browserVoices,
      voice: prefs.voice,
      setVoice: (voice) =>
        setPrefs((p) => {
          const n = { ...p, voice };
          savePrefs(n);
          return n;
        }),
      loadVoices,
      preview,
      speakingId,
      preparing,
      word,
      seg,
      auto: prefs.auto,
      rate: prefs.rate,
      setAuto: (auto) =>
        setPrefs((p) => {
          const n = { ...p, auto };
          savePrefs(n);
          return n;
        }),
      setRate: (rate) =>
        setPrefs((p) => {
          const n = { ...p, rate };
          savePrefs(n);
          return n;
        }),
      speak,
      toggle,
      stop,
    }),
    [natural, synth, serverVoices, serverDefault, browserVoices, loadVoices, preview, speakingId, preparing, word, seg, prefs, speak, toggle, stop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const NOOP: SpeechCtx = {
  supported: false,
  engine: 'browser',
  naturalAvailable: false,
  serverVoices: null,
  serverDefault: null,
  browserVoices: [],
  voice: null,
  setVoice: () => undefined,
  loadVoices: () => undefined,
  preview: () => undefined,
  speakingId: null,
  preparing: false,
  word: null,
  seg: 0,
  auto: false,
  rate: 1,
  setAuto: () => undefined,
  setRate: () => undefined,
  speak: () => undefined,
  toggle: () => undefined,
  stop: () => undefined,
};

export function useSpeech(): SpeechCtx {
  return useContext(Ctx) ?? NOOP;
}

/** Text with the word currently spoken highlighted (when the block `id` / segment `seg` is being read). */
export function SpokenText({ id, seg, text }: { id: string; seg: number; text: string }) {
  const { speakingId, word, seg: cur, preparing } = useSpeech();
  const active = speakingId === id && cur === seg && !preparing;
  if (!active) return <>{text}</>;
  if (!word || word.seg !== seg) return <span className="tac-spoken-seg">{text}</span>;
  return (
    <span className="tac-spoken-seg">
      {text.slice(0, word.start)}
      <mark className="tac-spoken-word">{text.slice(word.start, word.end)}</mark>
      {text.slice(word.end)}
    </span>
  );
}
