/** Test flow state: reducer, seeded option order, progress and draft persistence. */
import { EXTRA_PAGE_SIZE, LIKERT_PAGE_SIZE, likall, visibleExtras, type ExtraValue, type Referentiel } from '../shared/referentiel';
import type { Answers } from '../shared/types';

export type Vue = 'accueil' | 'ident' | 'sit' | 'bloc' | 'lik' | 'extra' | 'res';

export interface FlowState {
  vue: Vue;
  idx: number;
  answers: Answers;
  categorie: string;
  famille: string;
  startedAt: string | null;
  seed: number;
}

export const likPages = (ref: Referentiel) => Math.ceil(likall(ref).length / LIKERT_PAGE_SIZE);
/** Complementary pages depend on the answers (conditional questions). */
export const extraPages = (ref: Referentiel, a: Answers) => Math.ceil(visibleExtras(ref, a.extra ?? {}).length / EXTRA_PAGE_SIZE);
export const hasExtras = (ref: Referentiel) => (ref.extras?.length ?? 0) > 0;
export const totalSteps = (ref: Referentiel, a: Answers) =>
  ref.situations.length + ref.blocs.length + likPages(ref) + extraPages(ref, a);

export const emptyAnswers = (): Answers => ({ sit: {}, bloc: {}, lik: {}, extra: {} });

export const initialState = (): FlowState => ({
  vue: 'accueil',
  idx: 0,
  answers: emptyAnswers(),
  categorie: '',
  famille: '',
  startedAt: null,
  seed: Math.floor(Math.random() * 2 ** 31),
});

export type Action =
  | { type: 'go'; vue: Vue; idx?: number }
  | { type: 'restore'; state: Partial<FlowState> }
  | { type: 'start' }
  | { type: 'ident'; categorie?: string; famille?: string }
  | { type: 'sit'; id: string; value: number }
  | { type: 'blocPick'; id: string; t: 'most' | 'least'; k: number }
  | { type: 'lik'; id: string; value: number }
  | { type: 'extra'; id: string; value: ExtraValue | null }
  | { type: 'reset'; keepIdent?: boolean };

export function reducer(s: FlowState, a: Action): FlowState {
  switch (a.type) {
    case 'go':
      return { ...s, vue: a.vue, idx: a.idx ?? 0 };
    case 'restore':
      return { ...s, ...a.state, answers: { ...emptyAnswers(), ...(a.state.answers ?? {}) } };
    case 'start':
      return { ...s, startedAt: s.startedAt ?? new Date().toISOString(), vue: 'ident', idx: 0 };
    case 'ident':
      return { ...s, categorie: a.categorie ?? s.categorie, famille: a.famille ?? s.famille };
    case 'sit':
      return { ...s, answers: { ...s.answers, sit: { ...s.answers.sit, [a.id]: a.value } } };
    case 'blocPick': {
      // computed from the latest state so two quick taps (+ then −) never overwrite each other
      const cur = s.answers.bloc[a.id] ?? { most: null, least: null };
      const other = a.t === 'most' ? 'least' : 'most';
      const nv = { ...cur, [a.t]: cur[a.t] === a.k ? null : a.k };
      if (nv[other] === a.k) nv[other] = null;
      return { ...s, answers: { ...s.answers, bloc: { ...s.answers.bloc, [a.id]: nv } } };
    }
    case 'lik':
      return { ...s, answers: { ...s.answers, lik: { ...s.answers.lik, [a.id]: a.value } } };
    case 'extra': {
      const extra = { ...(s.answers.extra ?? {}) };
      if (a.value == null || a.value === '' || (Array.isArray(a.value) && !a.value.length)) delete extra[a.id];
      else extra[a.id] = a.value;
      return { ...s, answers: { ...s.answers, extra } };
    }
    case 'reset': {
      const fresh = initialState();
      return a.keepIdent ? { ...fresh, categorie: s.categorie, famille: s.famille } : fresh;
    }
    default:
      return s;
  }
}

export function progress(s: FlowState, ref: Referentiel): number {
  const total = totalSteps(ref, s.answers) || 1;
  const nS = ref.situations.length;
  const nB = ref.blocs.length;
  let f = 0;
  if (s.vue === 'sit') f = s.idx;
  else if (s.vue === 'bloc') f = nS + s.idx;
  else if (s.vue === 'lik') f = nS + nB + s.idx;
  else if (s.vue === 'extra') f = nS + nB + likPages(ref) + s.idx;
  else if (s.vue === 'res') f = total;
  return s.vue === 'accueil' || s.vue === 'ident' ? 0 : Math.min(100, (f / total) * 100);
}

export const hasProgress = (s: FlowState) =>
  Object.keys(s.answers.sit).length + Object.keys(s.answers.bloc).length + Object.keys(s.answers.lik).length +
    Object.keys(s.answers.extra ?? {}).length >
  0;

/** Deterministic PRNG (mulberry32) so a user always sees the same option order, even after reload. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(n: number, rnd: () => number): number[] {
  const ord = Array.from({ length: n }, (_, k) => k);
  for (let i = ord.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ord[i], ord[j]] = [ord[j], ord[i]];
  }
  return ord;
}

/** Option display order of a complementary question (stable per user and question). */
export function extraOrder(seed: number, id: string, n: number): number[] {
  let h = seed >>> 0;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return shuffled(n, mulberry32(h));
}

/** Option display order for each situation (Fisher–Yates with the user's seed). */
export function optionOrders(seed: number, ref: Referentiel): Record<string, number[]> {
  const rnd = mulberry32(seed);
  const mix = ref.regles?.melangerOptions ?? true;
  return Object.fromEntries(
    ref.situations.map((q) => {
      const ord = q.options.map((_, k) => k);
      if (!mix) return [q.id, ord];
      for (let i = ord.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [ord[i], ord[j]] = [ord[j], ord[i]];
      }
      return [q.id, ord];
    }),
  );
}

// ---------------------------------------------------------------- local mirror of the draft
const key = (userId: number, campaignId: number) => `tac-sunu-draft-v2-${userId}-${campaignId}`;

export function saveLocal(userId: number, campaignId: number, s: FlowState) {
  try {
    localStorage.setItem(key(userId, campaignId), JSON.stringify({ ...s, savedAt: new Date().toISOString() }));
  } catch {
    /* private mode */
  }
}

export function loadLocal(userId: number, campaignId: number): (FlowState & { savedAt?: string }) | null {
  try {
    const raw = localStorage.getItem(key(userId, campaignId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocal(userId: number, campaignId: number) {
  try {
    localStorage.removeItem(key(userId, campaignId));
  } catch {
    /* ignore */
  }
}
