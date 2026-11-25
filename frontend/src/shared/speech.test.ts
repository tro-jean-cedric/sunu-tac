import { describe, expect, it } from 'vitest';

import { estimateSeconds, paceFactor, pickVoice, recordPace, wordAt, wordRanges } from './speech';

describe('pace calibration', () => {
  it('learns a faster voice and ignores outliers', () => {
    expect(paceFactor('Google français', 1)).toBe(1);
    // the voice really took 6 s where we estimated 8 s → factor moves towards 0.75
    let f = recordPace('Google français', 1, 8, 6);
    f = recordPace('Google français', 1, 8, 6);
    expect(f).toBeGreaterThan(0.75);
    expect(f).toBeLessThan(0.8);
    expect(paceFactor('Google français', 1)).toBeCloseTo(f, 2);
    expect(paceFactor('Google français', 1.2)).toBe(1); // per rate
    expect(recordPace('Google français', 1, 8, 0.3)).toBeCloseTo(f, 2); // cut-off utterance ignored
    expect(recordPace('Google français', 1, 2, 30)).toBeCloseTo(f, 2); // long pause ignored
  });
});

describe('estimateSeconds', () => {
  it('scales with length, punctuation and rate', () => {
    const s = 'Une personne dont l’avis compte pour votre service vous demande de passer outre une étape de contrôle.';
    const t = estimateSeconds(s);
    expect(t).toBeGreaterThan(6);
    expect(t).toBeLessThan(10);
    expect(estimateSeconds(s, 1.2)).toBeCloseTo(t / 1.2);
    expect(estimateSeconds('Oui')).toBe(0.6);
  });
});

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService }) as SpeechSynthesisVoice;

describe('pickVoice', () => {
  it('never picks an English voice for French text', () => {
    expect(pickVoice([v('Samantha', 'en-US'), v('Daniel', 'en-GB')])).toBeNull();
  });

  it('skips Apple novelty voices and prefers fr-FR', () => {
    const mac = [
      v('Samantha', 'en-US'),
      v('Grandpa (French (France))', 'fr-FR'),
      v('Rocko (French (France))', 'fr-FR'),
      v('Amélie', 'fr-CA'),
      v('Thomas', 'fr-FR'),
    ];
    expect(pickVoice(mac)?.name).toBe('Thomas');
  });

  it('prefers Google, then Edge natural voices', () => {
    expect(pickVoice([v('Thomas', 'fr-FR'), v('Google français', 'fr-FR', false)])?.name).toBe('Google français');
    expect(
      pickVoice([v('Google français', 'fr-FR', false), v('Microsoft Denise Online (Natural) - French (France)', 'fr-FR', false)])?.name,
    ).toContain('Denise');
  });

  it('accepts underscore language tags', () => {
    expect(pickVoice([v('Thomas', 'fr_FR')])?.name).toBe('Thomas');
  });
});

describe('wordAt', () => {
  const text = 'Que feriez-vous réellement ?';
  const r = wordRanges(text);
  it('maps playback progress to words', () => {
    expect(text.slice(r[0].start, r[0].end)).toBe('Que');
    expect(wordAt(r, 0)).toEqual(r[0]);
    expect(wordAt(r, 0.5)).toEqual(r[1]); // weights 4 + 12 + 11 + 2: the middle falls in "feriez-vous"
    expect(wordAt(r, 0.6)).toEqual(r[2]);
    expect(wordAt(r, 1)).toEqual(r[r.length - 1]);
    expect(wordAt([], 0.5)).toBeNull();
  });
});
