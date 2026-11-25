import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import {
  Chart,
  ChartLegends,
  Iconify,
  Label,
  Scrollbar,
  toast,
  useChart,
  useConfirm,
} from '@vionhub/design-system/components';

import { api } from '../../shared/api';
import { BANDES, DIMNAME, DIMS, DIM_COLORS, DIM_KEYS, type ExtraQuestion, type ExtraValue } from '../../shared/referentiel';
import { fmt } from '../../shared/theme';
import type { SubmissionResult } from '../../shared/types';
import { ProfileLabel, ScoreBar } from '../components';
import { SOURCE_LABEL, errMsg, fDateTime, fDuration, useAsync } from '../lib';
import { Flags } from './RespondentsPage';

export function RespondentDrawer({
  id,
  onClose,
  onDeleted,
}: {
  id: number | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={id != null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: 1, sm: 520 } } }}
    >
      {id != null && <DrawerBody id={id} onClose={onClose} onDeleted={onDeleted} />}
    </Drawer>
  );
}

function DrawerBody({ id, onClose, onDeleted }: { id: number; onClose: () => void; onDeleted: () => void }) {
  const res = useAsync(() => api.individual(id), [id]);
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const r = res.data;

  const onDelete = async () => {
    if (!r) return;
    const ok = await confirm({
      title: 'Supprimer cette passation ?',
      message: (
        <span>
          La passation <strong>{r.matricule}</strong> de la campagne <strong>{r.campaign.code}</strong> sera
          définitivement supprimée et retirée des résultats collectifs. Cette action est tracée dans le journal
          d'audit.
        </span>
      ),
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      color: 'error',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.deleteSubmission(r.id);
      toast.success(`Passation ${r.matricule} supprimée.`);
      onDeleted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Stack sx={{ height: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2.5, py: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            Profil individuel
          </Typography>
          <Typography variant="h6" noWrap>
            {r ? (r.user?.name ?? r.name ?? r.matricule) : '…'}
          </Typography>
        </Box>
        <Tooltip title="Supprimer la passation">
          <span>
            <IconButton color="error" onClick={onDelete} disabled={!r || deleting}>
              <Iconify icon="solar:trash-bin-trash-bold" />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton onClick={onClose} aria-label="Fermer">
          <Iconify icon="mingcute:close-line" />
        </IconButton>
      </Stack>
      <Divider />

      <Scrollbar sx={{ flex: 1 }}>
        <Box sx={{ p: 2.5 }}>
          {res.error && <Alert severity="error">{res.error}</Alert>}
          {!r && res.loading && (
            <Stack spacing={2}>
              <Skeleton variant="rounded" height={120} />
              <Skeleton variant="rounded" height={240} />
              <Skeleton variant="rounded" height={160} />
            </Stack>
          )}
          {r && <Profile r={r} />}
        </Box>
      </Scrollbar>

      <Divider />
      <Stack direction="row" spacing={1.5} sx={{ p: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1, alignSelf: 'center' }}>
          Donnée nominative : accès limité à la DRH Groupe et au manager direct.
        </Typography>
        <Button
          color="error"
          variant="outlined"
          onClick={onDelete}
          disabled={!r || deleting}
          startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
        >
          Supprimer
        </Button>
      </Stack>
    </Stack>
  );
}

function Profile({ r }: { r: SubmissionResult }) {
  const band = BANDES.find((b) => r.profil === b.label);
  const reasons: string[] = [];
  if (r.uniforme) reasons.push('réponses uniformes');
  // thresholds depend on the questionnaire: not uniform + not exploitable = inconsistency
  if (r.invalide && !r.uniforme) reasons.push(`incohérences trop nombreuses (INC = ${r.inc})`);

  return (
    <Stack spacing={3}>
      {r.invalide && (
        <Alert severity="warning">
          Passation non exploitable{reasons.length ? ` : ${reasons.join(', ')}` : ''}. Elle est exclue des résultats
          collectifs et est à refaire.
        </Alert>
      )}

      {/* headline */}
      <Stack direction="row" spacing={2.5} alignItems="center" sx={{ opacity: r.invalide ? 0.6 : 1 }}>
        <Box
          sx={{
            width: 96,
            height: 96,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            border: (t) => `6px solid ${t.vars.palette.primary.main}`,
            borderColor: r.invalide ? 'grey.400' : 'primary.main',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h3" sx={{ lineHeight: 1 }}>
              {fmt(r.global)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              / 100
            </Typography>
          </Box>
        </Box>
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          <Box>
            <ProfileLabel profil={r.profil} invalide={r.invalide} />
          </Box>
          {band && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {band.description}
            </Typography>
          )}
        </Stack>
      </Stack>

      {/* identity */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
          p: 2,
          borderRadius: 1.5,
          bgcolor: 'background.neutral',
        }}
      >
        <Info label="Matricule" value={r.matricule} />
        {r.user && <Info label="Nom" value={r.user.name} />}
        {r.user?.title && <Info label="Fonction" value={r.user.title} />}
        {r.user?.department && <Info label="Service" value={r.user.department} />}
        <Info label="Entité" value={r.filiale} />
        <Info label="Catégorie" value={r.categorie} />
        <Info label="Famille de métier" value={r.famille} />
        <Info label="Campagne" value={r.campaign.label} />
        <Info label="Date" value={fDateTime(r.submitted_at)} />
        <Info label="Durée" value={fDuration(r.duree_s)} />
        <Info label="Source" value={SOURCE_LABEL[r.source] ?? r.source} />
        {r.user?.email && <Info label="E-mail" value={r.user.email} />}
      </Box>

      {/* per principle */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 2 }}>
          Par principe
        </Typography>
        <Stack spacing={2}>
          {DIMS.map((d) => (
            <ScoreBar
              key={d.id}
              label={d.label}
              value={r.scores[d.id]}
              color={DIM_COLORS[d.id]}
              hint={`Situations ${fmt(r.sjt[d.id])} · Auto-évaluation ${fmt(r.lik[d.id])}${
                r.extra?.[d.id] != null ? ` · Complémentaires ${fmt(r.extra[d.id])}` : ''
              }`}
            />
          ))}
        </Stack>
      </Box>

      <SplitRadar r={r} />

      {/* dominance */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Arbitrages (choix forcés)
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Label color="success" startIcon={<Iconify icon="solar:arrow-up-bold" />}>
            Privilégié : {DIMNAME[r.dom_haut] ?? r.dom_haut}
          </Label>
          <Label color="warning" startIcon={<Iconify icon="solar:arrow-down-bold" />}>
            Sacrifié : {DIMNAME[r.dom_bas] ?? r.dom_bas}
          </Label>
        </Stack>
        <Stack spacing={1.5}>
          {DIM_KEYS.map((d) => (
            <ScoreBar key={d} label={DIMNAME[d]} value={r.dom[d]} color={DIM_COLORS[d]} />
          ))}
        </Stack>
      </Box>

      {/* validity */}
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Contrôles de validité
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
          <Metric label="Désirabilité sociale (DS)" value={r.ds} warn={r.ds_haut} />
          <Metric label="Incohérences (INC)" value={r.inc} warn={r.invalide && !r.uniforme} />
        </Stack>
        <Flags r={r} />
      </Box>

      {r.answers?.extra && Object.keys(r.answers.extra).length > 0 && <ExtraAnswers r={r} />}
    </Stack>
  );
}

function ExtraAnswers({ r }: { r: SubmissionResult }) {
  const ref = useAsync(() => api.campaignQuestionnaire(r.campaign.id), [r.campaign.id]);
  const answers = r.answers?.extra ?? {};
  const fmtAnswer = (e: ExtraQuestion, v: ExtraValue): string => {
    const opt = (k: number) => e.options?.[k]?.txt ?? `#${k + 1}`;
    if (e.type === 'yesno') return v ? e.labels?.[0] ?? 'Oui' : e.labels?.[1] ?? 'Non';
    if (e.type === 'single') return opt(v as number);
    if (e.type === 'multiple') return (v as number[]).map(opt).join(' · ');
    if (e.type === 'ranking') return (v as number[]).map((k, i) => `${i + 1}. ${opt(k)}`).join('  ');
    return String(v);
  };
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
        {ref.data?.extrasTitre || 'Questions complémentaires'}
      </Typography>
      {ref.loading && <Skeleton height={60} />}
      <Stack spacing={1.25}>
        {(ref.data?.extras ?? [])
          .filter((e) => answers[e.id] != null)
          .map((e) => (
            <Box key={e.id}>
              <Typography variant="caption" color="text.secondary">
                {e.txt}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {fmtAnswer(e, answers[e.id])}
              </Typography>
            </Box>
          ))}
      </Stack>
      {r.extra && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Score des questions notées :{' '}
          {DIMS.filter((d) => r.extra?.[d.id] != null)
            .map((d) => `${d.label} ${Math.round(r.extra![d.id]!)}`)
            .join(' · ')}
        </Typography>
      )}
    </Box>
  );
}

function SplitRadar({ r }: { r: SubmissionResult }) {
  const theme = useTheme();
  const colors = [theme.palette.primary.main, theme.palette.secondary.main];
  const options = useChart({
    colors,
    xaxis: {
      categories: DIMS.map((d) => d.label),
      labels: { style: { colors: DIMS.map(() => theme.palette.text.secondary) } },
    },
    yaxis: { show: false, min: 0, max: 100, tickAmount: 4 },
    stroke: { width: 2 },
    fill: { opacity: 0.16 },
    markers: { size: 3 },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => fmt(v) } },
    plotOptions: {
      radar: { size: 105, polygons: { strokeColors: theme.palette.divider, connectorColors: theme.palette.divider } },
    },
    responsive: [{ breakpoint: 600, options: { plotOptions: { radar: { size: 85 } } } }],
  });
  const labels = ['Situations', 'Auto-évaluation (Likert)'];
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Situations et auto-évaluation
      </Typography>
      <ChartLegends labels={labels} colors={colors} />
      <Chart
        type="radar"
        height={280}
        options={options}
        series={[
          { name: labels[0], data: DIM_KEYS.map((d) => Math.round(r.sjt[d] ?? 0)) },
          { name: labels[1], data: DIM_KEYS.map((d) => Math.round(r.lik[d] ?? 0)) },
        ]}
      />
    </Box>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn: boolean }) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1.5,
        borderRadius: 1.5,
        border: (t) => `1px solid ${t.vars.palette.divider}`,
        borderColor: warn ? 'warning.main' : undefined,
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ color: warn ? 'warning.main' : 'text.primary' }}>
        {value}
      </Typography>
    </Box>
  );
}
