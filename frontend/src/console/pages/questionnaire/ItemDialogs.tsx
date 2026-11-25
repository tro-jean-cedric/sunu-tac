/** Editors of one item of each kind. Read-only mode = same dialog, all inputs disabled. */
import { useMemo, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';

import { ExtraInput } from '../../../shared/ExtraInput';
import type {
  Bloc,
  DimKey,
  ExtraQuestion,
  ExtraType,
  ExtraValue,
  LikertItem,
  QuestionnaireContent,
  Situation,
  ValiditeItem,
} from '../../../shared/referentiel';
import type { QIssue } from '../../../shared/types';
import { DimSelect, EXTRA_TYPES, allIds, move } from './common';

const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;

function useIdField(content: QuestionnaireContent, original: string | null, initial: string) {
  const [id, setId] = useState(initial);
  const taken = useMemo(() => {
    const s = allIds(content);
    if (original) s.delete(original.toLowerCase());
    return s;
  }, [content, original]);
  const error = !ID_RE.test(id) ? '1 à 16 caractères : lettres, chiffres, - ou _' : taken.has(id.toLowerCase()) ? 'Identifiant déjà utilisé' : '';
  const field = (
    <TextField
      label="Identifiant"
      value={id}
      onChange={(e) => setId(e.target.value.trim())}
      error={!!error}
      helperText={error || 'Clé technique des réponses et des exports'}
      sx={{ width: { sm: 190 } }}
      inputProps={{ maxLength: 16, style: { fontFamily: 'monospace' } }}
    />
  );
  return { id, error, field };
}

function Shell({
  title,
  readOnly,
  canSave,
  onClose,
  onSave,
  issues,
  children,
  side,
  wide,
}: {
  title: string;
  readOnly: boolean;
  canSave: boolean;
  onClose: () => void;
  onSave: () => void;
  issues?: IssueWithSeverity[];
  children: ReactNode;
  side?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog
      open
      // while editing, only the buttons close the dialog: Escape / a click outside must not drop the changes
      onClose={(_, reason) => (readOnly || reason === undefined ? onClose() : undefined)}
      fullWidth
      maxWidth={wide || side ? 'lg' : 'md'}
      scroll="paper"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {!!issues?.length && (
          <Stack spacing={1} sx={{ mb: 2 }}>
            {issues.map((i, k) => (
              <Alert key={k} severity={i.severity === 'error' ? 'error' : 'warning'} variant="outlined">
                {i.message}
              </Alert>
            ))}
          </Stack>
        )}
        <Grid container spacing={3}>
          <Grid item xs={12} md={side ? 7 : 12}>
            <Box component="fieldset" disabled={readOnly} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
              <Stack spacing={2.5} sx={{ pt: 1 }}>
                {children}
              </Stack>
            </Box>
          </Grid>
          {side && (
            <Grid item xs={12} md={5}>
              {side}
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" variant="outlined" onClick={onClose}>
          {readOnly ? 'Fermer' : 'Annuler'}
        </Button>
        {!readOnly && (
          <Button variant="contained" onClick={onSave} disabled={!canSave}>
            Appliquer
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export type IssueWithSeverity = QIssue & { severity: 'error' | 'warning' };

interface Base<T> {
  item: T | null; // null = new
  defaults: T;
  content: QuestionnaireContent;
  readOnly: boolean;
  issues?: IssueWithSeverity[];
  onClose: () => void;
  onSave: (item: T) => void;
}

function OptionRows({
  rows,
  onChange,
  withPoints,
  min,
  max,
  placeholder,
  bestMark,
}: {
  rows: { txt: string; points?: number }[];
  onChange: (rows: { txt: string; points?: number }[]) => void;
  withPoints: boolean;
  min: number;
  max: number;
  placeholder: string;
  bestMark?: boolean;
}) {
  const best = Math.max(0, ...rows.map((r) => r.points ?? 0));
  const set = (i: number, patch: Partial<{ txt: string; points: number }>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <Stack spacing={1.25}>
      {rows.map((r, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ pt: 1.75, width: 22, typography: 'subtitle2', color: 'text.secondary', textAlign: 'center' }}>{String.fromCharCode(65 + i)}</Box>
          <TextField
            value={r.txt}
            onChange={(e) => set(i, { txt: e.target.value })}
            placeholder={placeholder}
            fullWidth
            multiline
            size="small"
            error={!r.txt.trim()}
          />
          {withPoints && (
            <TextField
              type="number"
              size="small"
              value={r.points ?? 0}
              onChange={(e) => set(i, { points: Math.round(Number(e.target.value) || 0) })}
              sx={{ width: 108, flexShrink: 0 }}
              InputProps={{
                endAdornment: <InputAdornment position="end">pts</InputAdornment>,
                startAdornment:
                  bestMark && best > 0 && (r.points ?? 0) === best ? (
                    <InputAdornment position="start">
                      <Tooltip title="Réponse la plus alignée">
                        <Box component="span" sx={{ display: 'flex' }}>
                          <Iconify icon="solar:star-bold" width={16} sx={{ color: 'warning.main' }} />
                        </Box>
                      </Tooltip>
                    </InputAdornment>
                  ) : undefined,
              }}
              inputProps={{ min: 0, max: 99, 'aria-label': 'Points' }}
            />
          )}
          <Stack direction="row" sx={{ flexShrink: 0 }}>
            <IconButton size="small" disabled={i === 0} onClick={() => onChange(move(rows, i, -1))} aria-label="Monter">
              <Iconify icon="solar:alt-arrow-up-linear" width={18} />
            </IconButton>
            <IconButton size="small" disabled={i === rows.length - 1} onClick={() => onChange(move(rows, i, 1))} aria-label="Descendre">
              <Iconify icon="solar:alt-arrow-down-linear" width={18} />
            </IconButton>
            <IconButton size="small" disabled={rows.length <= min} onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label="Supprimer" color="error">
              <Iconify icon="solar:trash-bin-minimalistic-linear" width={18} />
            </IconButton>
          </Stack>
        </Stack>
      ))}
      <Box>
        <Button
          size="small"
          startIcon={<Iconify icon="mingcute:add-line" />}
          disabled={rows.length >= max}
          onClick={() => onChange([...rows, withPoints ? { txt: '', points: 0 } : { txt: '' }])}
        >
          Ajouter une réponse
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {rows.length} / {max}
        </Typography>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------- situation (SJT)

export function SituationDialog({ item, defaults, content, readOnly, issues, onClose, onSave }: Base<Situation>) {
  const init = item ?? defaults;
  const idf = useIdField(content, item?.id ?? null, init.id);
  const [dim, setDim] = useState<DimKey | null>(init.dim);
  const [txt, setTxt] = useState(init.txt);
  const [aide, setAide] = useState(init.aide ?? '');
  const [options, setOptions] = useState(init.options.map((o) => ({ ...o })));
  const pts = options.map((o) => o.points ?? 0);
  const ok = !idf.error && dim && txt.trim() && options.length >= 2 && options.every((o) => o.txt.trim()) && Math.max(0, ...pts) > 0;
  return (
    <Shell
      title={item ? `Mise en situation ${item.id}` : 'Nouvelle mise en situation'}
      readOnly={readOnly}
      canSave={!!ok}
      issues={issues}
      onClose={onClose}
      onSave={() =>
        onSave({ id: idf.id, dim: dim!, txt: txt.trim(), ...(aide.trim() ? { aide: aide.trim() } : {}), options: options.map((o) => ({ txt: o.txt.trim(), points: o.points ?? 0 })) })
      }
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {idf.field}
        <DimSelect value={dim} onChange={setDim} fullWidth helperText="Valeur évaluée par cette situation" />
      </Stack>
      <TextField label="Situation" value={txt} onChange={(e) => setTxt(e.target.value)} multiline minRows={3} required placeholder="Décrivez un cas de travail concret, où plusieurs réactions sont défendables." />
      <TextField label="Aide (facultatif)" value={aide} onChange={(e) => setAide(e.target.value)} placeholder="Précision affichée sous la situation" />
      <Divider />
      <Box>
        <Typography variant="subtitle2">Réactions proposées</Typography>
        <Typography variant="caption" color="text.secondary">
          Entre 2 et 9 réponses. Les points mesurent l'alignement avec la valeur (ex. 3 = la plus alignée, 0 = la moins). L'ordre
          d'affichage est mélangé pour chaque répondant si l'option est active.
        </Typography>
      </Box>
      <OptionRows rows={options} onChange={(r) => setOptions(r as { txt: string; points: number }[])} withPoints min={2} max={9} placeholder="Réaction" bestMark />
      <Typography variant="caption" color="text.secondary">
        Maximum : {Math.max(0, ...pts)} pts · Les réponses ne sont jamais présentées avec leurs points.
      </Typography>
    </Shell>
  );
}

// ---------------------------------------------------------------- bloc (forced choice)

export function BlocDialog({ item, defaults, content, readOnly, issues, onClose, onSave }: Base<Bloc>) {
  const init = item ?? defaults;
  const idf = useIdField(content, item?.id ?? null, init.id);
  const [items, setItems] = useState(init.items.map((i) => ({ ...i })));
  const dims = items.map((i) => i.dim);
  const dup = new Set(dims).size !== dims.length;
  const ok = !idf.error && items.length >= 3 && items.every((i) => i.txt.trim() && i.dim) && !dup;
  const set = (k: number, p: Partial<Bloc['items'][number]>) => setItems(items.map((it, j) => (j === k ? { ...it, ...p } : it)));
  return (
    <Shell
      title={item ? `Bloc ${item.id}` : 'Nouveau bloc'}
      readOnly={readOnly}
      canSave={ok}
      issues={issues}
      onClose={onClose}
      onSave={() => onSave({ id: idf.id, items: items.map((i) => ({ txt: i.txt.trim(), dim: i.dim })) })}
    >
      {idf.field}
      <Typography variant="body2" color="text.secondary">
        Le répondant désigne l'affirmation qui lui ressemble le plus (+2 pour sa dimension) et le moins (−1). Toutes les
        affirmations doivent être positives et porter sur des dimensions différentes (3 à 6 affirmations).
      </Typography>
      {dup && <Alert severity="error">Deux affirmations portent sur la même dimension.</Alert>}
      {items.map((it, k) => (
        <Stack key={k} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
          <TextField label={`Affirmation ${k + 1}`} value={it.txt} onChange={(e) => set(k, { txt: e.target.value })} fullWidth multiline error={!it.txt.trim()} />
          <DimSelect value={it.dim} onChange={(d) => d && set(k, { dim: d })} sx={{ minWidth: 180 }} />
          <IconButton disabled={items.length <= 3} onClick={() => setItems(items.filter((_, j) => j !== k))} color="error" aria-label="Supprimer" sx={{ mt: 1 }}>
            <Iconify icon="solar:trash-bin-minimalistic-linear" />
          </IconButton>
        </Stack>
      ))}
      <Box>
        <Button
          size="small"
          startIcon={<Iconify icon="mingcute:add-line" />}
          disabled={items.length >= 6}
          onClick={() => setItems([...items, { txt: '', dim: (['H', 'C', 'A', 'P'] as DimKey[]).find((d) => !dims.includes(d)) ?? 'H' }])}
        >
          Ajouter une affirmation
        </Button>
      </Box>
    </Shell>
  );
}

// ---------------------------------------------------------------- Likert statement

export function LikertDialog({ item, defaults, content, readOnly, issues, onClose, onSave }: Base<LikertItem>) {
  const init = item ?? defaults;
  const idf = useIdField(content, item?.id ?? null, init.id);
  const [dim, setDim] = useState<DimKey | null>(init.dim);
  const [comp, setComp] = useState(init.comp);
  const [rev, setRev] = useState(init.rev);
  const [txt, setTxt] = useState(init.txt);
  const usedComps = useMemo(() => [...new Set(content.likert.map((l) => l.comp).filter(Boolean))].sort(), [content.likert]);
  const pairs = content.validite.filter((v) => v.kind === 'inc' && v.pair === item?.id);
  return (
    <Shell
      title={item ? `Énoncé ${item.id}` : 'Nouvel énoncé de pratique'}
      readOnly={readOnly}
      canSave={!idf.error && !!dim && !!txt.trim()}
      issues={issues}
      onClose={onClose}
      onSave={() => onSave({ id: idf.id, dim: dim!, comp: comp.trim(), rev, txt: txt.trim() })}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {idf.field}
        <DimSelect value={dim} onChange={setDim} fullWidth />
        <TextField
          label="Composante"
          value={comp}
          onChange={(e) => setComp(e.target.value)}
          sx={{ minWidth: 150 }}
          helperText={usedComps.length ? `Ex. ${usedComps.slice(0, 4).join(', ')}` : 'Sous-dimension (facultatif)'}
          inputProps={{ list: 'tac-comps', maxLength: 32 }}
        />
        <datalist id="tac-comps">
          {usedComps.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Stack>
      <TextField label="Énoncé" value={txt} onChange={(e) => setTxt(e.target.value)} multiline minRows={2} required placeholder="Je … (comportement observable, à la première personne)" />
      <FormControlLabel
        control={<Switch checked={rev} onChange={(e) => setRev(e.target.checked)} />}
        label={
          <Box>
            <Typography variant="body2">Formulation inversée</Typography>
            <Typography variant="caption" color="text.secondary">
              Comportement opposé à la valeur : « {content.echelle.at(-1)?.label ?? 'toujours'} » fait baisser le score.
            </Typography>
          </Box>
        }
      />
      {pairs.length > 0 && (
        <Alert severity="info" variant="outlined">
          Apparié à {pairs.map((p) => p.id).join(', ')} (contrôle de cohérence).
        </Alert>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- validity item

export function ValiditeDialog({ item, defaults, content, readOnly, issues, onClose, onSave }: Base<ValiditeItem>) {
  const init = item ?? defaults;
  const idf = useIdField(content, item?.id ?? null, init.id);
  const [kind, setKind] = useState(init.kind);
  const [txt, setTxt] = useState(init.txt);
  const [pair, setPair] = useState(init.pair ?? '');
  const [opp, setOpp] = useState(!!init.opp);
  const ok = !idf.error && txt.trim() && (kind === 'ds' || content.likert.some((l) => l.id === pair));
  const top = content.echelle.at(-1)?.label ?? 'le niveau maximal';
  return (
    <Shell
      title={item ? `Item de contrôle ${item.id}` : 'Nouvel item de contrôle'}
      readOnly={readOnly}
      canSave={!!ok}
      issues={issues}
      onClose={onClose}
      onSave={() => onSave(kind === 'ds' ? { id: idf.id, kind, txt: txt.trim() } : { id: idf.id, kind, txt: txt.trim(), pair, opp })}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {idf.field}
        <TextField select label="Type de contrôle" value={kind} onChange={(e) => setKind(e.target.value as 'ds' | 'inc')} fullWidth>
          <MenuItem value="ds">
            <ListItemText primary="Désirabilité sociale" secondary={`Affirmation irréaliste : répondre « ${top} » signale une image embellie`} />
          </MenuItem>
          <MenuItem value="inc">
            <ListItemText primary="Cohérence (item jumeau)" secondary="Reformulation d'un énoncé : un écart important signale des réponses incohérentes" />
          </MenuItem>
        </TextField>
      </Stack>
      <TextField label="Énoncé" value={txt} onChange={(e) => setTxt(e.target.value)} multiline minRows={2} required />
      {kind === 'inc' && (
        <>
          <TextField select label="Énoncé jumeau" value={pair} onChange={(e) => setPair(e.target.value)} error={!content.likert.some((l) => l.id === pair)}>
            {content.likert.map((l) => (
              <MenuItem key={l.id} value={l.id} sx={{ whiteSpace: 'normal' }}>
                <Typography component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>
                  {l.id}
                </Typography>
                {l.txt}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Switch checked={opp} onChange={(e) => setOpp(e.target.checked)} />}
            label="Sens opposé (la réponse attendue est l'inverse de celle de l'énoncé jumeau)"
          />
        </>
      )}
      <Typography variant="caption" color="text.secondary">
        Les items de contrôle sont mêlés aux énoncés de pratique et ne comptent pas dans les scores. Les seuils se règlent dans
        l'onglet « Échelle et calcul ».
      </Typography>
    </Shell>
  );
}

// ---------------------------------------------------------------- complementary question

const TYPE_DEFAULTS: Record<ExtraType, Partial<ExtraQuestion>> = {
  single: { options: [{ txt: '', points: 0 }, { txt: '', points: 0 }], shuffle: false },
  multiple: { options: [{ txt: '', points: 0 }, { txt: '', points: 0 }, { txt: '', points: 0 }], minChoices: 1, maxChoices: 0, shuffle: false },
  yesno: { labels: ['Oui', 'Non'], pointsOui: 1, pointsNon: 0 },
  scale: { min: 0, max: 10, step: 1, minLabel: '', maxLabel: '', rev: false },
  ranking: { options: [{ txt: '' }, { txt: '' }, { txt: '' }], shuffle: true },
  text: { multiline: true, maxLength: 1000 },
};

export function ExtraDialog({ item, defaults, content, readOnly, issues, onClose, onSave }: Base<ExtraQuestion>) {
  const init = item ?? defaults;
  const idf = useIdField(content, item?.id ?? null, init.id);
  const [q, setQ] = useState<ExtraQuestion>({ ...TYPE_DEFAULTS[init.type], ...init });
  const [preview, setPreview] = useState<ExtraValue | undefined>(undefined);
  const set = (p: Partial<ExtraQuestion>) => setQ((x) => ({ ...x, ...p }));
  const changeType = (t: ExtraType) => {
    const keep = q.options && TYPE_DEFAULTS[t].options ? { options: q.options.map((o) => (t === 'ranking' ? { txt: o.txt } : { txt: o.txt, points: o.points ?? 0 })) } : {};
    setQ({ id: q.id, txt: q.txt, aide: q.aide, required: q.required, dim: q.dim, scored: t !== 'text' && t !== 'ranking' && q.scored, showIf: q.showIf, type: t, ...TYPE_DEFAULTS[t], ...keep });
    setPreview(undefined);
  };
  const idx = item ? content.extras.findIndex((e) => e.id === item.id) : content.extras.length;
  const parents = content.extras.slice(0, idx).filter((e) => ['single', 'multiple', 'yesno'].includes(e.type));
  const parent = parents.find((p) => p.id === q.showIf?.question);
  const scorable = ['single', 'multiple', 'yesno', 'scale'].includes(q.type);
  const hasOptions = q.type === 'single' || q.type === 'multiple' || q.type === 'ranking';
  const optsOk = !hasOptions || ((q.options?.length ?? 0) >= 2 && q.options!.every((o) => o.txt.trim()));
  const scaleOk = q.type !== 'scale' || ((q.min ?? 0) < (q.max ?? 10) && ((q.max ?? 10) - (q.min ?? 0)) / (q.step || 1) <= 100);
  const scoreOk = !q.scored || (!!q.dim && (q.type !== 'single' && q.type !== 'multiple' ? true : Math.max(0, ...(q.options ?? []).map((o) => o.points ?? 0)) > 0));
  const showOk = !q.showIf || (!!parent && q.showIf.values.length > 0);
  const ok = !idf.error && q.txt.trim() && optsOk && scaleOk && scoreOk && showOk;
  const finalQ: ExtraQuestion = { ...q, id: idf.id, txt: q.txt.trim(), scored: scorable && q.scored, dim: scorable && q.scored ? q.dim : q.type === 'text' ? null : q.dim };

  const parentValues: { v: number | boolean; label: string }[] = parent
    ? parent.type === 'yesno'
      ? [
          { v: true, label: parent.labels?.[0] ?? 'Oui' },
          { v: false, label: parent.labels?.[1] ?? 'Non' },
        ]
      : (parent.options ?? []).map((o, k) => ({ v: k, label: o.txt || `Réponse ${k + 1}` }))
    : [];

  return (
    <Shell
      title={item ? `Question ${item.id}` : 'Nouvelle question complémentaire'}
      readOnly={readOnly}
      canSave={!!ok}
      issues={issues}
      onClose={onClose}
      onSave={() => onSave(finalQ)}
      side={
        <Box sx={{ position: { md: 'sticky' }, top: 0 }}>
          <Typography variant="overline" color="text.secondary">
            Aperçu répondant
          </Typography>
          <Card variant="outlined" sx={{ p: 2.25, mt: 1, bgcolor: 'background.neutral' }}>
            <Typography sx={{ fontWeight: 600 }}>
              {q.txt || 'Texte de la question'}
              {!q.required && (
                <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                  (facultatif)
                </Typography>
              )}
            </Typography>
            {q.aide && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {q.aide}
              </Typography>
            )}
            <Box sx={{ mt: 2 }}>
              <ExtraInput e={{ ...finalQ, options: (q.options ?? []).map((o, k) => ({ ...o, txt: o.txt || `Réponse ${k + 1}` })) }} value={preview} onChange={(v) => setPreview(v ?? undefined)} />
            </Box>
          </Card>
          {q.scored && q.dim && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Notée sur la dimension sélectionnée : son poids se règle dans « Échelle et calcul ».
            </Typography>
          )}
        </Box>
      }
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {idf.field}
        <TextField select label="Type de réponse" value={q.type} onChange={(e) => changeType(e.target.value as ExtraType)} fullWidth>
          {(Object.keys(EXTRA_TYPES) as ExtraType[]).map((t) => (
            <MenuItem key={t} value={t}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Iconify icon={EXTRA_TYPES[t].icon} sx={{ color: 'primary.main' }} />
                <ListItemText primary={EXTRA_TYPES[t].label} secondary={EXTRA_TYPES[t].help} />
              </Stack>
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <TextField label="Question" value={q.txt} onChange={(e) => set({ txt: e.target.value })} multiline minRows={2} required />
      <TextField label="Aide (facultatif)" value={q.aide ?? ''} onChange={(e) => set({ aide: e.target.value })} />
      <FormControlLabel control={<Switch checked={q.required} onChange={(e) => set({ required: e.target.checked })} />} label="Réponse obligatoire" />

      {hasOptions && (
        <>
          <Divider />
          <Typography variant="subtitle2">{q.type === 'ranking' ? 'Propositions à classer' : 'Réponses proposées'}</Typography>
          <OptionRows
            rows={q.options ?? []}
            onChange={(options) => set({ options })}
            withPoints={q.type !== 'ranking' && q.scored}
            min={2}
            max={20}
            placeholder="Réponse"
            bestMark={q.type === 'single'}
          />
          <FormControlLabel control={<Switch checked={!!q.shuffle} onChange={(e) => set({ shuffle: e.target.checked })} />} label="Mélanger l'ordre pour chaque répondant" />
        </>
      )}
      {q.type === 'multiple' && (
        <Stack direction="row" spacing={2}>
          <TextField type="number" label="Choix minimum" value={q.minChoices ?? 1} onChange={(e) => set({ minChoices: Math.max(0, Number(e.target.value) || 0) })} fullWidth />
          <TextField
            type="number"
            label="Choix maximum"
            value={q.maxChoices ?? 0}
            onChange={(e) => set({ maxChoices: Math.max(0, Number(e.target.value) || 0) })}
            helperText="0 = pas de limite"
            fullWidth
            error={!!q.maxChoices && (q.minChoices ?? 0) > q.maxChoices}
          />
        </Stack>
      )}
      {q.type === 'yesno' && (
        <Stack direction="row" spacing={2}>
          <TextField label="Libellé « oui »" value={q.labels?.[0] ?? 'Oui'} onChange={(e) => set({ labels: [e.target.value, q.labels?.[1] ?? 'Non'] })} fullWidth />
          <TextField label="Libellé « non »" value={q.labels?.[1] ?? 'Non'} onChange={(e) => set({ labels: [q.labels?.[0] ?? 'Oui', e.target.value] })} fullWidth />
        </Stack>
      )}
      {q.type === 'scale' && (
        <>
          <Stack direction="row" spacing={2}>
            <TextField type="number" label="Minimum" value={q.min ?? 0} onChange={(e) => set({ min: Math.round(Number(e.target.value) || 0) })} fullWidth />
            <TextField type="number" label="Maximum" value={q.max ?? 10} onChange={(e) => set({ max: Math.round(Number(e.target.value) || 0) })} fullWidth error={!scaleOk} />
            <TextField type="number" label="Pas" value={q.step ?? 1} onChange={(e) => set({ step: Math.max(1, Math.round(Number(e.target.value) || 1)) })} fullWidth />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField label="Libellé du minimum" value={q.minLabel ?? ''} onChange={(e) => set({ minLabel: e.target.value })} placeholder="Pas du tout" fullWidth />
            <TextField label="Libellé du maximum" value={q.maxLabel ?? ''} onChange={(e) => set({ maxLabel: e.target.value })} placeholder="Tout à fait" fullWidth />
          </Stack>
        </>
      )}
      {q.type === 'text' && (
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField type="number" label="Longueur maximale" value={q.maxLength ?? 1000} onChange={(e) => set({ maxLength: Math.min(4000, Math.max(1, Number(e.target.value) || 1)) })} sx={{ width: 200 }} InputProps={{ endAdornment: <InputAdornment position="end">car.</InputAdornment> }} />
          <FormControlLabel control={<Switch checked={q.multiline !== false} onChange={(e) => set({ multiline: e.target.checked })} />} label="Plusieurs lignes" />
        </Stack>
      )}
      {q.type === 'text' && (
        <Alert severity="warning" variant="outlined">
          Les réponses libres sont des données personnelles potentielles : elles ne sont jamais notées ni transmises à l'IA, et ne
          sont consultables qu'en liste anonymisée, au-delà du seuil d'anonymat des statistiques.
        </Alert>
      )}

      {scorable && (
        <>
          <Divider />
          <FormControlLabel
            control={<Switch checked={q.scored} onChange={(e) => set({ scored: e.target.checked, dim: e.target.checked ? q.dim ?? 'H' : q.dim })} />}
            label={
              <Box>
                <Typography variant="body2">Compter dans le score</Typography>
                <Typography variant="caption" color="text.secondary">
                  Sinon la question est seulement descriptive (statistiques par réponse).
                </Typography>
              </Box>
            }
          />
          {q.scored && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <DimSelect value={q.dim} onChange={(d) => set({ dim: d })} fullWidth />
              {q.type === 'yesno' && (
                <>
                  <TextField type="number" label={`Points « ${q.labels?.[0] ?? 'Oui'} »`} value={q.pointsOui ?? 1} onChange={(e) => set({ pointsOui: Math.round(Number(e.target.value) || 0) })} fullWidth />
                  <TextField type="number" label={`Points « ${q.labels?.[1] ?? 'Non'} »`} value={q.pointsNon ?? 0} onChange={(e) => set({ pointsNon: Math.round(Number(e.target.value) || 0) })} fullWidth />
                </>
              )}
              {q.type === 'scale' && (
                <FormControlLabel control={<Switch checked={!!q.rev} onChange={(e) => set({ rev: e.target.checked })} />} label="Inversée (le minimum est le plus aligné)" sx={{ minWidth: 260 }} />
              )}
            </Stack>
          )}
        </>
      )}

      <Divider />
      <FormControlLabel
        control={
          <Switch
            checked={!!q.showIf}
            disabled={!parents.length}
            onChange={(e) => set({ showIf: e.target.checked ? { question: parents.at(-1)!.id, values: [] } : null })}
          />
        }
        label={
          <Box>
            <Typography variant="body2">Affichage conditionnel</Typography>
            <Typography variant="caption" color="text.secondary">
              {parents.length
                ? 'Ne poser cette question que selon la réponse à une question précédente.'
                : 'Ajoutez avant elle une question à choix ou oui/non pour utiliser une condition.'}
            </Typography>
          </Box>
        }
      />
      {q.showIf && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select label="Si la question" value={q.showIf.question} onChange={(e) => set({ showIf: { question: e.target.value, values: [] } })} sx={{ minWidth: 240 }}>
            {parents.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.id} — {p.txt.slice(0, 60) || '(sans texte)'}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="a pour réponse"
            fullWidth
            value={q.showIf.values.map(String)}
            SelectProps={{
              multiple: true,
              renderValue: (sel) =>
                (sel as string[]).map((s) => parentValues.find((p) => String(p.v) === s)?.label ?? s).join(' ou '),
            }}
            onChange={(e) => {
              const raw = e.target.value as unknown as string[];
              set({ showIf: { question: q.showIf!.question, values: raw.map((s) => (s === 'true' ? true : s === 'false' ? false : Number(s))) } });
            }}
            error={!q.showIf.values.length}
            helperText={!q.showIf.values.length ? 'Choisissez au moins une réponse' : 'Plusieurs réponses = l’une ou l’autre'}
          >
            {parentValues.map((p) => (
              <MenuItem key={String(p.v)} value={String(p.v)}>
                <Checkbox size="small" checked={q.showIf!.values.map(String).includes(String(p.v))} />
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}
    </Shell>
  );
}
