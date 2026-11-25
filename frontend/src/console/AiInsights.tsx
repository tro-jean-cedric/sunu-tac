import { useCallback, useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Skeleton from '@mui/material/Skeleton';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { Iconify, Label, toast } from '@vionhub/design-system/components';
import { m, varFade } from '@vionhub/design-system/motion';

import { fetchInsights, type InsightPoint, type Insights } from '../shared/ai';
import { AiAvatar, TypingDots } from '../shared/ai-ui';
import { fDateTime, type Filters } from './lib';


const COLUMNS: { key: 'strengths' | 'risks' | 'gaps'; title: string; icon: string; color: 'success' | 'warning' | 'info' }[] = [
  { key: 'strengths', title: 'Forces', icon: 'solar:like-bold-duotone', color: 'success' },
  { key: 'risks', title: 'Points de vigilance', icon: 'solar:danger-triangle-bold-duotone', color: 'warning' },
  { key: 'gaps', title: 'Écarts entre groupes', icon: 'solar:graph-new-bold-duotone', color: 'info' },
];

const HORIZON_COLOR: Record<string, 'error' | 'warning' | 'info'> = { '0-3 mois': 'error', '3-6 mois': 'warning', '6-12 mois': 'info' };

function asText(d: Insights): string {
  const pts = (t: string, xs: InsightPoint[]) => (xs.length ? `\n${t}\n${xs.map((x) => `- ${x.title} : ${x.detail}`).join('\n')}\n` : '');
  return [
    `Analyse IA — TAC-SUNU`,
    d.headline,
    '',
    d.summary,
    pts('Forces', d.strengths),
    pts('Points de vigilance', d.risks),
    pts('Écarts entre groupes', d.gaps),
    d.actions.length ? `\nPlan d'action\n${d.actions.map((a, i) => `${i + 1}. ${a.title} (${a.owner}, ${a.horizon}) : ${a.detail}`).join('\n')}\n` : '',
    d.caveats.length ? `\nLimites : ${d.caveats.join(' ; ')}` : '',
  ].join('\n');
}

/** Dashboard panel: Claude's structured reading of the current (filtered, masked) results. */
export function AiInsights({ filters, onClose }: { filters: Filters; onClose: () => void }) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(filters);

  const seq = useRef(0); // only the latest request may update the panel (filters change, StrictMode re-run)

  const load = useCallback(
    async (refresh = false) => {
      const my = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const d = await fetchInsights(JSON.parse(key), refresh);
        if (my === seq.current) setData(d);
      } catch (e) {
        if (my !== seq.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    load();
    return () => {
      seq.current++;
    };
  }, [load]);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(asText(data));
      toast.success('Analyse copiée');
    } catch {
      toast.error('Copie impossible');
    }
  };

  return (
    <m.div initial="initial" animate="animate" variants={varFade({ distance: 20 }).inDown}>
      <Card
        sx={{
          p: { xs: 2.5, md: 3 },
          position: 'relative',
          overflow: 'hidden',
          '&:before': { content: '""', position: 'absolute', inset: '0 0 auto 0', height: 4, background: 'linear-gradient(90deg, #6B0F1E, #A6192E, #B5862F)' },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <AiAvatar size={40} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              Analyse IA des résultats
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {data?.generated_at
                ? `Générée le ${fDateTime(data.generated_at)}${data.cached ? ' · depuis le cache (données inchangées)' : ''}`
                : 'Lecture des résultats agrégés et masqués, selon les filtres actifs'}
            </Typography>
          </Box>
          <Tooltip title="Copier le texte">
            <span>
              <IconButton onClick={copy} disabled={!data}>
                <Iconify icon="solar:copy-bold-duotone" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Régénérer l'analyse">
            <span>
              <IconButton onClick={() => load(true)} disabled={loading}>
                <Iconify icon="solar:refresh-bold-duotone" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Fermer">
            <IconButton onClick={onClose}>
              <Iconify icon="mingcute:close-line" />
            </IconButton>
          </Tooltip>
        </Stack>

        {loading && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'text.secondary' }}>
              <TypingDots />
              <Typography variant="body2">Claude analyse les résultats… (30 à 60 secondes)</Typography>
            </Stack>
            <Skeleton variant="text" width="70%" height={36} />
            <Skeleton variant="rounded" height={90} />
            <Grid container spacing={2}>
              {[0, 1, 2].map((i) => (
                <Grid key={i} item xs={12} md={4}>
                  <Skeleton variant="rounded" height={140} />
                </Grid>
              ))}
            </Grid>
          </Stack>
        )}

        {error && !loading && (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => load()}>Réessayer</Button>}>
            {error}
          </Alert>
        )}

        {data && !loading && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, textWrap: 'balance' }}>
                {data.headline}
              </Typography>
              <Typography sx={{ mt: 1, color: 'text.secondary', lineHeight: 1.7 }}>{data.summary}</Typography>
            </Box>

            <Grid container spacing={2}>
              {COLUMNS.map((c) => (
                <Grid key={c.key} item xs={12} md={4}>
                  <Box sx={{ p: 2, height: 1, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                      <Iconify icon={c.icon} sx={{ color: `${c.color}.main` }} />
                      <Typography variant="subtitle2">{c.title}</Typography>
                    </Stack>
                    {data[c.key].length ? (
                      <Stack spacing={1.5}>
                        {data[c.key].map((p, i) => (
                          <Box key={i}>
                            <Typography variant="subtitle2" sx={{ fontSize: 13.5 }}>
                              {p.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                              {p.detail}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        Rien de notable.
                      </Typography>
                    )}
                  </Box>
                </Grid>
              ))}
            </Grid>

            {data.actions.length > 0 && (
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Iconify icon="solar:checklist-minimalistic-bold-duotone" sx={{ color: 'primary.main' }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Plan d'action proposé
                  </Typography>
                </Stack>
                <Stack divider={<Divider flexItem />} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  {data.actions.map((a, i) => (
                    <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} sx={{ p: 2 }} alignItems={{ sm: 'flex-start' }}>
                      <Box
                        sx={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', typography: 'subtitle2' }}
                      >
                        {i + 1}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2">{a.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                          {a.detail}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                        <Label variant="soft" color="default">
                          {a.owner}
                        </Label>
                        <Label variant="soft" color={HORIZON_COLOR[a.horizon] ?? 'info'}>
                          {a.horizon}
                        </Label>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {data.caveats.length > 0 && (
              <Alert severity="info" icon={<Iconify icon="solar:info-circle-bold-duotone" />}>
                <strong>Limites de lecture.</strong> {data.caveats.join(' · ')}
              </Alert>
            )}

            <Typography variant="caption" color="text.disabled">
              Généré par Claude (Anthropic) à partir des seuls agrégats du tableau de bord : aucune donnée individuelle n'est transmise, et
              les groupes trop petits restent masqués. Une analyse automatique à valider avant diffusion.
            </Typography>
          </Stack>
        )}
      </Card>
    </m.div>
  );
}
