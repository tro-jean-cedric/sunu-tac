import { useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Iconify } from '@vionhub/design-system/components';

import { RATES, useSpeech, type Rate } from '../../shared/speech';
import { VoicePicker } from './VoicePicker';

export interface SpeechSpec {
  /** stable id for this block (changes per step) */
  id: string;
  segments: string[];
}

const pulse = {
  '@keyframes tacPulse': {
    '0%': { boxShadow: '0 0 0 0 rgba(166,25,46,.45)' },
    '70%': { boxShadow: '0 0 0 10px rgba(166,25,46,0)' },
    '100%': { boxShadow: '0 0 0 0 rgba(166,25,46,0)' },
  },
};

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

/** Speaker toolbar shown on each test step: Écouter / Arrêter, auto-read toggle, speed. Keyboard: L. */
export function ReadAloudBar({ id, segments }: SpeechSpec) {
  const sp = useSpeech();
  const reading = sp.speakingId === id;
  const latest = useRef({ id, segments });
  latest.current = { id, segments };
  const spRef = useRef(sp);
  spRef.current = sp;

  // auto-read when a new step appears; stop when leaving it
  useEffect(() => {
    if (!sp.supported) return;
    const t = sp.auto ? window.setTimeout(() => spRef.current.speak(latest.current.id, latest.current.segments), 450) : undefined;
    return () => {
      window.clearTimeout(t);
      spRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sp.supported]);

  // keyboard shortcut L
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || e.key.toLowerCase() !== 'l') return;
      e.preventDefault();
      spRef.current.toggle(latest.current.id, latest.current.segments);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!sp.supported) return null;

  return (
    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap className="no-print" sx={{ rowGap: 1 }}>
      <Tooltip title={reading ? 'Arrêter la lecture (L)' : 'Lire à voix haute (L)'}>
        <Button
          size="small"
          variant={reading ? 'contained' : 'outlined'}
          color="primary"
          onClick={() => sp.toggle(id, segments)}
          startIcon={<Iconify icon={reading ? 'solar:stop-circle-bold' : 'solar:volume-loud-bold-duotone'} />}
          aria-pressed={reading}
          sx={{ ...pulse, borderRadius: 5, ...(reading && { animation: 'tacPulse 1.6s infinite' }) }}
        >
          {reading ? (sp.preparing ? 'Chargement…' : 'Arrêter') : 'Écouter'}
        </Button>
      </Tooltip>
      <VoicePicker />
      <FormControlLabel
        sx={{ m: 0, '& .MuiFormControlLabel-label': { typography: 'caption', color: 'text.secondary' } }}
        control={<Switch size="small" checked={sp.auto} onChange={(e) => sp.setAuto(e.target.checked)} />}
        label="Lecture auto"
      />
      <Box sx={{ flex: { xs: 0, sm: 1 } }} />
      <Tooltip title="Vitesse de lecture">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sp.rate}
          onChange={(_, v: Rate | null) => v && sp.setRate(v)}
          aria-label="Vitesse de lecture"
          sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, typography: 'caption', fontWeight: 600 } }}
        >
          {RATES.map((r) => (
            <ToggleButton key={r} value={r} aria-label={`Vitesse ${r}`}>
              {r.toLocaleString('fr-FR')}×
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Tooltip>
    </Stack>
  );
}

/** Small speaker icon for reading one item (e.g. a single likert statement). */
export function SpeakIcon({ id, segments, label }: SpeechSpec & { label: string }) {
  const sp = useSpeech();
  if (!sp.supported) return null;
  const reading = sp.speakingId === id;
  return (
    <Tooltip title={reading ? 'Arrêter' : 'Écouter'}>
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          sp.toggle(id, segments);
        }}
        aria-label={`${reading ? 'Arrêter' : 'Écouter'} : ${label}`}
        className="no-print"
        sx={{ color: reading ? 'primary.main' : 'text.disabled', '&:hover': { color: 'primary.main' } }}
      >
        <Iconify icon={reading ? 'solar:stop-circle-bold' : 'solar:volume-loud-bold-duotone'} width={20} />
      </IconButton>
    </Tooltip>
  );
}
