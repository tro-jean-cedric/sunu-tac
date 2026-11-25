/** Questionnaire versions: list, create (copy / original bank / blank / JSON import), publish, archive, export. */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Iconify, Label, toast } from '@vionhub/design-system/components';

import { api } from '../../shared/api';
import type { QuestionnaireSummary } from '../../shared/types';
import { SunuBreadcrumbs } from '../brand';
import { EmptyState } from '../components';
import { errMsg, fDateTime, invalidateCampaigns, useAsync } from '../lib';
import { useSession } from '../session';
import { STATUS, useConfirm } from './questionnaire/common';

export function QuestionnairesPage() {
  const { me } = useSession();
  const admin = me.is_hr_admin;
  const nav = useNavigate();
  const list = useAsync(() => api.questionnaires(), []);
  const [creating, setCreating] = useState<{ fromId?: number } | null>(null);
  const [confirm, confirmUi] = useConfirm();

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      invalidateCampaigns();
      list.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const rows = list.data ?? [];

  return (
    <Stack spacing={3}>
      <SunuBreadcrumbs
        heading="Questionnaires"
        links={[{ name: 'Console DRH', href: '/' }, { name: 'Questionnaires' }]}
        action={
          admin && (
            <Button variant="contained" startIcon={<Iconify icon="mingcute:add-line" />} onClick={() => setCreating({})}>
              Nouveau questionnaire
            </Button>
          )
        }
      />

      <Typography sx={{ color: 'text.secondary', maxWidth: 860 }}>
        Chaque campagne utilise une <strong>version publiée</strong> du questionnaire. Un brouillon se modifie librement ;
        une fois publié il est figé, afin que les résultats déjà reçus restent interprétables. Pour faire évoluer un
        questionnaire, créez une nouvelle version à partir de lui, puis affectez-la à une campagne (menu Campagnes).
      </Typography>

      {!admin && <Alert severity="info">La modification des questionnaires est réservée à la DRH Groupe.</Alert>}
      {list.error && <Alert severity="error">{list.error}</Alert>}
      {list.loading && !list.data && <LinearProgress />}

      {!list.loading && !rows.length && <EmptyState title="Aucun questionnaire" />}

      <Stack spacing={2}>
        {rows.map((q) => (
          <VersionCard
            key={q.id}
            q={q}
            admin={admin}
            onOpen={() => nav(`/questionnaires/${q.id}`)}
            onCopy={() => setCreating({ fromId: q.id })}
            onPublish={() =>
              confirm({
                title: `Publier la version ${q.version} ?`,
                body: 'Une fois publiée, cette version ne pourra plus être modifiée. Elle pourra être affectée à une campagne.',
                ok: 'Publier',
              }).then((y) => {
                if (y) run(() => api.publishQuestionnaire(q.id), `Version ${q.version} publiée.`);
              })
            }
            onArchive={() => run(() => api.archiveQuestionnaire(q.id), `Version ${q.version} archivée.`)}
            onRestore={() => run(() => api.restoreQuestionnaire(q.id), `Version ${q.version} restaurée.`)}
            onDelete={() =>
              confirm({
                title: `Supprimer la version ${q.version} ?`,
                body: `« ${q.label} » sera définitivement supprimée.`,
                ok: 'Supprimer',
                danger: true,
              }).then((y) => {
                if (y) run(() => api.deleteQuestionnaire(q.id), `Version ${q.version} supprimée.`);
              })
            }
          />
        ))}
      </Stack>

      {creating && (
        <CreateDialog
          versions={rows}
          fromId={creating.fromId}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            nav(`/questionnaires/${id}`);
          }}
        />
      )}
      {confirmUi}
    </Stack>
  );
}

function VersionCard({
  q,
  admin,
  onOpen,
  onCopy,
  onPublish,
  onArchive,
  onRestore,
  onDelete,
}: {
  q: QuestionnaireSummary;
  admin: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const st = STATUS[q.status];
  const c = q.stats.counts;
  const parts = [
    [c.situations, 'situations'],
    [c.blocs, 'blocs'],
    [c.likert, 'énoncés'],
    [c.validite, 'contrôles'],
    [c.extras, 'complémentaires'],
  ] as const;
  const close = (fn: () => void) => () => {
    setAnchor(null);
    fn();
  };

  return (
    <Card sx={{ p: { xs: 2, md: 2.5 }, opacity: q.status === 'archived' ? 0.75 : 1 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            typography: 'h6',
            bgcolor: q.status === 'published' ? 'primary.main' : 'background.neutral',
            color: q.status === 'published' ? 'primary.contrastText' : 'text.secondary',
          }}
        >
          v{q.version}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" sx={{ cursor: 'pointer' }} onClick={onOpen}>
              {q.label}
            </Typography>
            <Label color={st.color} startIcon={<Iconify icon={st.icon} />}>
              {st.label}
            </Label>
          </Stack>
          {q.description && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {q.description}
            </Typography>
          )}
          <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            {parts
              .filter(([n], i) => n || i < 4)
              .map(([n, l]) => (
                <Chip key={l} size="small" variant="outlined" label={`${n} ${l}`} />
              ))}
            <Chip size="small" variant="outlined" icon={<Iconify icon="solar:clock-circle-linear" width={16} />} label={`≈ ${q.stats.duration_min} min`} />
          </Stack>
        </Box>
        <Stack spacing={0.5} sx={{ minWidth: 200 }}>
          <Typography variant="caption" color="text.secondary">
            Campagnes
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {q.campaigns.length ? (
              q.campaigns.map((cp) => (
                <Tooltip key={cp.id} title={`${cp.label}${cp.open ? ' — ouverte' : ''}`}>
                  <Label color={cp.open ? 'success' : 'default'} variant="soft">
                    {cp.code}
                  </Label>
                </Tooltip>
              ))
            ) : (
              <Typography variant="body2" color="text.disabled">
                Aucune
              </Typography>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {q.submissions} réponse{q.submissions > 1 ? 's' : ''} ·{' '}
            {q.status === 'draft' ? `modifié ${fDateTime(q.updated_at ?? q.created_at)}` : `publié ${fDateTime(q.published_at)}`}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" color="inherit" onClick={onOpen} startIcon={<Iconify icon={q.status === 'draft' && admin ? 'solar:pen-bold' : 'solar:eye-bold'} />}>
            {q.status === 'draft' && admin ? 'Modifier' : 'Consulter'}
          </Button>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Actions">
            <Iconify icon="eva:more-vertical-fill" />
          </IconButton>
        </Stack>
      </Stack>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {admin && q.status === 'draft' && (
          <MenuItem onClick={close(onPublish)}>
            <ListItemIcon>
              <Iconify icon="solar:verified-check-bold" />
            </ListItemIcon>
            Publier
          </MenuItem>
        )}
        {admin && (
          <MenuItem onClick={close(onCopy)}>
            <ListItemIcon>
              <Iconify icon="solar:copy-bold" />
            </ListItemIcon>
            Nouvelle version à partir de celle-ci
          </MenuItem>
        )}
        {admin && (
          <MenuItem component="a" href={api.questionnaireExportUrl(q.id)} onClick={() => setAnchor(null)}>
            <ListItemIcon>
              <Iconify icon="solar:download-minimalistic-bold" />
            </ListItemIcon>
            Exporter (JSON)
          </MenuItem>
        )}
        {admin && q.status === 'published' && (
          <MenuItem onClick={close(onArchive)}>
            <ListItemIcon>
              <Iconify icon="solar:archive-bold" />
            </ListItemIcon>
            Archiver
          </MenuItem>
        )}
        {admin && q.status === 'archived' && (
          <MenuItem onClick={close(onRestore)}>
            <ListItemIcon>
              <Iconify icon="solar:restart-bold" />
            </ListItemIcon>
            Restaurer
          </MenuItem>
        )}
        {admin && q.status !== 'published' && !q.campaigns.length && <Divider />}
        {admin && q.status !== 'published' && !q.campaigns.length && (
          <MenuItem onClick={close(onDelete)} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <Iconify icon="solar:trash-bin-trash-bold" sx={{ color: 'error.main' }} />
            </ListItemIcon>
            Supprimer
          </MenuItem>
        )}
        {!admin && (
          <MenuItem onClick={close(onOpen)}>
            <ListItemIcon>
              <Iconify icon="solar:eye-bold" />
            </ListItemIcon>
            Consulter
          </MenuItem>
        )}
      </Menu>
    </Card>
  );
}

type Source = 'copy' | 'origine' | 'vide' | 'import';

function CreateDialog({
  versions,
  fromId,
  onClose,
  onCreated,
}: {
  versions: QuestionnaireSummary[];
  fromId?: number;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const latest = versions.find((v) => v.status === 'published') ?? versions[0];
  const [source, setSource] = useState<Source>(fromId || latest ? 'copy' : 'origine');
  const [copyId, setCopyId] = useState<number | ''>(fromId ?? latest?.id ?? '');
  const src = versions.find((v) => v.id === copyId);
  const [label, setLabel] = useState(src ? `${src.label} — révision` : '');
  const [description, setDescription] = useState('');
  const [imported, setImported] = useState<{ name: string; content: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const file = useRef<HTMLInputElement>(null);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const content = j?.content ?? j;
      if (!content || typeof content !== 'object' || !('situations' in content || 'likert' in content)) {
        throw new Error('Ce fichier ne contient pas de questionnaire TAC-SUNU.');
      }
      setImported({ name: f.name, content });
      if (!label && j?.label) setLabel(`${j.label} (import)`);
      setError(undefined);
    } catch (e) {
      setImported(null);
      setError(e instanceof SyntaxError ? 'Fichier JSON illisible.' : errMsg(e));
    }
  };

  const can = label.trim() && !busy && (source !== 'copy' || copyId) && (source !== 'import' || imported);

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const q = await api.createQuestionnaire({
        label: label.trim(),
        description: description.trim() || undefined,
        ...(source === 'copy' ? { from_id: copyId as number } : {}),
        ...(source === 'origine' || source === 'vide' ? { template: source } : {}),
        ...(source === 'import' ? { content: imported!.content } : {}),
      });
      toast.success(`Brouillon v${q.version} créé.`);
      onCreated(q.id);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nouveau questionnaire</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Point de départ
            </Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={source} onChange={(_, v) => v && setSource(v)}>
              <ToggleButton value="copy" disabled={!versions.length}>
                Copie d'une version
              </ToggleButton>
              <ToggleButton value="origine">Référentiel d'origine</ToggleButton>
              <ToggleButton value="vide">Vide</ToggleButton>
              <ToggleButton value="import">Import JSON</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {source === 'copy' && (
            <TextField
              select
              label="Version copiée"
              value={copyId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setCopyId(id);
                const v = versions.find((x) => x.id === id);
                if (v) setLabel(`${v.label} — révision`);
              }}
            >
              {versions.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  v{v.version} — {v.label} ({STATUS[v.status].label.toLowerCase()})
                </MenuItem>
              ))}
            </TextField>
          )}
          {source === 'origine' && (
            <Alert severity="info" variant="outlined">
              Les 12 situations, 12 blocs, 26 énoncés et 9 items de contrôle du test d'origine.
            </Alert>
          )}
          {source === 'vide' && (
            <Alert severity="info" variant="outlined">
              Un questionnaire sans aucune question. Il devra couvrir les quatre dimensions avant d'être publié.
            </Alert>
          )}
          {source === 'import' && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button variant="outlined" color="inherit" startIcon={<Iconify icon="solar:upload-minimalistic-bold" />} onClick={() => file.current?.click()}>
                Choisir un fichier
              </Button>
              <Typography variant="body2" color={imported ? 'text.primary' : 'text.secondary'} noWrap>
                {imported?.name ?? 'Fichier exporté depuis cette console (.json)'}
              </Typography>
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </Stack>
          )}
          <TextField label="Nom" value={label} onChange={(e) => setLabel(e.target.value)} required inputProps={{ maxLength: 255 }} />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            placeholder="Objet de cette version, changements par rapport à la précédente…"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" variant="outlined" onClick={onClose}>
          Annuler
        </Button>
        <Button variant="contained" onClick={create} disabled={!can}>
          Créer le brouillon
        </Button>
      </DialogActions>
    </Dialog>
  );
}
