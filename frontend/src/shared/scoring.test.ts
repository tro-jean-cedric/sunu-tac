import { describe, expect, it } from 'vitest';
import golden from '@shared/golden-fixtures.json';
import { calcul } from './scoring';
import { decode, encode } from './codec';
import type { Answers } from './types';
import { REF, visibleExtras, type Referentiel } from './referentiel';

interface Case {
  name: string;
  ident: Record<string, string>;
  dureeS: number;
  sit: Answers['sit'];
  bloc: Answers['bloc'];
  lik: Answers['lik'];
  expected: Record<string, unknown>;
  code: string;
  decoded: Record<string, unknown>;
}
const cases = (golden as unknown as { cases: Case[] }).cases;

describe('parity with legacy calcul()', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const { extra, ...r } = calcul(c.sit, c.bloc, c.lik, c.dureeS);
    expect(extra).toBeNull();
    expect(JSON.parse(JSON.stringify(r))).toEqual(c.expected);
  });
});

describe('parity with legacy TAC1 codec', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    expect(encode(c.ident, c, c.dureeS)).toBe(c.code);
    expect(JSON.parse(JSON.stringify(decode(c.code)))).toEqual(c.decoded);
  });
  it('handles accents', () => {
    const u = (golden as unknown as { unicode: { code: string; decoded: { ident: unknown } } }).unicode;
    expect(decode(u.code)?.ident).toEqual(u.decoded.ident);
  });
  it('rejects garbage', () => expect(decode('TAC1.@@@')).toBeNull());
});

describe('complementary questions', () => {
  const ref: Referentiel = {
    ...REF,
    extras: [
      { id: 'X2', type: 'yesno', txt: 'q', required: true, dim: 'C', scored: true, pointsOui: 2, pointsNon: 0 },
      {
        id: 'X3', type: 'multiple', txt: 'q', required: true, dim: 'P', scored: true, minChoices: 1, maxChoices: 2,
        options: [{ txt: 'a', points: 2 }, { txt: 'b', points: 1 }, { txt: 'c', points: 0 }],
        showIf: { question: 'X2', values: [true] },
      },
    ],
  };
  const c = cases.find((x) => x.name === 'coherent')!;
  it('weights the extra component like the server', () => {
    const r = calcul(c.sit, c.bloc, c.lik, c.dureeS, ref, { X2: true, X3: [0, 1] });
    const e = c.expected as { sjt: Record<string, number>; lik: Record<string, number> };
    expect(r.extra?.C).toBe(100);
    expect(r.scores.C).toBeCloseTo((0.6 * e.sjt.C + 0.4 * e.lik.C + 0.2 * 100) / 1.2, 9);
  });
  it('ignores answers of hidden questions', () => {
    const r = calcul(c.sit, c.bloc, c.lik, c.dureeS, ref, { X2: false, X3: [0] });
    expect(r.extra?.P).toBeNull();
    expect(visibleExtras(ref, { X2: false }).map((e) => e.id)).toEqual(['X2']);
  });
  it('round-trips extras in the code', () => {
    const a = { sit: c.sit, bloc: c.bloc, lik: c.lik, extra: { X2: true, X3: [1] } };
    const code = encode(c.ident, a, c.dureeS, ref);
    expect(decode(code, () => ref)?.extra).toEqual(a.extra);
  });
});
