import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { LabelColor } from '@vionhub/design-system/components';
import {
  Iconify,
  Label,
  Scrollbar,
  TableHeadCustom,
  toast,
} from '@vionhub/design-system/components';
import { SunuBreadcrumbs } from '../brand';

import { api } from '../../shared/api';
import { Link as RouterLink } from 'react-router-dom';
import type { Campaign, QuestionnaireSummary, Tirage, TirageCheck, TirageKey } from '../../shared/types';
import { useSession } from '../session';
import { errMsg, fDateTime, fromLocalInput, invalidateCampaigns, toLocalInput, useAsync } from '../lib';

const TIRAGE_FIELDS: { key: TirageKey; label: string }[] = [
  { key: 'situations', label: 'Mises en situation' },
  { key: 'blocs', label: 'Blocs de choix forcé' },
  { key: 'likert', label: 'Énoncés de pratique' },
  { key: 'validite', label: 'Items de contrôle' },
];

function tirageSummary(t: Tirage | null | undefined): string | null {
  if (!t || !Object.keys(t).length) return null;
  return TIRAGE_FIELDS.filter((f) => t[f.key]).map((f) => `${t[f.key]} ${f.label.toLowerCase()}`).join(', ');
}

function status(c: Campaign): { label: string; color: LabelColor } {
  const now = Date.now();
  if (!c.active) return { label: 'Inactive', color: 'default' };
  if (c.opens_at && now < new Date(c.opens_at).getTime()) return { label: 'Programmée', color: 'info' };
  if (c.closes_at && now > new Date(c.closes_at).getTime()) return { label: 'Clôturée', color: 'warning' };
  return { label: 'Ouverte', color: 'success' };
}

export function CampaignsPage() {
  const { me } = useSession();
  const admin = me.is_hr_admin;
  const list = useAsync(() => api.campaigns(), []);
  const qs = useAsync(() => api.questionnaires(), []);
  const qById = new Map((qs.data ?? []).map((q) => [q.id, q]));
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = () => {
    invalidateCampaigns();
    list.reload();
    qs.reload();
  };

  const toggle = async (c: Campaign) => {
    setBusyId(c.id);
    try {
      await api.patchCampaign(c.id, { active: !c.active });
      toast.success(`Campagne ${c.code} ${c.active ? 'désactivée' : 'activée'}.`);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const head = [
    { id: 'code', label: 'Code' },
    { id: 'label', label: 'Libellé', minWidth: 220 },
    { id: 'opens', label: 'Ouverture', minWidth: 140 },
    { id: 'closes', label: 'Clôture', minWidth: 140 },
    { id: 'questionnaire', label: 'Questionnaire', minWidth: 180 },
    { id: 'status', label: 'Statut' },
    { id: 'active', label: 'Active', align: 'center' as const },
    ...(admin ? [{ id: 'actions', label: '', width: 56 }] : []),
  ];

  return (
    <Stack spacing={3}>
      <SunuBreadcrumbs
        heading="Campagnes"
        links={[{ name: 'Console DRH', href: '/' }, { name: 'Campagnes' }]}
        action={
          admin && (
            <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setEditing('new')}>
              Nouvelle campagne
            </Button>
          )
        }
      />

      <Typography sx={{ color: 'text.secondary', maxWidth: 760 }}>
        Une campagne (T0, T+12, T+24…) regroupe les passations d'une même vague de mesure. Le test n'est proposé aux
        collaborateurs que pour les campagnes actives, entre leurs dates d'ouverture et de clôture.
      </Typography>

      {!admin && (
        <Alert severity="info">La création et la modification des campagnes sont réservées à la DRH Groupe.</Alert>
      )}
      {list.error && <Alert severity="error">{list.error}</Alert>}

      <Card>
        {list.loading && <LinearProgress sx={{ height: 2 }} />}
        <TableContainer>
          <Scrollbar>
            <Table sx={{ minWidth: 820 }}>
              <TableHeadCustom headLabel={head} />
              <TableBody>
                {(list.data ?? []).map((c) => {
                  const st = status(c);
                  return (
                    <TableRow key={c.id} hover>
                      <TableCell>
                        <Label color="primary" variant="soft">
                          {c.code}
                        </Label>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{c.label}</TableCell>
                      <TableCell>{fDateTime(c.opens_at)}</TableCell>
                      <TableCell>{fDateTime(c.closes_at)}</TableCell>
                      <TableCell>
                        {c.questionnaire_id && qById.get(c.questionnaire_id) ? (
                          <Tooltip title={qById.get(c.questionnaire_id)!.label}>
                            <RouterLink to={`/questionnaires/${c.questionnaire_id}`} style={{ textDecoration: 'none' }}>
                              <Label variant="soft" color="secondary" startIcon={<Iconify icon="solar:document-text-linear" />} sx={{ cursor: 'pointer' }}>
                                v{qById.get(c.questionnaire_id)!.version}
                              </Label>
                            </RouterLink>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                        {tirageSummary(c.tirage) && (
                          <Tooltip title={`Tirage aléatoire par collaborateur : ${tirageSummary(c.tirage)}`}>
                            <Label variant="soft" color="info" startIcon={<Iconify icon="solar:shuffle-bold" />} sx={{ ml: 0.5 }}>
                              Tirage
                            </Label>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <Label color={st.color}>{st.label}</Label>
                      </TableCell>
                      <TableCell align="center">
                        {admin ? (
                          <Switch
                            checked={c.active}
                            disabled={busyId === c.id}
                            onChange={() => toggle(c)}
                            inputProps={{ 'aria-label': `Activer ${c.code}` }}
                          />
                        ) : (
                          <Iconify
                            icon={c.active ? 'solar:check-circle-bold' : 'solar:close-circle-bold'}
                            sx={{ color: c.active ? 'success.main' : 'text.disabled' }}
                          />
                        )}
                      </TableCell>
                      {admin && (
                        <TableCell>
                          <Tooltip title="Modifier">
                            <IconButton onClick={() => setEditing(c)}>
                              <Iconify icon="solar:pen-bold" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {!list.loading && !list.data?.length && (
                  <TableRow>
                    <TableCell colSpan={head.length} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      Aucune campagne.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Scrollbar>
        </TableContainer>
      </Card>

      {editing && (
        <CampaignDialog
          campaign={editing === 'new' ? null : editing}
          questionnaires={qs.data ?? []}
          nextPosition={(list.data ?? []).reduce((m, c) => Math.max(m, c.position), -1) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </Stack>
  );
}

function CampaignDialog({
  campaign,
  questionnaires,
  nextPosition,
  onClose,
  onSaved,
}: {
  campaign: Campaign | null;
  questionnaires: QuestionnaireSummary[];
  nextPosition: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(campaign?.code ?? '');
  const [label, setLabel] = useState(campaign?.label ?? '');
  const [opens, setOpens] = useState(toLocalInput(campaign?.opens_at));
  const [closes, setCloses] = useState(toLocalInput(campaign?.closes_at));
  const [active, setActive] = useState(campaign?.active ?? false);
  const published = questionnaires.filter((q) => q.status === 'published' || q.id === campaign?.questionnaire_id);
  const [qid, setQid] = useState<number | ''>(campaign?.questionnaire_id ?? published[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [drawOn, setDrawOn] = useState(!!tirageSummary(campaign?.tirage));
  const [counts, setCounts] = useState<Record<TirageKey, string>>(() => {
    const t = campaign?.tirage ?? {};
    return { situations: '', blocs: '', likert: '', validite: '', ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, String(v ?? '')])) };
  });
  const [check, setCheck] = useState<TirageCheck>();

  const tirage: Tirage | null = drawOn
    ? Object.fromEntries(
        TIRAGE_FIELDS.map((f) => [f.key, parseInt(counts[f.key], 10)]).filter(([, v]) => Number.isFinite(v) && (v as number) > 0),
      )
    : null;
  const tirageKey = JSON.stringify(tirage);

  // live preview: questions available in the chosen questionnaire, coverage errors and warnings
  useEffect(() => {
    if (qid === '') return undefined;
    const t = setTimeout(() => {
      api.tirageCheck(qid, tirage).then(setCheck).catch(() => setCheck(undefined));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid, tirageKey]);

  const drawErrors = drawOn ? (check?.errors ?? []) : [];
  const datesInvalid = !!opens && !!closes && new Date(opens) >= new Date(closes);
  const canSave = code.trim() && label.trim() && !datesInvalid && !busy && !drawErrors.length;

  const save = async () => {
    setBusy(true);
    setError(undefined);
    const body = {
      label: label.trim(),
      opens_at: fromLocalInput(opens),
      closes_at: fromLocalInput(closes),
      active,
      ...(qid !== '' && qid !== campaign?.questionnaire_id ? { questionnaire_id: qid } : {}),
      tirage: tirage && Object.keys(tirage).length ? tirage : null,
    };
    try {
      if (campaign) {
        await api.patchCampaign(campaign.id, body);
        toast.success(`Campagne ${campaign.code} mise à jour.`);
      } else {
        await api.createCampaign({ ...body, code: code.trim(), position: nextPosition });
        toast.success(`Campagne ${code.trim()} créée.`);
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{campaign ? `Modifier la campagne ${campaign.code}` : 'Nouvelle campagne'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!!campaign}
              required
              placeholder="T+36"
              helperText={campaign ? 'Non modifiable' : 'Ex. T+36'}
              inputProps={{ maxLength: 32 }}
              sx={{ width: { sm: 180 } }}
            />
            <TextField
              label="Libellé"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              fullWidth
              placeholder="T+36 — Mesure à 36 mois"
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              type="datetime-local"
              label="Ouverture"
              value={opens}
              onChange={(e) => setOpens(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              helperText="Vide : pas de date de début"
            />
            <TextField
              type="datetime-local"
              label="Clôture"
              value={closes}
              onChange={(e) => setCloses(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              error={datesInvalid}
              helperText={datesInvalid ? 'La clôture doit suivre l’ouverture.' : 'Vide : pas de date de fin'}
            />
          </Stack>
          <TextField
            select
            label="Questionnaire"
            value={qid}
            onChange={(e) => setQid(Number(e.target.value))}
            helperText="Seules les versions publiées peuvent être utilisées. Le questionnaire ne peut plus changer une fois des réponses reçues."
          >
            {published.map((q) => (
              <MenuItem key={q.id} value={q.id}>
                v{q.version} — {q.label}
                {q.status !== 'published' ? ' (archivée)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ p: 2, borderRadius: 1.5, border: (t) => `1px dashed ${t.palette.divider}` }}>
            <FormControlLabel
              control={<Switch checked={drawOn} onChange={(e) => setDrawOn(e.target.checked)} />}
              label="Tirer au sort les questions de chaque collaborateur"
            />
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Chaque collaborateur reçoit un sous-ensemble aléatoire de la banque, équilibré entre les dimensions. Il
              retrouve toujours les mêmes questions s'il reprend son test. Laissez un champ vide pour poser toutes les
              questions de la catégorie. Les questions complémentaires sont toujours toutes posées.
            </Typography>
            {drawOn && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  {TIRAGE_FIELDS.map((f) => {
                    const max = check?.available[f.key];
                    const v = parseInt(counts[f.key], 10);
                    return (
                      <TextField
                        key={f.key}
                        type="number"
                        size="small"
                        label={f.label}
                        value={counts[f.key]}
                        onChange={(e) => setCounts((c) => ({ ...c, [f.key]: e.target.value }))}
                        placeholder="Toutes"
                        inputProps={{ min: 1, max }}
                        InputLabelProps={{ shrink: true }}
                        helperText={max != null ? (Number.isFinite(v) && v > 0 ? `${Math.min(v, max)} sur ${max}` : `Toutes (${max})`) : ' '}
                      />
                    );
                  })}
                </Box>
                {drawErrors.map((m) => (
                  <Alert key={m} severity="error">
                    {m}
                  </Alert>
                ))}
                {(check?.warnings ?? []).map((m) => (
                  <Alert key={m} severity="warning">
                    {m}
                  </Alert>
                ))}
              </Stack>
            )}
            {campaign && (
              <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 1 }}>
                Le tirage ne peut plus changer une fois des réponses reçues.
              </Typography>
            )}
          </Box>
          <Box>
            <FormControlLabel
              control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
              label="Campagne active"
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" variant="outlined" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="contained" onClick={save} disabled={!canSave}>
          {campaign ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
