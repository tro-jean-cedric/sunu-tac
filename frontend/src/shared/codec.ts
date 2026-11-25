/**
 * `TAC1.` restitution codes, byte-compatible with the legacy HTML
 * (btoa(unescape(encodeURIComponent(s))) == base64 of the UTF-8 bytes).
 * Positions follow the questionnaire of the campaign (`ref`); answers to complementary questions travel in an
 * optional 5th part (JSON), ignored by the legacy decoder.
 */
import { REF, likall, type Referentiel } from './referentiel';
import type { Answers } from './types';

export interface CodeIdent { matricule: string; filiale: string; categorie: string; famille: string; campagne: string }

function b64encodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function b64decodeUtf8(s: string): string {
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encode(ident: Partial<CodeIdent>, a: Answers, dureeS: number, ref: Referentiel = REF): string {
  const sit = ref.situations.map((q) => (a.sit[q.id] == null ? '-' : String(a.sit[q.id] + 1))).join('');
  const bloc = ref.blocs.map((x) => {
    const c = a.bloc[x.id];
    return c && c.most != null && c.least != null ? `${c.most + 1}${c.least + 1}` : '--';
  }).join('');
  const lik = likall(ref).map((i) => (a.lik[i.id] == null ? '-' : String(a.lik[i.id]))).join('');
  const meta = [ident.matricule, ident.filiale, ident.categorie, ident.famille, ident.campagne, dureeS]
    .map((x) => (x == null ? '' : String(x)))
    .join('~');
  const extra = ref.extras?.length && a.extra && Object.keys(a.extra).length ? `|${JSON.stringify(a.extra)}` : '';
  return `TAC1.${b64encodeUtf8(`${meta}|${sit}|${bloc}|${lik}${extra}`)}`;
}

export function decode(
  code: string,
  resolve: (campagne: string) => Referentiel | null | undefined = () => REF,
): ({ ident: CodeIdent; dureeS: number | null } & Answers) | null {
  try {
    const raw = b64decodeUtf8(code.trim().replace(/^TAC1\./, ''));
    const [meta, a, b, c, ...rest] = raw.split('|');
    const [matricule, filiale, categorie, famille, campagne, duree] = meta.split('~');
    const sit: Answers['sit'] = {};
    const bloc: Answers['bloc'] = {};
    const lik: Answers['lik'] = {};
    const ref = resolve(campagne) ?? REF;
    ref.situations.forEach((q, i) => {
      const ch = a[i];
      if (ch && ch !== '-') sit[q.id] = +ch - 1;
    });
    ref.blocs.forEach((x, i) => {
      const m = b[i * 2];
      const l = b[i * 2 + 1];
      if (m && m !== '-' && l && l !== '-') bloc[x.id] = { most: +m - 1, least: +l - 1 };
    });
    likall(ref).forEach((it, i) => {
      const ch = c[i];
      if (ch && ch !== '-') lik[it.id] = +ch;
    });
    const out: { ident: CodeIdent; dureeS: number | null } & Answers = {
      ident: { matricule, filiale, categorie, famille, campagne }, sit, bloc, lik, dureeS: +duree || null,
    };
    if (rest.length) {
      try {
        const x = JSON.parse(rest.join('|'));
        if (x && typeof x === 'object') out.extra = x;
      } catch {
        /* unreadable complementary answers: ignored */
      }
    }
    return out;
  } catch {
    return null;
  }
}
