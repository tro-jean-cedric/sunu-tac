import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Iconify, Label } from '@vionhub/design-system/components';
import { AnimateCountUp, m, varFade } from '@vionhub/design-system/motion';

import { CATEGORIES, FAMILLES } from '../shared/referentiel';
import { fmt } from '../shared/theme';
import { bandColor, loadCampaigns, loadCompanies, useAsync, useFilters } from './lib';

// ---------------------------------------------------------------- filter bar

/** Campagne / Entité / Catégorie / Famille — synced with the URL, shared by dashboard and list. */
export function FilterBar({ extra }: { extra?: ReactNode }) {
  const { filters, setFilter, resetFilters, active } = useFilters();
  const campaigns = useAsync(loadCampaigns, []);
  const companies = useAsync(loadCompanies, []);

  const field = {
    select: true,
    size: 'small' as const,
    sx: { flex: { xs: '1 1 100%', sm: '1 1 200px' }, minWidth: 0 },
    InputLabelProps: { shrink: true },
    SelectProps: { displayEmpty: true, MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } },
  };

  return (
    <Card sx={{ p: 2 }}>
      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
        <TextField
          {...field}
          label="Campagne"
          value={filters.campaign_id}
          onChange={(e) => setFilter('campaign_id', e.target.value)}
        >
          <MenuItem value="">Toutes les campagnes</MenuItem>
          {(campaigns.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          {...field}
          label="Entité"
          value={companies.data ? filters.company_id : ''}
          onChange={(e) => setFilter('company_id', e.target.value)}
        >
          <MenuItem value="">Toutes les entités du périmètre</MenuItem>
          {(companies.data ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          {...field}
          label="Catégorie"
          value={filters.categorie}
          onChange={(e) => setFilter('categorie', e.target.value)}
        >
          <MenuItem value="">Toutes les catégories</MenuItem>
          {CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          {...field}
          label="Famille de métier"
          value={filters.famille}
          onChange={(e) => setFilter('famille', e.target.value)}
        >
          <MenuItem value="">Toutes les familles</MenuItem>
          {FAMILLES.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        {active && (
          <Button
            color="inherit"
            size="small"
            onClick={resetFilters}
            startIcon={<Iconify icon="solar:restart-bold" />}
            sx={{ flexShrink: 0 }}
          >
            Réinitialiser
          </Button>
        )}
        {extra}
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------- cards

export function SectionCard({
  title,
  subheader,
  action,
  children,
  sx,
}: {
  title: ReactNode;
  subheader?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  sx?: object;
}) {
  return (
    <Card component={m.div} variants={varFade().inUp} initial="initial" animate="animate" sx={{ height: 1, ...sx }}>
      <CardHeader title={title} subheader={subheader} action={action} sx={{ pb: 0 }} />
      <Box sx={{ p: 3, pt: 2 }}>{children}</Box>
    </Card>
  );
}

type Tone = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';

export function KpiCard({
  title,
  value,
  unit,
  digits = 0,
  icon,
  tone = 'primary',
  caption,
}: {
  title: string;
  value: number | null | undefined;
  unit?: string;
  digits?: number;
  icon: string;
  tone?: Tone;
  caption?: ReactNode;
}) {
  return (
    <Card
      sx={{
        p: { xs: 2, sm: 2.5 },
        height: 1,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1.5, sm: 2 },
        alignItems: 'flex-start',
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 1.5,
          display: 'grid',
          placeItems: 'center',
          color: `${tone}.main`,
          bgcolor: (t) => `rgba(${t.vars.palette[tone].mainChannel} / 0.12)`,
        }}
      >
        <Iconify icon={icon} width={28} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 0.5 }}>
          {title}
        </Typography>
        {value == null ? (
          <Typography variant="h3">—</Typography>
        ) : digits === 0 ? (
          <AnimateCountUp variant="h3" to={Math.round(value)} unit={unit} duration={1.2} />
        ) : (
          // AnimateCountUp formats with a dot; decimals are shown statically in French format.
          <Typography variant="h3">
            {fmt(value, digits)}
            {unit}
          </Typography>
        )}
        {caption && (
          <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {caption}
          </Typography>
        )}
      </Box>
    </Card>
  );
}

// ---------------------------------------------------------------- small pieces

export function ProfileLabel({ profil, invalide }: { profil: string | null | undefined; invalide?: boolean }) {
  if (invalide) return <Label color="default">non exploitable</Label>;
  if (!profil) return <Typography variant="body2">—</Typography>;
  return <Label color={bandColor(profil)}>{profil}</Label>;
}

export function ScoreBar({
  label,
  value,
  color,
  hint,
}: {
  label: ReactNode;
  value: number | null | undefined;
  color: string;
  hint?: ReactNode;
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmt(value)}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={value ?? 0}
        sx={{
          height: 8,
          borderRadius: 1,
          bgcolor: 'action.selected',
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
        }}
      />
      {hint && (
        <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <Card sx={{ py: 8, px: 3, textAlign: 'center' }}>
      <Stack spacing={2} alignItems="center">
        <Box
          sx={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: 'text.disabled',
            bgcolor: 'action.hover',
          }}
        >
          <Iconify icon="solar:inbox-line-bold-duotone" width={48} />
        </Box>
        <Typography variant="h6">{title}</Typography>
        {description && (
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 520 }}>
            {description}
          </Typography>
        )}
        {action}
      </Stack>
    </Card>
  );
}

/** "Usage interne DRH — ne pas diffuser" eyebrow shown on every results page. */
export function InternalUse() {
  return (
    <Label color="primary" variant="soft" startIcon={<Iconify icon="solar:shield-warning-bold" />}>
      Usage interne DRH — ne pas diffuser
    </Label>
  );
}
