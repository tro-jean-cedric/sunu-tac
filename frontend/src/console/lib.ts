/** Console-only helpers: cached reference lists, async state, URL filters, formatting. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LabelColor } from '@vionhub/design-system/components';
// Types `theme.vars` (the theme is mounted through CssVarsProvider in shared/theme.tsx).
import type {} from '@mui/material/themeCssVarsAugmentation';

import { api } from '../shared/api';
import type { Campaign, Company } from '../shared/types';

// ---------------------------------------------------------------- cached reference lists

let companiesP: Promise<Company[]> | null = null;
let campaignsP: Promise<Campaign[]> | null = null;

export function loadCompanies() {
  companiesP ??= api.companies().catch((e) => {
    companiesP = null;
    throw e;
  });
  return companiesP;
}

export function loadCampaigns() {
  campaignsP ??= api.campaigns().catch((e) => {
    campaignsP = null;
    throw e;
  });
  return campaignsP;
}

export function invalidateCampaigns() {
  campaignsP = null;
}

export function resetCaches() {
  companiesP = null;
  campaignsP = null;
}

// ---------------------------------------------------------------- async state

export interface AsyncState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(undefined);
    fn()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

// ---------------------------------------------------------------- URL filters

export interface Filters {
  campaign_id: number | '';
  company_id: number | '';
  categorie: string;
  famille: string;
}

/** API filter key → URL search-param name (French, readable in shared links). */
const PARAM: Record<keyof Filters, string> = {
  campaign_id: 'campagne',
  company_id: 'entite',
  categorie: 'categorie',
  famille: 'famille',
};

const num = (v: string | null): number | '' => (v && /^\d+$/.test(v) ? Number(v) : '');

/** Filters (shared by the dashboard and the respondents list) live in the URL search params. */
export function useFilters() {
  const [params, setParams] = useSearchParams();

  const filters: Filters = useMemo(
    () => ({
      campaign_id: num(params.get(PARAM.campaign_id)),
      company_id: num(params.get(PARAM.company_id)),
      categorie: params.get(PARAM.categorie) ?? '',
      famille: params.get(PARAM.famille) ?? '',
    }),
    [params],
  );

  const setFilter = useCallback(
    (key: keyof Filters, value: string | number) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (value === '' || value == null) p.delete(PARAM[key]);
          else p.set(PARAM[key], String(value));
          p.delete('page');
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const resetFilters = useCallback(() => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        Object.values(PARAM).forEach((k) => p.delete(k));
        p.delete('page');
        return p;
      },
      { replace: true },
    );
  }, [setParams]);

  /** The filter part of the query string, to carry filters across pages. */
  const search = useMemo(() => {
    const p = new URLSearchParams();
    Object.values(PARAM).forEach((k) => {
      const v = params.get(k);
      if (v) p.set(k, v);
    });
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [params]);

  const active = Object.values(filters).some((v) => v !== '');
  return { filters, setFilter, resetFilters, search, active };
}

// ---------------------------------------------------------------- formatting

export function fDateTime(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function fDate(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { dateStyle: 'short' });
}

export function fDuration(s: number | null | undefined) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`;
}

/** Narrow no-break space before %, as in French typography. */
export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${fmt0(v, digits)} %`);
const fmt0 = (v: number, digits: number) =>
  (Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString('fr-FR');

export const BAND_COLOR: Record<string, LabelColor> = {
  Ambassadeur: 'success',
  Aligné: 'info',
  'En développement': 'warning',
  Éloigné: 'error',
};

export const bandColor = (label: string | null | undefined): LabelColor =>
  (label && BAND_COLOR[label]) || 'default';

export const SOURCE_LABEL: Record<string, string> = {
  web: 'Application en ligne',
  code: 'Code de restitution',
  file: 'Fichier .json',
};

/** `datetime-local` value ⇄ ISO string. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
