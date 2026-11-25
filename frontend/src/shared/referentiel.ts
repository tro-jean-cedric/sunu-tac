import raw from '@shared/referentiel.json';

export type DimKey = 'H' | 'C' | 'A' | 'P';
export interface Dim { id: DimKey; label: string }
export interface Option { txt: string; points: number }
export interface Situation { id: string; dim: DimKey; txt: string; aide?: string; options: Option[] }
export interface Bloc { id: string; items: { txt: string; dim: DimKey }[] }
export interface LikertItem { id: string; dim: DimKey; comp: string; rev: boolean; txt: string }
export interface ValiditeItem { id: string; kind: 'ds' | 'inc'; txt: string; pair?: string; opp?: boolean }
export interface Bande { min: number; label: string; description: string }

export type ExtraType = 'single' | 'multiple' | 'yesno' | 'scale' | 'ranking' | 'text';
export interface ExtraQuestion {
  id: string;
  type: ExtraType;
  txt: string;
  aide?: string;
  required: boolean;
  dim: DimKey | null;
  scored: boolean;
  options?: { txt: string; points?: number }[];
  shuffle?: boolean;
  minChoices?: number;
  maxChoices?: number; // 0 = no limit
  labels?: [string, string];
  pointsOui?: number;
  pointsNon?: number;
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  rev?: boolean;
  multiline?: boolean;
  maxLength?: number;
  showIf?: { question: string; values: (number | boolean)[] } | null;
}
export type ExtraValue = number | number[] | boolean | string;

export interface Regles {
  poids: { sjt: number; lik: number; extra: number };
  dsSeuil: number;
  incSeuil: number;
  incNorm: number;
  uniformeMin: number;
  uniformeSeuil: number;
  rapideS: number;
  melangerOptions: boolean;
}

/** The editable part: what a questionnaire version holds. */
export interface QuestionnaireContent {
  situations: Situation[];
  blocs: Bloc[];
  likert: LikertItem[];
  validite: ValiditeItem[];
  echelle: { value: number; label: string }[];
  extras: ExtraQuestion[];
  extrasTitre: string;
  extrasIntro: string;
  regles: Regles;
}

/** Global referentiel (dims, bands, catégories…) merged with one questionnaire's questions. */
export interface Referentiel extends QuestionnaireContent {
  version: string;
  dims: Dim[];
  categories: string[];
  familles: string[];
  bandes: Bande[];
}

export const DEFAULT_RULES: Regles = {
  poids: { sjt: 0.6, lik: 0.4, extra: 0.2 },
  dsSeuil: 3,
  incSeuil: 8,
  incNorm: 4,
  uniformeMin: 20,
  uniformeSeuil: 0.8,
  rapideS: 720,
  melangerOptions: true,
};

/** The original item bank (also the fallback when a campaign's questionnaire cannot be loaded). */
export const REF: Referentiel = {
  extras: [],
  extrasTitre: 'Questions complémentaires',
  extrasIntro: '',
  regles: DEFAULT_RULES,
  ...(raw as unknown as Omit<Referentiel, 'extras' | 'extrasTitre' | 'extrasIntro' | 'regles'>),
};
export const DIMS = REF.dims;
export const DIM_KEYS = DIMS.map((d) => d.id);
export const DIMNAME = Object.fromEntries(DIMS.map((d) => [d.id, d.label])) as Record<DimKey, string>;
export const CATEGORIES = REF.categories;
export const FAMILLES = REF.familles;
export const BANDES = REF.bandes;

/** Likert + validity items: the order used by the restitution code. */
export const likall = (ref: Referentiel): (LikertItem | ValiditeItem)[] => [...ref.likert, ...ref.validite];

export function scaleBounds(ref: Pick<Referentiel, 'echelle'>): [number, number] {
  const v = ref.echelle.map((e) => e.value);
  return v.length ? [Math.min(...v), Math.max(...v)] : [1, 5];
}

export function bande(v: number | null | undefined): Bande | null {
  if (v == null) return null;
  return BANDES.find((b) => v >= b.min) ?? null;
}

/** Legacy `likOrdre()`: validity items interleaved among the Likert items. */
export function likertOrder(ref: Referentiel): (LikertItem | ValiditeItem)[] {
  const v = ref.validite.slice();
  const base = ref.likert.slice();
  const out: (LikertItem | ValiditeItem)[] = [];
  const pas = v.length ? Math.max(1, Math.floor(base.length / v.length)) : Infinity;
  base.forEach((it, k) => {
    out.push(it);
    if (v.length && (k + 1) % pas === 0 && k < base.length - 2) out.push(v.shift()!);
  });
  while (v.length) out.push(v.shift()!);
  return out;
}

export const LIKERT_PAGE_SIZE = 7;
export const EXTRA_PAGE_SIZE = 5;

// ------------------------------------------------------------------ complementary questions

function matches(parent: ExtraQuestion, answer: ExtraValue | undefined, values: (number | boolean)[]) {
  if (answer == null) return false;
  if (parent.type === 'multiple' && Array.isArray(answer)) return values.some((v) => answer.includes(v as number));
  return values.includes(answer as number | boolean);
}

/** Extras whose display condition is met (same rule as the server). */
export function visibleExtras(ref: Pick<Referentiel, 'extras'>, answers: Record<string, ExtraValue>): ExtraQuestion[] {
  const shown = new Map<string, ExtraQuestion>();
  for (const e of ref.extras ?? []) {
    if (e.showIf) {
      const parent = shown.get(e.showIf.question);
      if (!parent || !matches(parent, answers[e.showIf.question], e.showIf.values)) continue;
    }
    shown.set(e.id, e);
  }
  return [...shown.values()];
}

export function extraAnswered(e: ExtraQuestion, v: ExtraValue | undefined): boolean {
  if (v == null || v === '') return false;
  if (e.type === 'multiple') return Array.isArray(v) && v.length >= Math.max(1, e.minChoices ?? 0);
  if (e.type === 'ranking') return Array.isArray(v) && v.length === (e.options?.length ?? 0);
  return true;
}

export function extraPoints(e: ExtraQuestion, v: ExtraValue | undefined): [number, number] | null {
  if (!e.scored || !e.dim || v == null) return null;
  const pts = (e.options ?? []).map((o) => o.points ?? 0);
  switch (e.type) {
    case 'single':
      return [pts[v as number] ?? 0, Math.max(0, ...pts)];
    case 'multiple': {
      const pos = pts.filter((p) => p > 0).sort((a, b) => b - a);
      const cap = e.maxChoices || pos.length;
      return [Math.max(0, (v as number[]).reduce((a, i) => a + (pts[i] ?? 0), 0)), pos.slice(0, cap).reduce((a, b) => a + b, 0)];
    }
    case 'yesno':
      return [v ? e.pointsOui ?? 1 : e.pointsNon ?? 0, Math.max(e.pointsOui ?? 1, e.pointsNon ?? 0, 0)];
    case 'scale': {
      const span = (e.max ?? 10) - (e.min ?? 0);
      const frac = span ? ((v as number) - (e.min ?? 0)) / span : 0;
      return [e.rev ? 1 - frac : frac, 1];
    }
    default:
      return null;
  }
}

/** Dimension colours (chart series), on-brand and distinguishable. */
export const DIM_COLORS: Record<DimKey, string> = { H: '#A6192E', C: '#B5862F', A: '#2E6E5E', P: '#3D5A80' };
