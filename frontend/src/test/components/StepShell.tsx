import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';
import { m, varFade } from '@vionhub/design-system/motion';

import { ReadAloudBar, type SpeechSpec } from './ReadAloud';

interface Props {
  eyebrow: string;
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  /** changes on every step so the fade replays */
  stepKey: string;
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  footer?: ReactNode;
  /** what the read-aloud button reads on this step */
  speech?: SpeechSpec;
}

export function StepShell({ eyebrow, title, hint, children, stepKey, onPrev, onNext, nextLabel = 'Suivant', nextDisabled, nextLoading, footer, speech }: Props) {
  return (
    <m.div key={stepKey} initial="initial" animate="animate" variants={varFade({ distance: 24 }).inUp}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: 'primary.main', letterSpacing: 1.6 }}>
            {eyebrow}
          </Typography>
          {title && (
            <Typography variant="h4" component="h1" sx={{ mt: 0.5, fontWeight: 700, textWrap: 'balance' }}>
              {title}
            </Typography>
          )}
          {hint && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {hint}
            </Typography>
          )}
        </Box>
        {speech && <ReadAloudBar id={speech.id} segments={speech.segments} />}
        {children}
        <Stack direction="row" spacing={1.5} alignItems="center" className="no-print">
          {onPrev && (
            <Button size="large" variant="outlined" color="inherit" onClick={onPrev} startIcon={<Iconify icon="solar:alt-arrow-left-linear" />}>
              Précédent
            </Button>
          )}
          {onNext && (
            <Button
              size="large"
              variant="contained"
              color="primary"
              onClick={onNext}
              disabled={nextDisabled || nextLoading}
              endIcon={<Iconify icon="solar:alt-arrow-right-linear" />}
            >
              {nextLoading ? 'Envoi…' : nextLabel}
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
        </Stack>
        {footer}
      </Stack>
    </m.div>
  );
}
