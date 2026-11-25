/** Item analysis of a published version: answer distributions and discrimination (collective, n ≥ threshold). */
import { useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Label } from '@vionhub/design-system/components';

import { api } from '../../../shared/api';
import { scaleBounds } from '../../../shared/referentiel';
import type { ItemStats, QuestionnaireFull } from '../../../shared/types';
import { useAsync } from '../../lib';
import { DimLabel, EXTRA_TYPES } from './common';

const share = (n: number, tot: number) => (tot ? Math.round((n / tot) * 100) : 0);

function Bar({ label, n, total, highlight, note }: { label: ReactNode; n: number; total: number; highlight?: boolean; note?: ReactNode }) {
  const p = share(n, total);
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Typography variant="body2" sx={{ flex: '0 0 46%', minWidth: 0 }} noWrap title={typeof label === 'string' ? label : undefined}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 10, borderRadius: 5, bgcolor: 'background.neutral', overflow: 'hidden' }}>
        <Box sx={{ width: `${p}%`, height: 1, bgcolor: highlight ? 'primary.main' : 'grey.500', transition: 'width .3s' }} />
      </Box>
      <Typography variant="caption" sx={{ width: 64, textAlign: 'right', flexShrink: 0 }}>
        {p} % <Box component="span" sx={{ color: 'text.disabled' }}>({n})</Box>
      </Typography>
      {note}
    </Stack>
  );
}

function Discrimination({ r }: { r: number | null | undefined }) {
  if (r == null) return <Label variant="soft">Discrimination n/d</Label>;
  const [color, txt] = r >= 0.3 ? (['success', 'bonne'] as const) : r >= 0.15 ? (['warning', 'moyenne'] as const) : (['error', 'faible'] as const);
  return (
    <Tooltip title="Corrélation entre la réponse à cet item et le score de sa dimension. Faible (< 0,15) : l'item mesure mal la dimension ou n'est pas compris ; à revoir.">
      <Label color={color} variant="soft">
        Discrimination {r.toFixed(2)} · {txt}
      </Label>
    </Tooltip>
  );
}

function ItemCard({ id, title, children, right }: { id: string; title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', flexShrink: 0 }}>
          {id}
        </Typography>
        <Typography variant="body2" sx={{ flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {title}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
          {right}
        </Stack>
      </Stack>
      <Stack spacing={0.75}>{children}</Stack>
    </Card>
  );
}

export function StatsPanel({ q }: { q: QuestionnaireFull }) {
  const [campaign, setCampaign] = useState<number | ''>('');
  const st = useAsync(() => api.questionnaireStats(q.id, campaign), [q.id, campaign]);
  const c = q.content;
  const [lo, hi] = scaleBounds(c);
  const s: ItemStats | undefined = st.data;

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, maxWidth: 760 }}>
          Analyse des réponses <strong>exploitables</strong> de votre périmètre, pour vérifier que chaque item fonctionne (réponses
          bien réparties, cohérentes avec le score de la dimension). Aucune donnée individuelle n'est affichée.
        </Typography>
        <TextField select size="small" label="Campagne" value={campaign} onChange={(e) => setCampaign(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 220 }} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}>
          <MenuItem value="">Toutes les campagnes ({q.campaigns.length})</MenuItem>
          {q.campaigns.map((cp) => (
            <MenuItem key={cp.id} value={cp.id}>
              {cp.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {st.loading && <LinearProgress />}
      {st.error && <Alert severity="error">{st.error}</Alert>}
      {s && s.masked && (
        <Alert severity="info">
          {s.n} réponse{s.n > 1 ? 's' : ''} exploitable{s.n > 1 ? 's' : ''} : les statistiques par item s'affichent à partir de {s.min_group_size}{' '}
          répondants, pour préserver l'anonymat.
        </Alert>
      )}
      {s && !s.masked && (
        <>
          <Typography variant="subtitle1">{s.n} réponses analysées</Typography>

          <Typography variant="h6">Mises en situation</Typography>
          {c.situations.map((it) => {
            const x = s.items[it.id];
            if (!x) return null;
            const best = Math.max(...it.options.map((o) => o.points));
            return (
              <ItemCard key={it.id} id={it.id} title={it.txt} right={<><DimLabel dim={it.dim} short /><Discrimination r={x.discrimination} /></>}>
                {it.options.map((o, k) => (
                  <Bar key={k} label={`${o.points} pt${o.points > 1 ? 's' : ''} — ${o.txt}`} n={x.options?.[k] ?? 0} total={x.n} highlight={o.points === best} />
                ))}
                <Typography variant="caption" color="text.secondary">
                  Score moyen : {x.mean_pct == null ? '—' : `${Math.round(x.mean_pct)} %`} du maximum
                </Typography>
              </ItemCard>
            );
          })}

          <Typography variant="h6">Choix forcés</Typography>
          {c.blocs.map((b) => {
            const x = s.items[b.id];
            if (!x) return null;
            return (
              <ItemCard key={b.id} id={b.id} title={`${x.n} réponses`}>
                {b.items.map((it, k) => (
                  <Stack key={k} direction="row" spacing={1} alignItems="center">
                    <DimLabel dim={it.dim} short />
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                      {it.txt}
                    </Typography>
                    <Label color="primary" variant="soft">
                      + {share(x.most?.[k] ?? 0, x.n)} %
                    </Label>
                    <Label variant="soft">− {share(x.least?.[k] ?? 0, x.n)} %</Label>
                  </Stack>
                ))}
              </ItemCard>
            );
          })}

          <Typography variant="h6">Pratiques et contrôles</Typography>
          {[...c.likert, ...c.validite].map((it) => {
            const x = s.items[it.id];
            if (!x) return null;
            const isLik = 'dim' in it;
            return (
              <ItemCard
                key={it.id}
                id={it.id}
                title={it.txt}
                right={
                  isLik ? (
                    <>
                      <DimLabel dim={it.dim} short />
                      {it.rev && <Label variant="outlined">Inversé</Label>}
                      <Discrimination r={x.discrimination} />
                    </>
                  ) : (
                    <Label variant="outlined">{it.kind === 'ds' ? 'DS' : 'INC'}</Label>
                  )
                }
              >
                <Box sx={{ display: 'flex', height: 18, borderRadius: 1, overflow: 'hidden' }}>
                  {(x.distribution ?? []).map((n, k) => {
                    const p = share(n, x.n);
                    return (
                      <Tooltip key={k} title={`${c.echelle[k]?.label ?? lo + k} : ${p} % (${n})`}>
                        <Box sx={{ width: `${p}%`, bgcolor: 'primary.main', opacity: 0.25 + (0.75 * k) / Math.max(1, hi - lo), display: 'grid', placeItems: 'center', color: 'common.white', fontSize: 10 }}>
                          {p >= 8 ? `${p}%` : ''}
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Moyenne : {x.mean == null ? '—' : x.mean.toFixed(2)} sur {hi} · {c.echelle[0]?.label} → {c.echelle.at(-1)?.label}
                </Typography>
              </ItemCard>
            );
          })}

          {c.extras.length > 0 && <Typography variant="h6">{c.extrasTitre || 'Questions complémentaires'}</Typography>}
          {c.extras.map((e) => {
            const x = s.items[e.id];
            if (!x) return null;
            return (
              <ItemCard key={e.id} id={e.id} title={e.txt} right={<Label variant="soft">{EXTRA_TYPES[e.type].label} · {x.n} rép.</Label>}>
                {(e.type === 'single' || e.type === 'multiple') &&
                  (e.options ?? []).map((o, k) => <Bar key={k} label={o.txt} n={x.options?.[k] ?? 0} total={x.n} highlight />)}
                {e.type === 'yesno' &&
                  (e.labels ?? ['Oui', 'Non']).map((l, k) => <Bar key={k} label={l} n={x.options?.[k] ?? 0} total={x.n} highlight={k === 0} />)}
                {e.type === 'scale' && (
                  <>
                    {(x.distribution ?? []).map((n, k) => (
                      <Bar key={k} label={String((e.min ?? 0) + k * (e.step ?? 1))} n={n} total={x.n} highlight />
                    ))}
                    <Typography variant="caption" color="text.secondary">
                      Moyenne : {x.mean == null ? '—' : x.mean.toFixed(1)}
                    </Typography>
                  </>
                )}
                {e.type === 'ranking' &&
                  (e.options ?? [])
                    .map((o, k) => ({ o, r: x.mean_rank?.[k] }))
                    .sort((a, b) => (a.r ?? 99) - (b.r ?? 99))
                    .map(({ o, r }, i) => (
                      <Stack key={o.txt + i} direction="row" spacing={1.5}>
                        <Label color={i === 0 ? 'primary' : 'default'}>{i + 1}</Label>
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {o.txt}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          rang moyen {r == null ? '—' : r.toFixed(1)}
                        </Typography>
                      </Stack>
                    ))}
                {e.type === 'text' && (
                  <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
                    {(x.texts ?? []).map((t, k) => (
                      <Typography key={k} variant="body2" sx={{ py: 0.75, borderTop: k ? '1px dashed' : 0, borderColor: 'divider' }}>
                        « {t} »
                      </Typography>
                    ))}
                    {!x.texts?.length && <Typography color="text.secondary">Aucune réponse.</Typography>}
                  </Box>
                )}
              </ItemCard>
            );
          })}
        </>
      )}
    </Stack>
  );
}
