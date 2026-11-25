/** Thin fetch wrapper. Session = httpOnly cookie set by /api/auth/login. */
import type { AdminUser, Campaign, Tirage, TirageCheck, Company, ImportReport, Me, SubmissionResult, Summary, Answers, ItemStats, QuestionnaireFull, QuestionnaireSummary, QValidation } from './types';
import type { QuestionnaireContent, Referentiel } from './referentiel';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
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
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : res.text()) as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);
type Filters = { campaign_id?: number | ''; company_id?: number | ''; categorie?: string; famille?: string };
export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (username: string, password: string) => req<Me>('/auth/login', { method: 'POST', body: json({ username, password }) }),
  logout: () => req<void>('/auth/logout', { method: 'POST' }),
  me: () => req<Me>('/auth/me'),

  openCampaigns: () => req<Campaign[]>('/campaigns/open'),
  campaignQuestionnaire: (campaignId: number) =>
    req<Referentiel & { questionnaire_id: number | null }>(`/campaigns/${campaignId}/questionnaire`),
  getDraft: (campaignId: number) => req<{ payload: DraftPayload | null; updated_at: string | null }>(`/me/draft?campaign_id=${campaignId}`),
  putDraft: (campaignId: number, payload: DraftPayload) => req<void>('/me/draft', { method: 'PUT', body: json({ campaign_id: campaignId, payload }) }),
  deleteDraft: (campaignId: number) => req<void>(`/me/draft?campaign_id=${campaignId}`, { method: 'DELETE' }),
  latest: (campaignId: number) => req<SubmissionResult | null>(`/me/submissions/latest?campaign_id=${campaignId}`),
  submit: (body: Answers & { campaign_id: number; categorie: string; famille: string; started_at: string }) =>
    req<SubmissionResult>('/me/submissions', { method: 'POST', body: json(body) }),

  // console
  companies: () => req<Company[]>('/companies'),
  campaigns: () => req<Campaign[]>('/campaigns'),
  createCampaign: (c: Partial<Campaign>) => req<Campaign>('/campaigns', { method: 'POST', body: json(c) }),
  patchCampaign: (id: number, c: Partial<Campaign>) => req<Campaign>(`/campaigns/${id}`, { method: 'PATCH', body: json(c) }),
  tirageCheck: (questionnaireId: number, tirage: Tirage | null) =>
    req<TirageCheck>('/campaigns/tirage-check', { method: 'POST', body: json({ questionnaire_id: questionnaireId, tirage }) }),
  summary: (f: Filters) => req<Summary>(`/results/summary${qs(f)}`),
  individuals: (f: Filters & { q?: string; invalid?: boolean | ''; sort?: string; order?: string; page?: number; size?: number }) =>
    req<{ total: number; items: SubmissionResult[] }>(`/results/individuals${qs(f)}`),
  individual: (id: number) => req<SubmissionResult>(`/results/individuals/${id}`),
  deleteSubmission: (id: number) => req<void>(`/submissions/${id}`, { method: 'DELETE' }),
  exportUrl: (f: Filters) => `${BASE}/results/export.csv${qs(f)}`,
  importCodes: (codes: string[]) => req<ImportReport>('/import/codes', { method: 'POST', body: json({ codes }) }),
  importFiles: (items: unknown[]) => req<ImportReport>('/import/files', { method: 'POST', body: json({ items }) }),
  users: (q: string, hrOnly = false) => req<AdminUser[]>(`/admin/users${qs({ q, hr_only: hrOnly || '' })}`),
  grantRole: (uid: number, role: string, companyId?: number | null) =>
    req<AdminUser>(`/admin/users/${uid}/roles`, { method: 'POST', body: json({ role, company_id: companyId ?? null }) }),
  revokeRole: (rid: number) => req<AdminUser>(`/admin/roles/${rid}`, { method: 'DELETE' }),
  adminStatus: () => req<{ ldap_enabled: boolean; users: number; companies: number; last_sync: string | null }>('/admin/status'),
  ldapSync: () => req<Record<string, number>>('/admin/ldap/sync', { method: 'POST' }),
  questionnaires: () => req<QuestionnaireSummary[]>('/questionnaires'),
  questionnaire: (id: number) => req<QuestionnaireFull>(`/questionnaires/${id}`),
  createQuestionnaire: (b: { label: string; description?: string; from_id?: number; template?: 'origine' | 'vide'; content?: unknown }) =>
    req<QuestionnaireFull>('/questionnaires', { method: 'POST', body: json(b) }),
  saveQuestionnaire: (id: number, b: { revision: number; label?: string; description?: string; content?: QuestionnaireContent }) =>
    req<QuestionnaireFull>(`/questionnaires/${id}`, { method: 'PUT', body: json(b) }),
  validateQuestionnaire: (content: QuestionnaireContent) =>
    req<QValidation>('/questionnaires/validate', { method: 'POST', body: json({ content }) }),
  publishQuestionnaire: (id: number) => req<QuestionnaireFull>(`/questionnaires/${id}/publish`, { method: 'POST' }),
  archiveQuestionnaire: (id: number) => req<QuestionnaireFull>(`/questionnaires/${id}/archive`, { method: 'POST' }),
  restoreQuestionnaire: (id: number) => req<QuestionnaireFull>(`/questionnaires/${id}/restore`, { method: 'POST' }),
  deleteQuestionnaire: (id: number) => req<void>(`/questionnaires/${id}`, { method: 'DELETE' }),
  questionnaireExportUrl: (id: number) => `${BASE}/questionnaires/${id}/export`,
  questionnaireStats: (id: number, campaignId?: number | '') => req<ItemStats>(`/questionnaires/${id}/stats${qs({ campaign_id: campaignId })}`),
  audit: () => req<{ at: string; actor: string | null; action: string; target: string | null }[]>('/admin/audit'),
};

/** Saved test-in-progress (the employee app's FlowState). */
export interface DraftPayload {
  answers?: Answers;
  categorie?: string;
  famille?: string;
  startedAt?: string | null;
  vue?: string;
  idx?: number;
  seed?: number;
}
