/** Questionnaire builder: one version, all its questions and scoring rules. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Iconify, Label, toast } from '@vionhub/design-system/components';

import { ApiError, api } from '../../../shared/api';
import {
  DIMS,
  DIM_COLORS,
  type Bloc,
  type DimKey,
  type ExtraQuestion,
  type LikertItem,
  type QuestionnaireContent,
  type Situation,
  type ValiditeItem,
} from '../../../shared/referentiel';
import type { QuestionnaireFull, QValidation } from '../../../shared/types';
import { SunuBreadcrumbs } from '../../brand';
import { errMsg, fDateTime, invalidateCampaigns } from '../../lib';
import { useSession } from '../../session';
import { DimLabel, EXTRA_TYPES, SECTION_PREFIX, STATUS, issuesAt, issuesIn, move, nextId, useConfirm, type Section } from './common';
import { BlocDialog, ExtraDialog, LikertDialog, SituationDialog, ValiditeDialog, type IssueWithSeverity } from './ItemDialogs';
import { SettingsPanel } from './SettingsPanel';
import { StatsPanel } from './StatsPanel';

type TabKey = Section | 'regles' | 'qualite' | 'stats';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'situations', label: 'Situations', icon: 'solar:case-round-bold-duotone' },
  { key: 'blocs', label: 'Choix forcés', icon: 'solar:scale-bold-duotone' },
  { key: 'likert', label: 'Pratiques', icon: 'solar:chart-square-bold-duotone' },
  { key: 'validite', label: 'Contrôles', icon: 'solar:shield-check-bold-duotone' },
  { key: 'extras', label: 'Complémentaires', icon: 'solar:checklist-minimalistic-bold-duotone' },
  { key: 'regles', label: 'Échelle et calcul', icon: 'solar:tuning-2-bold-duotone' },
  { key: 'qualite', label: 'Contrôle qualité', icon: 'solar:clipboard-check-bold-duotone' },
  { key: 'stats', label: 'Statistiques', icon: 'solar:graph-up-bold-duotone' },
];

const SECTION_INTRO: Record<Section, string> = {
  situations:
    'Partie 1 — cas de travail concrets. Le répondant choisit la réaction qu’il aurait réellement ; chaque réaction rapporte des points sur la dimension de la situation.',
  blocs:
    'Partie 2 — choix forcé. Parmi des affirmations positives de dimensions différentes, le répondant désigne celle qui lui ressemble le plus et le moins : on en tire la dimension privilégiée et la dimension sacrifiée.',
  likert: 'Partie 3 — pratiques déclarées sur l’échelle de fréquence. Les énoncés inversés décrivent le comportement opposé à la valeur.',
  validite:
    'Items mêlés aux pratiques pour fiabiliser le résultat : désirabilité sociale (affirmations irréalistes) et cohérence (reformulations d’un énoncé). Ils ne comptent pas dans les scores.',
  extras:
    'Partie 4 (facultative) — questions de tout type : profil, opinion, contexte… Elles peuvent compter dans le score d’une dimension et n’apparaître que selon une réponse précédente.',
};

export function QuestionnaireEditorPage() {
  const { id } = useParams();
  const qid = Number(id);
  const nav = useNavigate();
  const { me } = useSession();
  const [q, setQ] = useState<QuestionnaireFull>();
  const [content, setContent] = useState<QuestionnaireContent>();
  const [meta, setMeta] = useState({ label: '', description: '' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [validation, setValidation] = useState<QValidation>();
  const [tab, setTab] = useState<TabKey>('situations');
  const [focus, setFocus] = useState<string | null>(null);
  const [confirm, confirmUi] = useConfirm();

  const editable = !!q && q.status === 'draft' && me.is_hr_admin;

  const load = useCallback(async () => {
    try {
      const full = await api.questionnaire(qid);
      setQ(full);
      setContent(full.content);
      setMeta({ label: full.label, description: full.description ?? '' });
      setValidation(full.validation);
      setDirty(false);
      setLoadError(undefined);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, [qid]);
  useEffect(() => {
    load();
  }, [load]);

  // live validation of unsaved changes (server rules, debounced)
  const vTimer = useRef<number>();
  useEffect(() => {
    if (!editable || !content || !dirty) return;
    window.clearTimeout(vTimer.current);
    vTimer.current = window.setTimeout(() => {
      api.validateQuestionnaire(content).then(setValidation).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(vTimer.current);
  }, [content, dirty, editable]);

  // unsaved changes guard
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = useCallback((fn: (c: QuestionnaireContent) => QuestionnaireContent) => {
    setContent((c) => (c ? fn(c) : c));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!q || !content || !editable) return;
    setSaving(true);
    try {
      const full = await api.saveQuestionnaire(q.id, { revision: q.revision, label: meta.label.trim() || q.label, description: meta.description, content });
      setQ(full);
      setContent(full.content);
      setValidation(full.validation);
      setDirty(false);
      toast.success('Brouillon enregistré.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message, { action: { label: 'Recharger', onClick: () => load() } });
      } else toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [q, content, editable, meta, load]);

  // Ctrl/Cmd + S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dirty, save]);

  const publish = async () => {
    if (!q) return;
    if (dirty) {
      toast.warning('Enregistrez vos modifications avant de publier.');
      return;
    }
    if (validation?.errors.length) {
      setTab('qualite');
      toast.error(`${validation.errors.length} erreur(s) à corriger avant publication.`);
      return;
    }
    const y = await confirm({
      title: `Publier la version ${q.version} ?`,
      body: 'Une version publiée est figée : elle ne pourra plus être modifiée, seulement copiée. Vous pourrez ensuite l’affecter à une campagne.',
      ok: 'Publier',
    });
    if (!y) return;
    try {
      const full = await api.publishQuestionnaire(q.id);
      setQ(full);
      invalidateCampaigns();
      toast.success(`Version ${q.version} publiée. Affectez-la à une campagne depuis le menu Campagnes.`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const newVersion = async () => {
    if (!q) return;
    try {
      const d = await api.createQuestionnaire({ label: `${q.label} — révision`, from_id: q.id });
      toast.success(`Brouillon v${d.version} créé.`);
      nav(`/questionnaires/${d.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const goto = (path: string) => {
    const [section] = path.split('.');
    const t = (['situations', 'blocs', 'likert', 'validite', 'extras'].includes(section) ? section : section === 'echelle' || section === 'regles' ? 'regles' : 'qualite') as TabKey;
    setTab(t);
    setFocus(path.includes('.') ? path : null);
  };

  if (loadError)
    return (
      <Stack spacing={2}>
        <Alert severity="error">{loadError}</Alert>
        <Box>
          <Button onClick={() => nav('/questionnaires')}>Retour aux questionnaires</Button>
        </Box>
      </Stack>
    );
  if (!q || !content) return <LinearProgress />;

  const st = STATUS[q.status];
  const errs = validation?.errors ?? [];
  const warns = validation?.warnings ?? [];
  const tabBadge = (k: TabKey) => {
    if (k === 'qualite') return errs.length ? { n: errs.length, c: 'error' as const } : warns.length ? { n: warns.length, c: 'warning' as const } : null;
    if (k === 'regles') return issuesIn(errs, 'regles').length + issuesIn(errs, 'echelle').length ? { n: issuesIn(errs, 'regles').length + issuesIn(errs, 'echelle').length, c: 'error' as const } : null;
    if (k === 'stats') return null;
    const e = issuesIn(errs, k).length;
    return e ? { n: e, c: 'error' as const } : null;
  };
  const count = (k: TabKey) => (k in content && Array.isArray(content[k as Section]) ? content[k as Section].length : null);

  return (
    <Stack spacing={3}>
      <SunuBreadcrumbs
        heading={`v${q.version} — ${meta.label || q.label}`}
        links={[{ name: 'Console DRH', href: '/' }, { name: 'Questionnaires', href: '/questionnaires' }, { name: `v${q.version}` }]}
        action={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
            {me.is_hr_admin && (
              <Button variant="outlined" color="inherit" href={api.questionnaireExportUrl(q.id)} startIcon={<Iconify icon="solar:download-minimalistic-bold" />}>
                Exporter
              </Button>
            )}
            {me.is_hr_admin && q.status !== 'draft' && (
              <Button variant="contained" onClick={newVersion} startIcon={<Iconify icon="solar:copy-bold" />}>
                Nouvelle version
              </Button>
            )}
            {editable && (
              <>
                <Button variant="outlined" color="primary" onClick={publish} startIcon={<Iconify icon="solar:verified-check-bold" />}>
                  Publier
                </Button>
                <Button variant="contained" onClick={save} disabled={!dirty || saving} startIcon={<Iconify icon="solar:diskette-bold" />}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </>
            )}
          </Stack>
        }
      />

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: -1 }}>
        <Label color={st.color} startIcon={<Iconify icon={st.icon} />}>
          {st.label}
        </Label>
        {dirty && (
          <Label color="info" startIcon={<Iconify icon="solar:pen-2-linear" />}>
            Modifications non enregistrées · Ctrl+S
          </Label>
        )}
        {q.based_on_id && (
          <Typography variant="caption" color="text.secondary">
            Créée à partir de la version #{q.based_on_id}
          </Typography>
        )}
      </Stack>

      {!editable && (
        <Alert severity="info" icon={<Iconify icon="solar:lock-keyhole-bold-duotone" />}>
          {q.status === 'draft'
            ? 'Consultation seule : la modification des questionnaires est réservée à la DRH Groupe.'
            : `Version ${q.status === 'archived' ? 'archivée' : 'publiée'} le ${fDateTime(q.published_at)}${q.published_by ? ` par ${q.published_by}` : ''} : elle est figée pour garantir la comparabilité des résultats.${me.is_hr_admin ? ' Pour la faire évoluer, créez une nouvelle version.' : ''}`}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2.5 }}>
            <Box component="fieldset" disabled={!editable} sx={{ border: 0, p: 0, m: 0 }}>
              <Stack spacing={2}>
                <TextField
                  label="Nom"
                  value={meta.label}
                  onChange={(e) => {
                    setMeta({ ...meta, label: e.target.value });
                    setDirty(true);
                  }}
                  inputProps={{ maxLength: 255 }}
                />
                <TextField
                  label="Description / notes de version"
                  value={meta.description}
                  onChange={(e) => {
                    setMeta({ ...meta, description: e.target.value });
                    setDirty(true);
                  }}
                  multiline
                  minRows={1}
                />
              </Stack>
            </Box>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <OverviewCard q={q} validation={validation} onGoto={goto} />
        </Grid>
      </Grid>

      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          {TABS.filter((t) => t.key !== 'stats' || q.status !== 'draft').map((t) => {
            const b = tabBadge(t.key);
            const n = count(t.key);
            return (
              <Tab
                key={t.key}
                value={t.key}
                iconPosition="start"
                icon={<Iconify icon={t.icon} width={20} />}
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <span>{t.label}</span>
                    {n != null && <Chip size="small" label={n} sx={{ height: 20, fontSize: 11 }} />}
                    {b && <Chip size="small" color={b.c} label={b.n} sx={{ height: 20, fontSize: 11 }} />}
                  </Stack>
                }
                sx={{ minHeight: 56 }}
              />
            );
          })}
        </Tabs>
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          {tab === 'situations' && (
            <ItemsSection<Situation>
              section="situations"
              content={content}
              editable={editable}
              validation={validation}
              focus={focus}
              setFocus={setFocus}
              update={update}
              confirm={confirm}
              newItem={(c) => ({ id: nextId(c, 'A'), dim: 'H', txt: '', options: [3, 2, 1, 0].map((points) => ({ txt: '', points })) })}
              searchText={(it) => `${it.id} ${it.txt} ${it.options.map((o) => o.txt).join(' ')}`}
              dimOf={(it) => [it.dim]}
              render={(it) => ({
                text: it.txt,
                meta: `${it.options.length} réponses · max ${Math.max(0, ...it.options.map((o) => o.points))} pts`,
              })}
              Dialog={SituationDialog}
            />
          )}
          {tab === 'blocs' && (
            <ItemsSection<Bloc>
              section="blocs"
              content={content}
              editable={editable}
              validation={validation}
              focus={focus}
              setFocus={setFocus}
              update={update}
              confirm={confirm}
              newItem={(c) => ({ id: nextId(c, 'B'), items: (['C', 'A', 'P'] as DimKey[]).map((dim) => ({ txt: '', dim })) })}
              searchText={(it) => `${it.id} ${it.items.map((o) => o.txt).join(' ')}`}
              dimOf={(it) => it.items.map((i) => i.dim)}
              render={(it) => ({
                text: (
                  <Stack spacing={0.25}>
                    {it.items.map((i, k) => (
                      <Stack key={k} direction="row" spacing={1} alignItems="center">
                        <DimLabel dim={i.dim} short />
                        <Typography variant="body2" noWrap>
                          {i.txt || '—'}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                ),
                hideDim: true,
              })}
              Dialog={BlocDialog}
            />
          )}
          {tab === 'likert' && (
            <ItemsSection<LikertItem>
              section="likert"
              content={content}
              editable={editable}
              validation={validation}
              focus={focus}
              setFocus={setFocus}
              update={update}
              confirm={confirm}
              newItem={(c) => ({ id: nextId(c, 'C'), dim: 'H', comp: '', rev: false, txt: '' })}
              searchText={(it) => `${it.id} ${it.comp} ${it.txt}`}
              dimOf={(it) => [it.dim]}
              render={(it) => ({ text: it.txt, meta: [it.comp, it.rev ? 'inversé' : ''].filter(Boolean).join(' · '), flag: it.rev ? 'Inversé' : undefined })}
              onDeleteWarn={(it, c) => {
                const p = c.validite.filter((v) => v.pair === it.id).map((v) => v.id);
                return p.length ? `Il est apparié aux items de cohérence ${p.join(', ')}, qu'il faudra réapparier.` : undefined;
              }}
              Dialog={LikertDialog}
            />
          )}
          {tab === 'validite' && (
            <ItemsSection<ValiditeItem>
              section="validite"
              content={content}
              editable={editable}
              validation={validation}
              focus={focus}
              setFocus={setFocus}
              update={update}
              confirm={confirm}
              newItem={(c) => ({ id: nextId(c, 'D'), kind: 'ds', txt: '' })}
              searchText={(it) => `${it.id} ${it.txt} ${it.pair ?? ''}`}
              dimOf={() => []}
              render={(it) => ({
                text: it.txt,
                meta: it.kind === 'ds' ? 'Désirabilité sociale' : `Cohérence avec ${it.pair}${it.opp ? ' (sens opposé)' : ''}`,
                flag: it.kind === 'ds' ? 'DS' : 'INC',
              })}
              Dialog={ValiditeDialog}
            />
          )}
          {tab === 'extras' && (
            <ItemsSection<ExtraQuestion>
              section="extras"
              content={content}
              editable={editable}
              validation={validation}
              focus={focus}
              setFocus={setFocus}
              update={update}
              confirm={confirm}
              newItem={(c) => ({ id: nextId(c, 'X'), type: 'single', txt: '', required: true, dim: null, scored: false, showIf: null })}
              searchText={(it) => `${it.id} ${it.txt} ${(it.options ?? []).map((o) => o.txt).join(' ')}`}
              dimOf={(it) => (it.scored && it.dim ? [it.dim] : [])}
              render={(it) => ({
                text: it.txt,
                icon: EXTRA_TYPES[it.type].icon,
                meta: [
                  EXTRA_TYPES[it.type].label,
                  it.options ? `${it.options.length} réponses` : '',
                  it.type === 'scale' ? `${it.min} → ${it.max}` : '',
                  it.required ? '' : 'facultative',
                  it.scored ? 'notée' : '',
                  it.showIf ? `si ${it.showIf.question}` : '',
                ]
                  .filter(Boolean)
                  .join(' · '),
              })}
              onDeleteWarn={(it, c) => {
                const p = c.extras.filter((e) => e.showIf?.question === it.id).map((e) => e.id);
                return p.length ? `Les questions ${p.join(', ')} dépendent de sa réponse.` : undefined;
              }}
              Dialog={ExtraDialog}
              header={
                <Box component="fieldset" disabled={!editable} sx={{ border: 0, p: 0, m: 0, mb: 2 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Titre de la partie"
                      value={content.extrasTitre}
                      onChange={(e) => update((c) => ({ ...c, extrasTitre: e.target.value }))}
                      sx={{ minWidth: 280 }}
                      size="small"
                    />
                    <TextField
                      label="Introduction affichée au répondant"
                      value={content.extrasIntro}
                      onChange={(e) => update((c) => ({ ...c, extrasIntro: e.target.value }))}
                      fullWidth
                      size="small"
                    />
                  </Stack>
                </Box>
              }
            />
          )}
          {tab === 'regles' && <SettingsPanel content={content} editable={editable} update={update} validation={validation} />}
          {tab === 'qualite' && <QualityPanel validation={validation} onGoto={goto} />}
          {tab === 'stats' && <StatsPanel q={{ ...q, content }} />}
        </Box>
      </Card>
      {confirmUi}
    </Stack>
  );
}

// ---------------------------------------------------------------- overview

function OverviewCard({ q, validation, onGoto }: { q: QuestionnaireFull; validation?: QValidation; onGoto: (p: string) => void }) {
  const s = validation?.stats ?? q.stats;
  const errs = validation?.errors.length ?? 0;
  const warns = validation?.warnings.length ?? 0;
  return (
    <Card sx={{ p: 2.5, height: 1 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">Synthèse</Typography>
          <Chip size="small" icon={<Iconify icon="solar:clock-circle-linear" width={16} />} label={`≈ ${s.duration_min} min`} />
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto repeat(4, 1fr)', gap: 0.5, alignItems: 'center', typography: 'caption' }}>
          <span />
          {DIMS.map((d) => (
            <Tooltip key={d.id} title={d.label}>
              <Box sx={{ textAlign: 'center', fontWeight: 700, color: DIM_COLORS[d.id] }}>{d.id}</Box>
            </Tooltip>
          ))}
          {(
            [
              ['situations', 'Situations'],
              ['blocs', 'Blocs'],
              ['likert', 'Pratiques'],
              ['extras', 'Compl. notées'],
            ] as const
          ).map(([k, l]) => (
            <Box key={k} sx={{ display: 'contents' }}>
              <Box sx={{ color: 'text.secondary', pr: 1 }}>{l}</Box>
              {DIMS.map((d) => {
                const v = s.by_dim[d.id]?.[k] ?? 0;
                return (
                  <Box key={d.id} sx={{ textAlign: 'center', fontWeight: 600, color: v ? 'text.primary' : 'text.disabled' }}>
                    {v}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip
            size="small"
            color={errs ? 'error' : 'success'}
            variant={errs ? 'filled' : 'outlined'}
            icon={<Iconify icon={errs ? 'solar:danger-triangle-bold' : 'solar:check-circle-bold'} width={16} />}
            label={errs ? `${errs} erreur${errs > 1 ? 's' : ''}` : 'Publiable'}
            onClick={() => onGoto('qualite')}
          />
          {warns > 0 && <Chip size="small" color="warning" variant="outlined" label={`${warns} avertissement${warns > 1 ? 's' : ''}`} onClick={() => onGoto('qualite')} />}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {q.campaigns.length ? `Campagnes : ${q.campaigns.map((c) => c.code).join(', ')} · ` : ''}
          {q.submissions} réponse{q.submissions > 1 ? 's' : ''}
          {q.updated_by ? ` · modifié par ${q.updated_by} ${fDateTime(q.updated_at)}` : ''}
        </Typography>
      </Stack>
    </Card>
  );
}

function QualityPanel({ validation, onGoto }: { validation?: QValidation; onGoto: (p: string) => void }) {
  if (!validation) return <LinearProgress />;
  const row = (i: { path: string; message: string }, sev: 'error' | 'warning', k: number) => (
    <Alert
      key={`${sev}${k}`}
      severity={sev}
      variant="outlined"
      action={
        i.path !== 'coverage' && (
          <Button size="small" color="inherit" onClick={() => onGoto(i.path)}>
            Voir
          </Button>
        )
      }
    >
      {i.path.includes('.') && (
        <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', mr: 1 }}>
          {i.path}
        </Typography>
      )}
      {i.message}
    </Alert>
  );
  return (
    <Stack spacing={1.25}>
      <Typography color="text.secondary" variant="body2">
        Les <strong>erreurs</strong> empêchent la publication. Les <strong>avertissements</strong> signalent des choix à vérifier
        (équilibre entre dimensions, contrôles qui ne se déclencheraient jamais…).
      </Typography>
      {!validation.errors.length && !validation.warnings.length && (
        <Alert severity="success">Aucun problème détecté : ce questionnaire peut être publié.</Alert>
      )}
      {validation.errors.map((i, k) => row(i, 'error', k))}
      {validation.warnings.map((i, k) => row(i, 'warning', k))}
    </Stack>
  );
}

// ---------------------------------------------------------------- generic list of items

interface ItemBase { id: string }

interface DialogProps<T> {
  item: T | null;
  defaults: T;
  content: QuestionnaireContent;
  readOnly: boolean;
  issues?: IssueWithSeverity[];
  onClose: () => void;
  onSave: (item: T) => void;
}

function ItemsSection<T extends ItemBase>({
  section,
  content,
  editable,
  validation,
  focus,
  setFocus,
  update,
  confirm,
  newItem,
  searchText,
  dimOf,
  render,
  onDeleteWarn,
  Dialog,
  header,
}: {
  section: Section;
  content: QuestionnaireContent;
  editable: boolean;
  validation?: QValidation;
  focus: string | null;
  setFocus: (p: string | null) => void;
  update: (fn: (c: QuestionnaireContent) => QuestionnaireContent) => void;
  confirm: ReturnType<typeof useConfirm>[0];
  newItem: (c: QuestionnaireContent) => T;
  searchText: (it: T) => string;
  dimOf: (it: T) => DimKey[];
  render: (it: T) => { text: ReactNode; meta?: string; flag?: string; icon?: string; hideDim?: boolean };
  onDeleteWarn?: (it: T, c: QuestionnaireContent) => string | undefined;
  Dialog: (p: DialogProps<T>) => JSX.Element;
  header?: ReactNode;
}) {
  const items = content[section] as unknown as T[];
  const [search, setSearch] = useState('');
  const [dim, setDim] = useState<DimKey | ''>('');
  const [editing, setEditing] = useState<{ index: number | null; item: T | null; defaults: T } | null>(null);

  const setItems = (fn: (list: T[]) => T[]) => update((c) => ({ ...c, [section]: fn(c[section] as unknown as T[]) }));

  // a "Voir" link from the quality panel opens the item
  useEffect(() => {
    if (!focus) return;
    const [s, i] = focus.split('.');
    if (s === section && items[Number(i)]) setEditing({ index: Number(i), item: items[Number(i)], defaults: items[Number(i)] });
    setFocus(null);
  }, [focus, section, items, setFocus]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .map((it, index) => ({ it, index }))
      .filter(({ it }) => (!s || searchText(it).toLowerCase().includes(s)) && (!dim || dimOf(it).includes(dim)));
  }, [items, search, dim, searchText, dimOf]);
  const filtered = shown.length !== items.length;

  const issuesFor = (index: number): IssueWithSeverity[] => [
    ...issuesAt(validation?.errors, `${section}.${index}`).map((i) => ({ ...i, severity: 'error' as const })),
    ...issuesAt(validation?.warnings, `${section}.${index}`).map((i) => ({ ...i, severity: 'warning' as const })),
  ];
  const sectionIssues = [...issuesAt(validation?.errors, section), ...issuesAt(validation?.warnings, section)];

  const remove = async (index: number) => {
    const it = items[index];
    const extra = onDeleteWarn?.(it, content);
    const ok = await confirm({ title: `Supprimer ${it.id} ?`, body: extra ?? 'Cette question sera retirée du brouillon.', ok: 'Supprimer', danger: true });
    if (ok) setItems((l) => l.filter((_, k) => k !== index));
  };
  const duplicate = (index: number) => {
    const it = items[index];
    const copy = { ...structuredClone(it), id: nextId(content, SECTION_PREFIX[section]) };
    setItems((l) => [...l.slice(0, index + 1), copy, ...l.slice(index + 1)]);
    toast.success(`${it.id} dupliqué en ${copy.id}.`);
  };

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 900 }}>
        {SECTION_INTRO[section]}
      </Typography>
      {header}
      {sectionIssues.map((i, k) => (
        <Alert key={k} severity={validation?.errors.includes(i) ? 'error' : 'warning'} variant="outlined">
          {i.message}
        </Alert>
      ))}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        <TextField
          size="small"
          placeholder="Rechercher (identifiant, texte, réponse…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: { sm: 420 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
        {section !== 'validite' && (
          <TextField select size="small" label="Dimension" value={dim} onChange={(e) => setDim(e.target.value as DimKey | '')} sx={{ minWidth: 180 }} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
            <MenuItem value="">Toutes</MenuItem>
            {DIMS.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        {editable && (
          <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setEditing({ index: null, item: null, defaults: newItem(content) })}>
            Ajouter
          </Button>
        )}
      </Stack>

      <Card variant="outlined">
        {shown.map(({ it, index }, n) => {
          const r = render(it);
          const iss = issuesFor(index);
          const hasErr = iss.some((i) => i.severity === 'error');
          return (
            <Stack
              key={`${it.id}-${index}`}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                px: 1.5,
                py: 1.25,
                borderTop: n ? '1px solid' : 0,
                borderColor: 'divider',
                cursor: 'pointer',
                bgcolor: hasErr ? 'rgba(255,86,48,.06)' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => setEditing({ index, item: it, defaults: it })}
            >
              <Typography variant="caption" color="text.disabled" sx={{ width: 24, textAlign: 'right', flexShrink: 0 }}>
                {index + 1}
              </Typography>
              <Box sx={{ width: 52, flexShrink: 0 }}>
                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
                  {it.id}
                </Typography>
              </Box>
              {section === 'extras' && (
                <Box sx={{ width: 24, flexShrink: 0, display: 'flex' }}>{r.icon && <Iconify icon={r.icon} sx={{ color: 'primary.main' }} />}</Box>
              )}
              {!r.hideDim && section !== 'validite' && (
                <Box sx={{ width: 112, flexShrink: 0 }}>
                  {dimOf(it).map((d) => (
                    <DimLabel key={d} dim={d} />
                  ))}
                </Box>
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {typeof r.text === 'string' ? (
                  <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {r.text || <em>(sans texte)</em>}
                  </Typography>
                ) : (
                  r.text
                )}
                {r.meta && (
                  <Typography variant="caption" color="text.secondary">
                    {r.meta}
                  </Typography>
                )}
              </Box>
              {r.flag && <Label variant="outlined">{r.flag}</Label>}
              {iss.length > 0 && (
                <Tooltip title={iss.map((i) => i.message).join(' — ')}>
                  <Box component="span" sx={{ display: 'flex' }}>
                    <Iconify icon="solar:danger-triangle-bold" sx={{ color: hasErr ? 'error.main' : 'warning.main' }} />
                  </Box>
                </Tooltip>
              )}
              {editable && (
                <Stack direction="row" onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0 }}>
                  <Tooltip title={filtered ? 'Effacez les filtres pour réordonner' : 'Monter'}>
                    <span>
                      <IconButton size="small" disabled={filtered || index === 0} onClick={() => setItems((l) => move(l, index, -1))}>
                        <Iconify icon="solar:alt-arrow-up-linear" width={18} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={filtered ? 'Effacez les filtres pour réordonner' : 'Descendre'}>
                    <span>
                      <IconButton size="small" disabled={filtered || index === items.length - 1} onClick={() => setItems((l) => move(l, index, 1))}>
                        <Iconify icon="solar:alt-arrow-down-linear" width={18} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Dupliquer">
                    <IconButton size="small" onClick={() => duplicate(index)}>
                      <Iconify icon="solar:copy-linear" width={18} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Supprimer">
                    <IconButton size="small" color="error" onClick={() => remove(index)}>
                      <Iconify icon="solar:trash-bin-minimalistic-linear" width={18} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}
            </Stack>
          );
        })}
        {!shown.length && (
          <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
            {items.length ? 'Aucun résultat pour ces filtres.' : 'Aucune question dans cette partie.'}
          </Box>
        )}
      </Card>

      {editing && (
        <Dialog
          item={editing.item}
          defaults={editing.defaults}
          content={content}
          readOnly={!editable}
          issues={editing.index != null ? issuesFor(editing.index) : undefined}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            const idx = editing.index;
            const oldId = editing.item?.id;
            update((c) => {
              const list = (c[section] as unknown as T[]).slice();
              if (idx == null) list.push(item);
              else list[idx] = item;
              let next = { ...c, [section]: list } as QuestionnaireContent;
              // keep references in sync when an id is renamed
              if (oldId && oldId !== item.id) {
                if (section === 'likert')
                  next = { ...next, validite: next.validite.map((v) => (v.pair === oldId ? { ...v, pair: item.id } : v)) };
                if (section === 'extras')
                  next = { ...next, extras: next.extras.map((e) => (e.showIf?.question === oldId ? { ...e, showIf: { ...e.showIf, question: item.id } } : e)) };
              }
              return next;
            });
            setEditing(null);
          }}
        />
      )}
    </Stack>
  );
}
