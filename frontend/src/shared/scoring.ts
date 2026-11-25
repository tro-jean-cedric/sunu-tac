/**
 * TypeScript port of `calcul()` from the legacy TAC-SUNU-test.html, generalised to editable questionnaires
 * (mirror of backend/app/scoring.py). Used client-side only to show results offline; the backend re-scores
 * every submission and is authoritative. With the original bank the numbers are identical to the legacy
 * code — parity: scoring.test.ts (golden fixtures).
 */
import { DEFAULT_RULES, DIM_KEYS, REF, extraPoints, scaleBounds, visibleExtras, type DimKey, type Referentiel } from './referentiel';
import type { Answers } from './types';

export interface ScoreResult {
  sjt: Record<DimKey, number | null>;
  lik: Record<DimKey, number | null>;
  extra: Record<DimKey, number | null> | null;
  scores: Record<DimKey, number | null>;
  global: number | null;
  dom: Record<DimKey, number>;
  domHaut: DimKey;
  domBas: DimKey;
  ds: number;
  inc: number;
  uniforme: boolean;
  rapide: boolean;
  dsHaut: boolean;
  invalide: boolean;
  dureeS: number | null;
}

type Rec<T> = Record<DimKey, T>;
const byDim = <T,>(f: (d: DimKey) => T) => Object.fromEntries(DIM_KEYS.map((d) => [d, f(d)])) as Rec<T>;

export function calcul(
  sit: Answers['sit'],
  bloc: Answers['bloc'],
  lik: Answers['lik'],
  dureeS: number | null,
  ref: Referentiel = REF,
  extra: Answers['extra'] = {},
): ScoreResult {
  const rules = { ...DEFAULT_RULES, ...(ref.regles ?? {}) };
  const w = { ...DEFAULT_RULES.poids, ...(rules.poids ?? {}) };
  const [lo, hi] = scaleBounds(ref);
  const sjt = byDim(() => ({ p: 0, max: 0 }));
  const lk = byDim(() => ({ s: 0, n: 0 }));
  const ex = byDim(() => ({ p: 0, max: 0 }));
  const dom = byDim(() => 0);
  const domN = byDim(() => 0);

  ref.situations.forEach((q) => {
    sjt[q.dim].max += Math.max(0, ...q.options.map((o) => o.points));
    const c = sit[q.id];
    if (c != null && q.options[c]) sjt[q.dim].p += q.options[c].points;
  });
  ref.blocs.forEach((b) => {
    b.items.forEach((it) => domN[it.dim]++);
    const c = bloc[b.id];
    if (!c || c.most == null || c.least == null || c.most === c.least) return;
    dom[b.items[c.most].dim] += 2;
    dom[b.items[c.least].dim] -= 1;
  });
  ref.likert.forEach((it) => {
    const v = lik[it.id];
    if (v == null) return;
    lk[it.dim].s += it.rev ? lo + hi - v : v;
    lk[it.dim].n++;
  });
  if (extra) {
    visibleExtras(ref, extra).forEach((e) => {
      const pts = extraPoints(e, extra[e.id]);
      if (pts && e.dim) {
        ex[e.dim].p += pts[0];
        ex[e.dim].max += pts[1];
      }
    });
  }
  // social desirability
  const ds = ref.validite.filter((v) => v.kind === 'ds').reduce((a, v) => a + (lik[v.id] === hi ? 1 : 0), 0);
  // consistency between twin items
  let inc = 0;
  let incN = 0;
  ref.validite
    .filter((v) => v.kind === 'inc')
    .forEach((v) => {
      const a = lik[v.id];
      const b = lik[v.pair!];
      if (a == null || b == null) return;
      const bb = v.opp ? lo + hi - b : b;
      inc += Math.abs(a - bb);
      incN++;
    });
  if (incN && incN < rules.incNorm) inc = Math.round((inc * rules.incNorm) / incN);
  // uniform pattern
  const vals = ref.likert.map((it) => lik[it.id]).filter((v) => v != null);
  const freq: Record<number, number> = {};
  vals.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
  const uniforme = vals.length > 0 && vals.length >= rules.uniformeMin && Math.max(...Object.values(freq)) / vals.length > rules.uniformeSeuil;
  const rapide = dureeS != null && dureeS < rules.rapideS;
  const dsHaut = ds >= rules.dsSeuil;

  const sjtPct = (d: DimKey) => (sjt[d].max ? (sjt[d].p / sjt[d].max) * 100 : null);
  const likPct = (d: DimKey) => (lk[d].n ? ((lk[d].s - lo * lk[d].n) / ((hi - lo) * lk[d].n)) * 100 : null);
  const exPct = (d: DimKey) => (ex[d].max ? (ex[d].p / ex[d].max) * 100 : null);
  const scores = byDim((d) => {
    const parts = (
      [
        [w.sjt, sjtPct(d)],
        [dsHaut ? 0 : w.lik, likPct(d)],
        [w.extra, exPct(d)],
      ] as [number, number | null][]
    ).filter((p): p is [number, number] => p[1] != null && p[0] > 0);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0][1];
    let acc = 0;
    let tw = 0;
    parts.forEach(([wt, x]) => {
      acc += wt * x;
      tw += wt;
    });
    return tw === 1 ? acc : acc / tw;
  });
  const ok = DIM_KEYS.map((d) => scores[d]).filter((v): v is number => v != null);
  const global = ok.length === DIM_KEYS.length ? ok.reduce((x, y) => x + y, 0) / DIM_KEYS.length : null;
  const domPct = byDim((d) => (domN[d] ? ((dom[d] + domN[d]) / (3 * domN[d])) * 100 : 50));
  const srt = DIM_KEYS.map((d) => [d, domPct[d]] as const).sort((a, b) => b[1] - a[1]);
  const hasExtra = DIM_KEYS.some((d) => ex[d].max);
  return {
    sjt: byDim(sjtPct),
    lik: byDim(likPct),
    extra: hasExtra ? byDim(exPct) : null,
    scores,
    global,
    dom: domPct,
    domHaut: srt[0][0],
    domBas: srt[srt.length - 1][0],
    ds,
    inc,
    uniforme,
    rapide,
    dsHaut,
    invalide: uniforme || inc >= rules.incSeuil,
    dureeS,
  };
}
