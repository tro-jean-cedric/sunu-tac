import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import {
  DebouncedSearchField,
  Iconify,
  Label,
  Scrollbar,
  TableHeadCustom,
  TablePaginationCustom,
} from '@vionhub/design-system/components';
import { SunuBreadcrumbs } from '../brand';

import { api } from '../../shared/api';
import { DIMS } from '../../shared/referentiel';
import { fmt } from '../../shared/theme';
import type { SubmissionResult } from '../../shared/types';
import { FilterBar, InternalUse, ProfileLabel } from '../components';
import { fDate, useAsync, useFilters } from '../lib';
import { RespondentDrawer } from './RespondentDrawer';

const SIZES = [10, 25, 50, 100];

const HEAD = [
  { id: 'matricule', label: 'Répondant', minWidth: 170 },
  { id: 'filiale', label: 'Entité', minWidth: 180 },
  { id: 'campagne', label: 'Campagne' },
  { id: 'submitted_at', label: 'Date', minWidth: 110 },
  { id: 'global', label: 'Global', align: 'right' as const },
  ...DIMS.map((d) => ({ id: `dim_${d.id}`, label: d.label.slice(0, 4) + '.', align: 'right' as const })),
  { id: 'profil', label: 'Profil', minWidth: 140 },
  { id: 'ds', label: 'DS', align: 'right' as const },
  { id: 'inc', label: 'INC', align: 'right' as const },
  { id: 'flags', label: 'Indicateurs', minWidth: 120 },
];
const SORTABLE = new Set(['matricule', 'filiale', 'campagne', 'submitted_at', 'global']);

export function RespondentsPage() {
  const { filters } = useFilters();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const invalidOnly = params.get('invalides') === '1';
  const sort = params.get('tri') ?? 'global';
  const order = params.get('ordre') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0);
  const size = SIZES.includes(Number(params.get('taille'))) ? Number(params.get('taille')) : 25;
  const openId = Number(params.get('fiche')) || null;

  const patch = useCallback(
    (o: Record<string, string | number | null>, resetPage = true) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          Object.entries(o).forEach(([k, v]) => (v === null || v === '' ? p.delete(k) : p.set(k, String(v))));
          if (resetPage && !('page' in o)) p.delete('page');
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  const query = useMemo(
    () => ({ ...filters, q, invalid: invalidOnly ? true : ('' as const), sort, order, page, size }),
    [filters, q, invalidOnly, sort, order, page, size],
  );
  const list = useAsync(() => api.individuals(query), [query]);

  const onSort = (id: string) => {
    if (!SORTABLE.has(id)) return;
    const nextOrder = sort === id ? (order === 'asc' ? 'desc' : 'asc') : id === 'global' ? 'desc' : 'asc';
    patch({ tri: id, ordre: nextOrder });
  };

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  return (
    <Stack spacing={3}>
      <Box>
        <InternalUse />
        <SunuBreadcrumbs
          heading="Répondants"
          links={[{ name: 'Console DRH', href: '/' }, { name: 'Répondants' }]}
          sx={{ mt: 1.5 }}
        />
      </Box>

      <Alert severity="warning" icon={<Iconify icon="solar:lock-password-bold-duotone" />}>
        Donnée nominative : accès limité à la DRH Groupe et au manager direct.
      </Alert>

      <FilterBar />

      <Card>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ p: 2.5 }}
        >
          <DebouncedSearchField
            value={q}
            onDebouncedChange={(v) => patch({ q: v.trim() })}
            placeholder="Rechercher un matricule ou un nom…"
            loading={list.loading}
            sx={{ flex: 1, maxWidth: { sm: 420 } }}
          />
          <FormControlLabel
            control={<Switch checked={invalidOnly} onChange={(e) => patch({ invalides: e.target.checked ? 1 : null })} />}
            label="Invalides uniquement"
          />
          <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {fmt(total)} passation{total > 1 ? 's' : ''}
          </Typography>
        </Stack>

        {list.loading && <LinearProgress sx={{ height: 2 }} />}
        {list.error && (
          <Alert severity="error" sx={{ mx: 2.5, mb: 2 }}>
            {list.error}
          </Alert>
        )}

        <TableContainer>
          <Scrollbar>
            <Table size="small" sx={{ minWidth: 1080 }}>
              <TableHeadCustom headLabel={HEAD} order={order} orderBy={sort} onSort={onSort} />
              <TableBody>
                {items.map((r) => (
                  <Row key={r.id} r={r} onOpen={() => patch({ fiche: r.id }, false)} selected={r.id === openId} />
                ))}
                {!list.loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={HEAD.length} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      Aucune passation ne correspond à ces critères.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Scrollbar>
        </TableContainer>

        <TablePaginationCustom
          count={total}
          page={total && page * size >= total ? 0 : page}
          rowsPerPage={size}
          rowsPerPageOptions={SIZES}
          onPageChange={(_, p) => patch({ page: p || null }, false)}
          onRowsPerPageChange={(e) => patch({ taille: Number(e.target.value) })}
          labelRowsPerPage="Lignes par page :"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`}
        />
      </Card>

      <RespondentDrawer
        id={openId}
        onClose={() => patch({ fiche: null }, false)}
        onDeleted={() => {
          patch({ fiche: null }, false);
          list.reload();
        }}
      />
    </Stack>
  );
}

function Row({ r, onOpen, selected }: { r: SubmissionResult; onOpen: () => void; selected: boolean }) {
  return (
    <TableRow
      hover
      selected={selected}
      onClick={onOpen}
      sx={{ cursor: 'pointer', '& td': { opacity: r.invalide ? 0.5 : 1 } }}
    >
      <TableCell>
        <Typography variant="subtitle2">{r.matricule}</Typography>
        {r.name && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="div">
            {r.name}
          </Typography>
        )}
      </TableCell>
      <TableCell>
        <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>
          {r.filiale ?? '—'}
        </Typography>
      </TableCell>
      <TableCell>
        <Label variant="soft">{r.campaign.code}</Label>
      </TableCell>
      <TableCell>{fDate(r.submitted_at)}</TableCell>
      <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {fmt(r.global)}
      </TableCell>
      {DIMS.map((d) => (
        <TableCell key={d.id} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmt(r.scores[d.id])}
        </TableCell>
      ))}
      <TableCell>
        <ProfileLabel profil={r.profil} invalide={r.invalide} />
      </TableCell>
      <TableCell align="right">{r.ds}</TableCell>
      <TableCell align="right">{r.inc}</TableCell>
      <TableCell>
        <Flags r={r} />
      </TableCell>
    </TableRow>
  );
}

export function Flags({ r }: { r: SubmissionResult }) {
  const flags: { label: string; color: 'warning' | 'info' | 'error' }[] = [];
  if (r.ds_haut) flags.push({ label: 'DS≥3', color: 'warning' });
  if (r.rapide) flags.push({ label: 'rapide', color: 'info' });
  if (r.uniforme) flags.push({ label: 'uniforme', color: 'error' });
  if (!flags.length) return <Typography variant="body2" sx={{ color: 'text.disabled' }}>—</Typography>;
  return (
    <Stack direction="row" spacing={0.5}>
      {flags.map((f) => (
        <Label key={f.label} color={f.color} variant="soft">
          {f.label}
        </Label>
      ))}
    </Stack>
  );
}
