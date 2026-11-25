import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import {
  Chart,
  ChartLegends,
  Iconify,
  Label,
  Scrollbar,
  TableHeadCustom,
  useChart,
} from '@vionhub/design-system/components';
import { SunuBreadcrumbs } from '../brand';

import { api } from '../../shared/api';
import { DIMS, DIM_COLORS, DIM_KEYS, BANDES } from '../../shared/referentiel';
import { fmt } from '../../shared/theme';
import type { GroupRow, Summary } from '../../shared/types';
import { EmptyState, FilterBar, InternalUse, KpiCard, SectionCard } from '../components';
import { bandColor, pct, useAsync, useFilters } from '../lib';
import { useAiEnabled } from '../../shared/ai';
import { AiInsights } from '../AiInsights';

export function DashboardPage() {
  const { filters, search } = useFilters();
  const summary = useAsync(() => api.summary(filters), [filters]);
  const s = summary.data;
  const aiEnabled = useAiEnabled();
  const [showAi, setShowAi] = useState(false);

  return (
    <Stack spacing={3}>
      <Box>
        <InternalUse />
        <SunuBreadcrumbs
          heading="Tableau de bord"
          links={[{ name: 'Console DRH' }, { name: 'Tableau de bord' }]}
          sx={{ mt: 1.5 }}
          action={
            <Stack direction="row" spacing={1.5}>
              {aiEnabled && (
                <Button
                  variant={showAi ? 'outlined' : 'contained'}
                  color="secondary"
                  onClick={() => setShowAi((v) => !v)}
                  disabled={!s?.valid}
                  startIcon={<Iconify icon="solar:magic-stick-3-bold" />}
                >
                  Analyse IA
                </Button>
              )}
              <Button
                variant="contained"
                component="a"
                href={api.exportUrl(filters)}
                download
                disabled={!s?.total}
                startIcon={<Iconify icon="solar:export-bold" />}
              >
                Exporter en CSV
              </Button>
            </Stack>
          }
        />
      </Box>

      <FilterBar />

      {aiEnabled && showAi && !!s?.valid && <AiInsights filters={filters} onClose={() => setShowAi(false)} />}

      {summary.loading && <LinearProgress sx={{ borderRadius: 1 }} />}
      {summary.error && <Alert severity="error">{summary.error}</Alert>}

      {!s && summary.loading && <DashboardSkeleton />}

      {s && s.total === 0 && (
        <EmptyState
          title="Aucune réponse pour ces critères"
          description="Les résultats collectifs apparaîtront ici dès le premier import ou les premières passations en ligne. Élargissez les filtres ou importez des réponses."
          action={
            <Button component={RouterLink} to="/import" variant="outlined" startIcon={<Iconify icon="solar:upload-minimalistic-bold" />}>
              Importer des réponses
            </Button>
          }
        />
      )}

      {s && s.total > 0 && <DashboardBody s={s} search={search} campaignFiltered={filters.campaign_id !== ''} />}
    </Stack>
  );
}

function DashboardSkeleton() {
  return (
    <Grid container spacing={3}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Grid key={i} item xs={12} sm={6} lg>
          <Skeleton variant="rounded" height={112} />
        </Grid>
      ))}
      <Grid item xs={12} md={6}>
        <Skeleton variant="rounded" height={360} />
      </Grid>
      <Grid item xs={12} md={6}>
        <Skeleton variant="rounded" height={360} />
      </Grid>
    </Grid>
  );
}

function DashboardBody({ s, search, campaignFiltered }: { s: Summary; search: string; campaignFiltered: boolean }) {
  const ecartees = s.invalid;
  return (
    <>
      <Grid container spacing={3}>
        <Grid item xs={6} sm={6} lg>
          <KpiCard
            title="Répondants valides"
            value={s.valid}
            icon="solar:users-group-rounded-bold-duotone"
            caption={`sur ${fmt(s.total)} passation${s.total > 1 ? 's' : ''}`}
          />
        </Grid>
        <Grid item xs={6} sm={6} lg>
          <KpiCard
            title="Global moyen"
            value={s.global}
            icon="solar:target-bold-duotone"
            tone="secondary"
            caption={s.global != null ? <BandHint value={s.global} /> : 'sur 100'}
          />
        </Grid>
        <Grid item xs={6} sm={6} lg>
          <KpiCard
            title="Aligné ou plus"
            value={s.aligned_pct}
            unit={' %'}
            icon="solar:medal-ribbons-star-bold-duotone"
            tone="success"
            caption="Score global ≥ 65"
          />
        </Grid>
        <Grid item xs={6} sm={6} lg>
          <KpiCard
            title="Taux de participation"
            value={s.participation_pct}
            unit={' %'}
            digits={s.participation_pct != null && s.participation_pct < 10 ? 1 : 0}
            icon="solar:chart-square-bold-duotone"
            tone="info"
            caption={`${fmt(s.total)} / ${fmt(s.population)} collaborateurs`}
          />
        </Grid>
        <Grid item xs={12} sm={12} lg>
          <KpiCard
            title="Passations écartées"
            value={ecartees}
            icon="solar:danger-triangle-bold-duotone"
            tone={ecartees ? 'warning' : 'success'}
            caption={ecartees ? 'Contrôles de validité' : 'Aucune passation écartée'}
          />
        </Grid>
      </Grid>

      {ecartees > 0 && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" component={RouterLink} to={`/repondants${search}${search ? '&' : '?'}invalides=1`}>
              Voir
            </Button>
          }
        >
          {ecartees} passation{ecartees > 1 ? 's' : ''} écartée{ecartees > 1 ? 's' : ''} par les contrôles de validité.{' '}
          {ecartees > 1 ? 'Elles sont à refaire.' : 'Elle est à refaire.'}
        </Alert>
      )}
      {!campaignFiltered && s.campaigns_present.length > 1 && (
        <Alert severity="info">
          Plusieurs campagnes sont présentes ({s.campaigns_present.join(', ')}). Les moyennes ci-dessous les agrègent :
          filtrez par campagne, consultez l'évolution par campagne ou exportez en CSV pour comparer T0 et T+X.
        </Alert>
      )}

      {s.valid === 0 ? (
        <Alert severity="warning">Aucune passation exploitable : les résultats collectifs ne peuvent pas être calculés.</Alert>
      ) : (
        <>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <PrincipleRadar s={s} />
            </Grid>
            <Grid item xs={12} md={6}>
              <Ranking s={s} />
            </Grid>
            <Grid item xs={12} md={6}>
              <BandsDonut s={s} />
            </Grid>
            <Grid item xs={12} md={6}>
              <DominanceBars s={s} />
            </Grid>
            {s.trend.length >= 2 && (
              <Grid item xs={12}>
                <TrendLine s={s} />
              </Grid>
            )}
          </Grid>
          <GroupTables s={s} />
        </>
      )}
    </>
  );
}

function BandHint({ value }: { value: number }) {
  const b = BANDES.find((x) => value >= x.min);
  return b ? (
    <Label color={bandColor(b.label)} variant="soft" sx={{ mt: 0.25 }}>
      {b.label}
    </Label>
  ) : null;
}

// ---------------------------------------------------------------- charts

function PrincipleRadar({ s }: { s: Summary }) {
  const theme = useTheme();
  const options = useChart({
    colors: [theme.palette.primary.main],
    xaxis: {
      categories: DIMS.map((d) => d.label),
      labels: { style: { colors: DIMS.map(() => theme.palette.text.secondary), fontSize: '13px' } },
    },
    yaxis: { show: false, min: 0, max: 100, tickAmount: 4 },
    stroke: { width: 2 },
    fill: { opacity: 0.24 },
    markers: { size: 4 },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => fmt(v) } },
    plotOptions: {
      radar: { polygons: { strokeColors: theme.palette.divider, connectorColors: theme.palette.divider } },
    },
  });

  return (
    <SectionCard title="Par principe" subheader="Score moyen des répondants valides, sur 100">
      <Chart
        type="radar"
        series={[{ name: 'Score moyen', data: DIM_KEYS.map((d) => Math.round(s.par_dim[d] ?? 0)) }]}
        options={options}
        height={320}
      />
      <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1} sx={{ mt: 1 }}>
        {DIMS.map((d) => (
          <Stack
            key={d.id}
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: 'background.neutral' }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: DIM_COLORS[d.id] }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {d.label}
            </Typography>
            <Typography variant="subtitle2">{fmt(s.par_dim[d.id])}</Typography>
          </Stack>
        ))}
      </Stack>
    </SectionCard>
  );
}

function Ranking({ s }: { s: Summary }) {
  return (
    <SectionCard
      title="Comportements les plus faibles"
      subheader="Classement des quatre principes, du plus faible au plus solide. Les deux premiers orientent le plan d'actions."
    >
      <Stack spacing={2.5} sx={{ pt: 1 }}>
        {s.ranking.map((r) => (
          <Stack key={r.dim} direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                typography: 'subtitle1',
                color: r.priority ? 'error.contrastText' : 'text.secondary',
                bgcolor: r.priority ? 'error.main' : 'background.neutral',
              }}
            >
              {r.rank}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <Typography variant="subtitle1" noWrap>
                  {r.label}
                </Typography>
                {r.priority && (
                  <Label color="error" startIcon={<Iconify icon="solar:flag-bold" />}>
                    Priorité
                  </Label>
                )}
                <Box sx={{ flex: 1 }} />
                <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(r.score)}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={r.score}
                sx={{
                  height: 8,
                  borderRadius: 1,
                  bgcolor: 'background.neutral',
                  '& .MuiLinearProgress-bar': { bgcolor: DIM_COLORS[r.dim], borderRadius: 1 },
                }}
              />
            </Box>
          </Stack>
        ))}
      </Stack>
    </SectionCard>
  );
}

function BandsDonut({ s }: { s: Summary }) {
  const theme = useTheme();
  const colors = s.bands.map((b) => {
    const c = bandColor(b.label);
    return c === 'default' ? theme.palette.grey[500] : theme.palette[c].main;
  });
  const options = useChart({
    labels: s.bands.map((b) => b.label),
    colors,
    legend: { show: false },
    stroke: { width: 2, colors: [theme.palette.background.paper] },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v) => `${fmt(v)} répondant${(v ?? 0) > 1 ? 's' : ''}` } },
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
          labels: {
            show: true,
            value: { formatter: (v: string) => fmt(Number(v)) },
            total: { show: true, label: 'Valides', formatter: () => fmt(s.valid) },
          },
        },
      },
    },
  });

  return (
    <SectionCard title="Répartition des profils" subheader="Répondants valides par niveau d'alignement">
      <Stack direction={{ xs: 'column', sm: 'row', md: 'column', xl: 'row' }} alignItems="center" spacing={2}>
        <Box sx={{ width: 1, maxWidth: 260, mx: 'auto' }}>
          <Chart type="donut" series={s.bands.map((b) => b.count)} options={options} height={240} />
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1, width: 1 }}>
          {s.bands.map((b, i) => (
            <Stack key={b.label} direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colors[i], flexShrink: 0 }} />
              <Typography variant="body2" sx={{ flex: 1 }}>
                {b.label}
              </Typography>
              <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(b.count)}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
              >
                {pct(b.pct)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </SectionCard>
  );
}

function DominanceBars({ s }: { s: Summary }) {
  const theme = useTheme();
  const colors = [theme.palette.success.main, theme.palette.warning.main];
  const options = useChart({
    colors,
    xaxis: { categories: s.dominance.map((d) => d.label) },
    yaxis: { labels: { formatter: (v: number) => fmt(v) } },
    plotOptions: { bar: { columnWidth: '52%', borderRadius: 4 } },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v) => `${fmt(v)} répondant${(v ?? 0) > 1 ? 's' : ''}` } },
  });
  const labels = ['Privilégié (dominance haute)', 'Sacrifié (dominance basse)'];
  return (
    <SectionCard
      title="Arbitrages"
      subheader="Dans les choix forcés, principe le plus souvent privilégié ou sacrifié par chaque répondant"
    >
      <ChartLegends labels={labels} colors={colors} sx={{ mb: 1 }} />
      <Chart
        type="bar"
        series={[
          { name: labels[0], data: s.dominance.map((d) => d.haut) },
          { name: labels[1], data: s.dominance.map((d) => d.bas) },
        ]}
        options={options}
        height={300}
      />
    </SectionCard>
  );
}

function TrendLine({ s }: { s: Summary }) {
  const theme = useTheme();
  const colors = [theme.palette.text.primary, ...DIM_KEYS.map((d) => DIM_COLORS[d])];
  const names = ['Global', ...DIMS.map((d) => d.label)];
  const options = useChart({
    colors,
    xaxis: { categories: s.trend.map((t) => t.code) },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: { formatter: (v: number) => fmt(v) } },
    stroke: { width: [4, 2, 2, 2, 2], dashArray: [0, 4, 4, 4, 4] },
    markers: { size: 5 },
    legend: { show: false },
    tooltip: { y: { formatter: (v) => (v == null ? 'n<5' : fmt(v)) } },
  });
  const round = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  return (
    <SectionCard
      title="Évolution par campagne"
      subheader="Moyennes des répondants valides, avec les filtres Entité, Catégorie et Famille appliqués"
    >
      <ChartLegends labels={names} colors={colors} sx={{ mb: 1 }} />
      <Chart
        type="line"
        series={[
          { name: 'Global', data: s.trend.map((t) => round(t.global)) },
          ...DIMS.map((d) => ({ name: d.label, data: s.trend.map((t) => round(t.scores[d.id])) })),
        ]}
        options={options}
        height={300}
      />
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
        {s.trend.map((t) => (
          <Label key={t.campaign_id} variant="soft">
            {t.label} · n = {t.n}
            {t.masked ? ' (n<5)' : ''}
          </Label>
        ))}
      </Stack>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- group tables

const GROUP_TABS = [
  { key: 'filiale', label: 'Entité' },
  { key: 'categorie', label: 'Catégorie' },
  { key: 'famille', label: 'Famille de métier' },
] as const;

function GroupTables({ s }: { s: Summary }) {
  const [tab, setTab] = useState<(typeof GROUP_TABS)[number]['key']>('filiale');
  const current = GROUP_TABS.find((t) => t.key === tab)!;
  const min = s.min_group_size;
  return (
    <Card>
      <Box sx={{ px: 3, pt: 2.5 }}>
        <Typography variant="h6">Résultats par groupe</Typography>
      </Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ px: 3, boxShadow: (t) => `inset 0 -2px 0 0 ${t.vars.palette.divider}` }}
      >
        {GROUP_TABS.map((t) => (
          <Tab
            key={t.key}
            value={t.key}
            label={t.label}
            iconPosition="end"
            icon={<Label variant={t.key === tab ? 'filled' : 'soft'}>{s.groups[t.key].length}</Label>}
          />
        ))}
      </Tabs>
      <GroupTable rows={s.groups[tab]} label={current.label} min={min} />
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', px: 3, py: 2 }}>
        {min === 5
          ? 'Les groupes de moins de cinq répondants ne sont pas détaillés, pour ne pas rendre les résultats identifiables.'
          : `Les groupes de moins de ${min} répondants ne sont pas détaillés, pour ne pas rendre les résultats identifiables.`}
      </Typography>
    </Card>
  );
}

function GroupTable({ rows, label, min }: { rows: GroupRow[]; label: string; min: number }) {
  const head = [
    { id: 'key', label, minWidth: 200 },
    { id: 'n', label: 'N', align: 'right' as const },
    { id: 'global', label: 'Global', align: 'right' as const },
    ...DIMS.map((d) => ({ id: d.id, label: d.label, align: 'right' as const })),
    { id: 'aligned', label: 'Aligné+', align: 'right' as const },
  ];
  return (
    <TableContainer>
      <Scrollbar>
        <Table size="small" sx={{ minWidth: 760 }}>
          <TableHeadCustom headLabel={head} />
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key} hover>
                <TableCell sx={{ fontWeight: 600 }}>{r.key}</TableCell>
                <TableCell align="right">{fmt(r.n)}</TableCell>
                {r.masked ? (
                  <>
                    <TableCell align="right">
                      <Label variant="soft">n&lt;{min}</Label>
                    </TableCell>
                    {DIMS.map((d) => (
                      <TableCell key={d.id} align="right" sx={{ color: 'text.disabled' }}>
                        —
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ color: 'text.disabled' }}>
                      —
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell align="right">
                      <Label color={bandColor(BANDES.find((b) => (r.global ?? 0) >= b.min)?.label)} variant="soft">
                        {fmt(r.global)}
                      </Label>
                    </TableCell>
                    {DIMS.map((d) => (
                      <TableCell key={d.id} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(r.scores[d.id])}
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {pct(r.aligned_pct)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Aucun groupe.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Scrollbar>
    </TableContainer>
  );
}
