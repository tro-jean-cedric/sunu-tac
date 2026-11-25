/**
 * Root providers for both apps: the @vionhub/design-system theme re-coloured to the SUNU
 * palette (layered with extendTheme, as documented in design-system docs/theming.md § 2),
 * French MUI strings, motion, toasts and the settings context the dashboard layout needs.
 */
import type { ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { frFR } from '@mui/material/locale';
import {
  Experimental_CssVarsProvider as CssVarsProvider,
  experimental_extendTheme as extendTheme,
} from '@mui/material/styles';
import { createPaletteChannel, createTheme, defaultThemeSettings } from '@vionhub/design-system/theme';
import { SettingsProvider, Snackbar } from '@vionhub/design-system/components';
import { MotionLazy } from '@vionhub/design-system/motion';

import '@vionhub/design-system/styles.css';

// SUNU brand: crimson of the logo (#A6192E) with the burgundy of the legacy pages (#6B0F1E), gold accent.
const primaryLight = createPaletteChannel({
  lighter: '#F8D9DD', light: '#D85A6B', main: '#A6192E', dark: '#6B0F1E', darker: '#3F0812', contrastText: '#FFFFFF',
});
const primaryDark = createPaletteChannel({
  lighter: '#FBE7EA', light: '#F0A6B2', main: '#E06C7F', dark: '#A6192E', darker: '#6B0F1E', contrastText: '#FFFFFF',
});
const gold = createPaletteChannel({
  lighter: '#F8EDD5', light: '#DCB26A', main: '#B5862F', dark: '#8A6420', darker: '#5C4213', contrastText: '#FFFFFF',
});

const theme = extendTheme(createTheme(frFR, defaultThemeSettings) as unknown as Parameters<typeof extendTheme>[0], {
  colorSchemes: {
    light: { palette: { primary: primaryLight, secondary: gold } },
    dark: { palette: { primary: primaryDark, secondary: gold } },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <CssVarsProvider theme={theme} defaultMode="light">
        <CssBaseline />
        <Snackbar />
        <MotionLazy>{children}</MotionLazy>
      </CssVarsProvider>
    </SettingsProvider>
  );
}

export const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? '—' : (Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString('fr-FR');
