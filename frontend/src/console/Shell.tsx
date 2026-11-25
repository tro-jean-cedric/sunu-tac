import type { ReactNode } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import { DashboardContent, DashboardLayout } from '@vionhub/design-system/layouts';
import type { DashboardNavSection } from '@vionhub/design-system/layouts';
import { Iconify, Label } from '@vionhub/design-system/components';

import { useAiEnabled } from '../shared/ai';
import { scopeOf, useSession } from './session';

const icon = (name: string) => <Iconify icon={name} width={24} />;

export function Shell({ children }: { children: ReactNode }) {
  const { me, signOut } = useSession();
  const scope = scopeOf(me);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const aiEnabled = useAiEnabled();

  const nav: DashboardNavSection[] = [
    {
      subheader: 'Dépouillement',
      items: [
        { title: 'Tableau de bord', path: '/', icon: icon('solar:chart-2-bold-duotone') },
        { title: 'Répondants', path: '/repondants', icon: icon('solar:users-group-rounded-bold-duotone') },
        { title: 'Import', path: '/import', icon: icon('solar:upload-minimalistic-bold-duotone') },
        ...(aiEnabled
          ? [{ title: 'Assistant IA', path: '/assistant', icon: icon('solar:magic-stick-3-bold-duotone') }]
          : []),
      ],
    },
    {
      subheader: 'Pilotage',
      items: [
        { title: 'Campagnes', path: '/campagnes', icon: icon('solar:calendar-mark-bold-duotone') },
        { title: 'Questionnaires', path: '/questionnaires', icon: icon('solar:document-text-bold-duotone') },
        ...(me.is_hr_admin
          ? [{ title: 'Administration', path: '/admin', icon: icon('solar:shield-user-bold-duotone') }]
          : []),
      ],
    },
  ];

  const scopeLabel = (
    <Tooltip
      title={
        scope.group
          ? 'DRH Groupe : toutes les entités'
          : scope.entities.length
            ? `DRH Entité : ${scope.entities.join(', ')}`
            : 'Aucun périmètre attribué'
      }
    >
      <Label
        color={scope.group ? 'primary' : 'secondary'}
        variant="soft"
        startIcon={<Iconify icon={scope.group ? 'solar:globus-bold-duotone' : 'solar:buildings-2-bold-duotone'} />}
        sx={{ ml: 1, flexShrink: 0 }}
      >
        {compact
          ? scope.label.length > 16
            ? `${scope.label.slice(0, 15)}…`
            : scope.label
          : `Périmètre : ${scope.label}`}
      </Label>
    </Tooltip>
  );

  return (
    <DashboardLayout
      data={{
        nav,
        user: { displayName: me.name, email: me.email ?? `${me.username} · ${scope.group ? 'DRH Groupe' : 'DRH Entité'}` },
        account: [],
      }}
      slotProps={{ account: { onSignOut: signOut, signOutLabel: 'Se déconnecter' } }}
      headerSlots={{ leftAreaEnd: scopeLabel }}
    >
      <DashboardContent maxWidth="xl">{children}</DashboardContent>
    </DashboardLayout>
  );
}
