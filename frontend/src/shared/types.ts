import type { DimKey, ExtraValue, QuestionnaireContent } from './referentiel';

export interface BlocAnswer { most: number | null; least: number | null }
export interface Answers {
  sit: Record<string, number>;
  bloc: Record<string, BlocAnswer>;
  lik: Record<string, number>;
  extra?: Record<string, ExtraValue>;
}

export interface Company { id: number; name: string; code?: string | null; active?: boolean }
export interface RoleGrant { id: number; role: 'HR_ADMIN' | 'HR_ENTITY'; company_id: number | null; company_name: string | null }

export interface Me {
  id: number;
  username: string;
  name: string;
  email: string | null;
  filliale: string | null;
  department: string | null;
  title: string | null;
  company: Company | null;
  roles: RoleGrant[];
  is_hr: boolean;
  is_hr_admin: boolean;
  local_account: boolean;
}

export interface Campaign {
  id: number;
  code: string;
  label: string;
  opens_at: string | null;
  closes_at: string | null;
  active: boolean;
  position: number;
  questionnaire_id: number | null;
  /** questions drawn at random per respondent, per category; null / missing key = every question */
  tirage?: Tirage | null;
}

export type TirageKey = 'situations' | 'blocs' | 'likert' | 'validite';
export type Tirage = Partial<Record<TirageKey, number>>;

export interface TirageCheck {
  available: Record<TirageKey, number>;
  errors: string[];
  warnings: string[];
}

export type DimScores = Record<DimKey, number | null>;

export interface SubmissionResult {
  id: number;
  matricule: string;
  name?: string | null;
  user_id: number | null;
  company_id: number | null;
  filiale: string | null;
  categorie: string | null;
  famille: string | null;
  campaign: { id: number; code: string; label: string };
  submitted_at: string;
  duree_s: number | null;
  global: number | null;
  scores: DimScores;
  sjt: DimScores;
  lik: DimScores;
  extra?: DimScores | null;
  questionnaire_id?: number | null;
  dom: Record<DimKey, number>;
  dom_haut: DimKey;
  dom_bas: DimKey;
  ds: number;
  inc: number;
  uniforme: boolean;
  rapide: boolean;
  ds_haut: boolean;
  invalide: boolean;
  profil: string | null;
  source: 'web' | 'code' | 'file';
  answers?: Answers;
  user?: { name: string; email: string | null; title: string | null; department: string | null } | null;
}

export interface GroupRow {
  key: string;
  n: number;
  global: number | null;
  scores: DimScores;
  aligned_pct: number | null;
  masked: boolean;
}

export interface Summary {
  total: number;
  valid: number;
  invalid: number;
  population: number;
  participation_pct: number | null;
  global: number | null;
  aligned_pct: number | null;
  par_dim: DimScores;
  ranking: { rank: number; dim: DimKey; label: string; score: number; priority: boolean }[];
  bands: { label: string; count: number; pct: number }[];
  dominance: { dim: DimKey; label: string; haut: number; bas: number }[];
  groups: { filiale: GroupRow[]; categorie: GroupRow[]; famille: GroupRow[] };
  trend: (GroupRow & { campaign_id: number; code: string; label: string })[];
  campaigns_present: string[];
  min_group_size: number;
}

export interface ImportReport { imported: number; replaced: number; invalid_tests: number; unreadable: number; errors: string[] }

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  company: { id: number; name: string } | null;
  active: boolean;
  last_login: string | null;
  local_account: boolean;
  roles: RoleGrant[];
}

export type QStatus = 'draft' | 'published' | 'archived';
export interface QIssue { path: string; message: string }
export interface QStats {
  counts: Record<'situations' | 'blocs' | 'likert' | 'validite' | 'extras', number>;
  total: number;
  by_dim: Record<DimKey, { situations: number; likert: number; blocs: number; extras: number }>;
  duration_min: number;
  extra_types: Record<string, number>;
}
export interface QValidation { errors: QIssue[]; warnings: QIssue[]; stats: QStats }
export interface QuestionnaireSummary {
  id: number;
  label: string;
  description: string | null;
  version: number;
  status: QStatus;
  revision: number;
  based_on_id: number | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  published_by: string | null;
  published_at: string | null;
  campaigns: { id: number; code: string; label: string; active: boolean; open: boolean }[];
  submissions: number;
  stats: QStats;
}
export interface QuestionnaireFull extends QuestionnaireSummary {
  content: QuestionnaireContent;
  validation: QValidation;
}
export interface ItemStats {
  n: number;
  min_group_size: number;
  masked: boolean;
  items: Record<
    string,
    {
      n: number;
      options?: number[];
      mean_pct?: number | null;
      discrimination?: number | null;
      most?: number[];
      least?: number[];
      distribution?: number[];
      mean?: number | null;
      mean_rank?: (number | null)[];
      texts?: string[];
    }
  >;
}
