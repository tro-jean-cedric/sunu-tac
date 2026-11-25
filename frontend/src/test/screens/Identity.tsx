import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';

import { CATEGORIES, FAMILLES } from '../../shared/referentiel';
import type { Campaign, Me } from '../../shared/types';
import { StepShell } from '../components/StepShell';

interface Props {
  me: Me;
  campaign: Campaign;
  categorie: string;
  famille: string;
  onChange: (p: { categorie?: string; famille?: string }) => void;
  onPrev: () => void;
  onNext: () => void;
}

const CAT_ICONS = ['solar:crown-bold-duotone', 'solar:users-group-rounded-bold-duotone', 'solar:user-rounded-bold-duotone'];
const FAM_ICONS = ['solar:case-minimalistic-bold-duotone', 'solar:settings-bold-duotone', 'solar:shield-check-bold-duotone'];

function Choice({ label, icon, selected, onClick }: { label: string; icon: string; selected: boolean; onClick: () => void }) {
  const [main, detail] = label.split(' (');
  return (
    <ButtonBase
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      sx={{
        width: '100%',
        height: '100%',
        p: 2,
        borderRadius: 1.5,
        textAlign: 'left',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 1.5,
        border: '1.5px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.lighter' : 'background.paper',
        transition: 'all .15s ease',
        '&:hover': { borderColor: 'primary.light' },
        '[data-mui-color-scheme="dark"] &': selected ? { bgcolor: 'rgba(224,108,127,.12)' } : {},
      }}
    >
      <Iconify icon={icon} width={26} sx={{ color: selected ? 'primary.main' : 'text.disabled', flexShrink: 0 }} />
      <Box>
        <Typography variant="subtitle2">{main}</Typography>
        {detail && (
          <Typography variant="caption" color="text.secondary">
            {detail.replace(/\)$/, '')}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
}

export function Identity({ me, campaign, categorie, famille, onChange, onPrev, onNext }: Props) {
  const entity = me.company?.name ?? me.filliale ?? '—';
  return (
    <StepShell
      stepKey="ident"
      eyebrow="Avant de commencer"
      title="Vous concernant"
      hint="Ces informations servent aux restitutions collectives par entité et par catégorie. Aucune restitution n'est produite en dessous de cinq personnes."
      onPrev={onPrev}
      onNext={onNext}
      nextLabel="Commencer la partie 1"
      nextDisabled={!categorie || !famille}
    >
      <Card sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: 'primary.main', width: 52, height: 52, fontWeight: 700 }}>
            {me.name
              .split(' ')
              .slice(0, 2)
              .map((w) => w[0])
              .join('')}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              {me.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {[me.title, me.department].filter(Boolean).join(' · ') || me.email}
            </Typography>
          </Box>
        </Stack>
        <Grid container spacing={2} sx={{ mt: 1.5 }}>
          {[
            ['Matricule', me.username, 'solar:user-id-bold-duotone'],
            ['Entité', entity, 'solar:buildings-2-bold-duotone'],
            ['Campagne', campaign.label, 'solar:calendar-mark-bold-duotone'],
          ].map(([k, v, icon]) => (
            <Grid item xs={12} sm={4} key={k}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, borderRadius: 1, bgcolor: 'background.neutral' }}>
                <Iconify icon={icon} width={22} sx={{ color: 'text.secondary' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">
                    {k}
                  </Typography>
                  <Typography variant="subtitle2" noWrap title={v}>
                    {v}
                  </Typography>
                </Box>
              </Stack>
            </Grid>
          ))}
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Ces informations proviennent de l'annuaire SUNU. En cas d'erreur, signalez-la à votre DRH.
        </Typography>
      </Card>

      <Box role="radiogroup" aria-label="Catégorie">
        <Typography variant="subtitle1" sx={{ mb: 1.25 }}>
          Votre catégorie
        </Typography>
        <Grid container spacing={1.5}>
          {CATEGORIES.map((c, i) => (
            <Grid item xs={12} sm={4} key={c}>
              <Choice label={c} icon={CAT_ICONS[i]} selected={categorie === c} onClick={() => onChange({ categorie: c })} />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box role="radiogroup" aria-label="Famille de métier">
        <Typography variant="subtitle1" sx={{ mb: 1.25 }}>
          Votre famille de métier
        </Typography>
        <Grid container spacing={1.5}>
          {FAMILLES.map((f, i) => (
            <Grid item xs={12} sm={4} key={f}>
              <Choice label={f} icon={FAM_ICONS[i]} selected={famille === f} onClick={() => onChange({ famille: f })} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </StepShell>
  );
}
