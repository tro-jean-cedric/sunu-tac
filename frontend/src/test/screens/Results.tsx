import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { useTheme } from '@mui/material/styles';
import { Chart, Iconify, Label, toast, useChart } from '@vionhub/design-system/components';
import { AnimateCountUp, m, varFade } from '@vionhub/design-system/motion';

import { bande, DIM_COLORS, DIM_KEYS, DIMNAME, type DimKey } from '../../shared/referentiel';
import type { ScoreResult } from '../../shared/scoring';
import type { Campaign, Me, SubmissionResult } from '../../shared/types';
import { AiCoach } from '../components/AiCoach';

export interface LocalFallback {
  result: ScoreResult;
  code: string;
}

interface Props {
  me: Me;
  campaign: Campaign;
  result: SubmissionResult | null;
  fallback: LocalFallback | null;
  onRetake: () => void;
  onSignOut: () => void;
}

/** Normalised view over a server result or a local (offline) one. */
function view(result: SubmissionResult | null, fb: LocalFallback | null) {
  if (result)
    return {
      global: result.global,
      scores: result.scores,
      sjt: result.sjt,
      lik: result.lik,
      extra: result.extra ?? null,
      dom: result.dom,
      domHaut: result.dom_haut,
      domBas: result.dom_bas,
      dsHaut: result.ds_haut,
      invalide: result.invalide,
      uniforme: result.uniforme,
      date: result.submitted_at,
    };
  const r = fb!.result;
  return { global: r.global, scores: r.scores, sjt: r.sjt, lik: r.lik, extra: r.extra, dom: r.dom, domHaut: r.domHaut, domBas: r.domBas, dsHaut: r.dsHaut, invalide: r.invalide, uniforme: r.uniforme, date: null };
}

type DimValues = Partial<Record<DimKey, number | null>> | null | undefined;

/** Radar series: the final score (filled) and each measure it is built from, on the same 0–100 axes. */
function radarSeries(v: ReturnType<typeof view>) {
  const all: { name: string; values: DimValues; help: string }[] = [
    { name: 'Score final', values: v.scores, help: 'votre note par principe, celle des barres.' },
    { name: 'Mises en situation', values: v.sjt, help: 'la part des points obtenus dans les cas concrets.' },
    {
      name: 'Pratiques',
      values: v.lik,
      help: v.dsHaut
        ? 'la fréquence déclarée de vos pratiques (non retenue ici, voir la réserve ci-dessous).'
        : 'la fréquence à laquelle vous déclarez ces pratiques.',
    },
    { name: 'Choix forcés', values: v.dom, help: 'ce que vous gardez quand il faut choisir (50 = neutre) ; n’entre pas dans la note.' },
    { name: 'Questions complémentaires', values: v.extra, help: 'les points des questions complémentaires notées.' },
  ];
  return all
    .filter((s) => s.values && DIM_KEYS.some((d) => s.values?.[d] != null))
    .map((s) => ({ ...s, data: DIM_KEYS.map((d) => Math.round(s.values?.[d] ?? 0)) }));
}

export function Results({ me, campaign, result, fallback, onRetake, onSignOut }: Props) {
  const theme = useTheme();
  const v = view(result, fallback);

  const series = radarSeries(v);
  const palette = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.info.main,
    theme.palette.success.main,
    theme.palette.warning.main,
  ];
  const radar = useChart({
    xaxis: {
      categories: DIM_KEYS.map((d) => DIMNAME[d]),
      labels: { style: { colors: DIM_KEYS.map(() => theme.palette.text.secondary) } },
    },
    yaxis: { min: 0, max: 100, tickAmount: 4, show: false },
    colors: palette.slice(0, series.length),
    // the final score is the filled shape; its components are outlines
    fill: { opacity: series.map((_, i) => (i === 0 ? 0.25 : 0)) },
    // width must stay a number: a per-series array collapses the radar to its centre
    stroke: { width: 2, dashArray: series.map((_, i) => (i === 0 ? 0 : 4)) },
    markers: { size: 4 }, // a number: the radar radius is computed from it
    plotOptions: {
      radar: { size: 95, polygons: { strokeColors: theme.palette.divider, connectorColors: theme.palette.divider } },
    },
    tooltip: { shared: true, intersect: false, y: { formatter: (x: number) => `${Math.round(x)} / 100` } },
    legend: { show: true, position: 'bottom', fontSize: '13px', itemMargin: { horizontal: 8, vertical: 4 } },
  });

  if (v.invalide)
    return (
      <m.div initial="initial" animate="animate" variants={varFade().inUp}>
        <Card sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
          <Iconify icon="solar:danger-triangle-bold-duotone" width={64} sx={{ color: 'warning.main', mb: 2 }} />
          <Typography variant="overline" color="error.main">
            Résultat non exploitable
          </Typography>
          <Typography variant="h4" sx={{ mt: 1, mb: 2 }}>
            Nous ne pouvons pas calculer votre profil
          </Typography>
          <Alert severity="warning" sx={{ textAlign: 'left', mb: 3 }}>
            {v.uniforme
              ? 'Presque tous vos énoncés ont reçu la même réponse.'
              : 'Vos réponses à des énoncés très proches divergent fortement.'}{' '}
            Le test doit être repassé en prenant le temps de lire chaque énoncé.
          </Alert>
          <Button size="large" variant="contained" onClick={onRetake} startIcon={<Iconify icon="solar:restart-bold" />}>
            Recommencer
          </Button>
        </Card>
      </m.div>
    );

  const g = v.global ?? 0;
  const b = bande(g);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(fallback!.code);
      toast.success('Code copié');
    } catch {
      toast.info('Sélectionnez le code puis copiez-le (Ctrl+C)');
    }
  };
  const mail = fallback
    ? `mailto:?subject=${encodeURIComponent(`TAC-SUNU — ${me.username} — ${campaign.code}`)}&body=${encodeURIComponent(
        `Matricule : ${me.username}\nEntité : ${me.company?.name ?? me.filliale ?? ''}\nCampagne : ${campaign.code}\n\nCode de restitution :\n${fallback.code}`,
      )}`
    : '';

  return (
    <Stack spacing={3}>
      {/* hero */}
      <m.div initial="initial" animate="animate" variants={varFade({ distance: 30 }).inUp}>
        <Card
          sx={{
            p: { xs: 3, md: 4 },
            textAlign: 'center',
            color: 'common.white',
            background: 'linear-gradient(135deg, #6B0F1E 0%, #A6192E 70%, #B5862F 150%)',
            '@media print': { color: 'text.primary', background: 'none' },
          }}
        >
          <Typography variant="overline" sx={{ opacity: 0.85, letterSpacing: 2 }}>
            Alignement culturel global
          </Typography>
          <Stack direction="row" justifyContent="center" alignItems="baseline" spacing={0.5} sx={{ my: 1 }}>
            <AnimateCountUp to={Math.round(g)} duration={1.4} sx={{ typography: 'h1', fontSize: { xs: 64, md: 84 }, fontWeight: 800, lineHeight: 1 }} />
            <Typography variant="h4" sx={{ opacity: 0.7 }}>
              /100
            </Typography>
          </Stack>
          {b && (
            <Label variant="filled" color="secondary" sx={{ px: 2, py: 1.75, fontSize: 15 }}>
              {b.label}
            </Label>
          )}
          {b && (
            <Typography sx={{ mt: 2, opacity: 0.9, maxWidth: 520, mx: 'auto' }}>{b.description}</Typography>
          )}
        </Card>
      </m.div>

      {result && (
        <Alert severity="success" icon={<Iconify icon="solar:check-circle-bold-duotone" />} className="no-print">
          Vos réponses ont été transmises à la DRH
          {v.date ? ` le ${new Date(v.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}. Vous
          recevez votre résultat en premier.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6}>
          <Card sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Par principe
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              {DIM_KEYS.map((d: DimKey, i) => {
                const val = Math.round(v.scores[d] ?? 0);
                return (
                  <m.div key={d} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                      <Typography variant="subtitle2">{DIMNAME[d]}</Typography>
                      <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {val}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={val}
                      sx={{ height: 10, borderRadius: 5, bgcolor: 'background.neutral', '& .MuiLinearProgress-bar': { bgcolor: DIM_COLORS[d], borderRadius: 5 } }}
                    />
                  </m.div>
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.5 }}>
              Un écart de moins de cinq points entre deux principes n'est pas significatif.
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={12} md={6} sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Card sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Typography variant="h6">Détail de vos réponses</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Chaque partie du test, sur la même échelle de 0 à 100. Cliquez sur une légende pour l'afficher ou la
              masquer.
            </Typography>
            <Box sx={{ width: '100%', mt: 1 }}>
              <Chart type="radar" series={series.map(({ name, data }) => ({ name, data }))} options={radar} height={380} />
            </Box>
            <Stack component="ul" spacing={0.5} sx={{ m: 0, mt: 1, pl: 2 }}>
              {series.map((s) => (
                <Typography key={s.name} component="li" variant="caption" color="text.secondary">
                  <Box component="strong" sx={{ color: 'text.primary' }}>
                    {s.name}
                  </Box>{' '}
                  : {s.help}
                </Typography>
              ))}
            </Stack>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          <Iconify icon="solar:scale-bold-duotone" width={28} sx={{ color: 'secondary.main' }} />
          <Typography variant="h6">Ce que vous privilégiez</Typography>
        </Stack>
        <Typography>
          Quand vous ne pouvez pas tout tenir, votre arbitrage va d'abord à{' '}
          <Box component="strong" sx={{ color: DIM_COLORS[v.domHaut] }}>
            {DIMNAME[v.domHaut]}
          </Box>
          , et le moins à{' '}
          <Box component="strong" sx={{ color: DIM_COLORS[v.domBas] }}>
            {DIMNAME[v.domBas]}
          </Box>
          .
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Cette lecture décrit un arbitrage, pas une qualité ni un type. Elle ne se compare pas d'une personne à l'autre.
        </Typography>
      </Card>

      {v.dsHaut && (
        <Alert severity="warning">
          <strong>Réserve de lecture.</strong> Plusieurs de vos réponses décrivent des conduites que personne ne tient en
          permanence. Vos notes ont été calculées sur les seules situations, sans les énoncés de fréquence.
        </Alert>
      )}

      {result && !result.invalide && <AiCoach campaignId={campaign.id} domBas={v.domBas} domHaut={v.domHaut} />}

      {fallback && (
        <Card sx={{ p: { xs: 2.5, md: 3 }, border: '1px solid', borderColor: 'warning.main' }} className="no-print">
          <Typography variant="h6" sx={{ mb: 1 }}>
            Transmettre vos réponses
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            L'envoi automatique n'a pas abouti. Copiez votre code de restitution et transmettez-le à la DRH, ou réessayez plus tard :
            vos réponses restent enregistrées sur ce poste.
          </Typography>
          <TextField value={fallback.code} fullWidth multiline minRows={2} InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }} />
          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
            <Button variant="contained" onClick={copyCode} startIcon={<Iconify icon="solar:copy-bold" />}>
              Copier mon code
            </Button>
            <Button variant="outlined" href={mail} startIcon={<Iconify icon="solar:letter-bold" />}>
              Envoyer par e-mail
            </Button>
          </Stack>
        </Card>
      )}

      <Stack direction="row" spacing={1.5} className="no-print" flexWrap="wrap" useFlexGap>
        <Button variant="outlined" color="inherit" onClick={() => window.print()} startIcon={<Iconify icon="solar:printer-minimalistic-bold" />}>
          Imprimer / PDF
        </Button>
        <Button variant="contained" color="primary" onClick={onSignOut} startIcon={<Iconify icon="solar:logout-2-bold" />}>
          Terminer
        </Button>
      </Stack>
    </Stack>
  );
}
