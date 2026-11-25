import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { Iconify, Label } from '@vionhub/design-system/components';

import type { Campaign, Me } from '../../shared/types';

interface Props {
  me: Me | null;
  crumb: string;
  progress: number;
  campaign?: Campaign;
  onSignOut: () => void;
}

export function TopBar({ me, crumb, progress, campaign, onSignOut }: Props) {
  return (
    <Box
      className="no-print"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        color: 'common.white',
        background: 'linear-gradient(90deg, #6B0F1E 0%, #A6192E 100%)',
        boxShadow: '0 8px 24px -12px rgba(107,15,30,.55)',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ maxWidth: 960, mx: 'auto', px: { xs: 2, sm: 3 }, py: 1.25, pt: 'max(10px, env(safe-area-inset-top))' }}
      >
        <Box
          component="img"
          src="/logo/logo-single.png"
          alt="SUNU"
          sx={{ width: 34, height: 34, bgcolor: 'common.white', borderRadius: 1, p: 0.25, flexShrink: 0 }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ lineHeight: 1.2, letterSpacing: 0.5 }}>
            TAC&#8209;SUNU
          </Typography>
          <Typography variant="caption" noWrap component="div" sx={{ opacity: 0.85 }}>
            {crumb}
          </Typography>
        </Box>
        {campaign && (
          <Label variant="filled" color="secondary" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
            {campaign.code}
          </Label>
        )}
        {me && (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="body2" noWrap sx={{ display: { xs: 'none', md: 'block' }, maxWidth: 220, opacity: 0.9 }}>
              {me.name}
            </Typography>
            <Tooltip title="Se déconnecter">
              <IconButton onClick={onSignOut} sx={{ color: 'inherit' }} aria-label="Se déconnecter">
                <Iconify icon="solar:logout-2-bold-duotone" />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={progress}
        aria-label="Progression du test"
        sx={{
          height: 3,
          bgcolor: 'rgba(255,255,255,.2)',
          '& .MuiLinearProgress-bar': { bgcolor: 'secondary.light', transition: 'transform .35s ease' },
        }}
      />
    </Box>
  );
}
