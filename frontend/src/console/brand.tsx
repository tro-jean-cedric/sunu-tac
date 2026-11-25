/**
 * SUNU re-branding of design-system pieces whose colour is hard-coded (not themeable):
 * CustomBreadcrumbs paints its title band in VionHub red (#cb3b2a) via a ::before.
 */
import type { ComponentProps } from 'react';
import { CustomBreadcrumbs } from '@vionhub/design-system/components';

export const SUNU_BAND = 'linear-gradient(90deg, #6B0F1E 0%, #A6192E 100%)';

export function SunuBreadcrumbs({ sx, ...props }: ComponentProps<typeof CustomBreadcrumbs>) {
  return (
    <CustomBreadcrumbs
      {...props}
      sx={[{ '& > .MuiStack-root:first-of-type::before': { background: SUNU_BAND } }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    />
  );
}
