import { useEffect, useState, type MouseEvent } from 'react';

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Popover from '@mui/material/Popover';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import CircularProgress from '@mui/material/CircularProgress';
import { Iconify } from '@vionhub/design-system/components';

import { useSpeech, type ServerVoice, type VoiceChoice } from '../../shared/speech';

const GENDER: Record<string, string> = { F: 'voix féminine', M: 'voix masculine' };

/** "Thomas (French (France))" → "Thomas"; "Google français" stays. */
export const cleanBrowserName = (n: string) => n.replace(/\s*\((?:[^()]|\([^)]*\))*\)\s*$/, '').replace(/^Microsoft\s+/, '');

const keyOf = (c: VoiceChoice) => (c === null ? 'auto' : c.engine === 'natural' ? `n:${c.id}` : `b:${c.name}`);

function describe(v: ServerVoice) {
  return [v.quality, v.gender ? GENDER[v.gender] : null, v.region].filter(Boolean).join(' · ');
}

/** "Voix" menu of the read-aloud bar: automatic, natural server voices, this device's French voices; ▶ to preview. */
export function VoicePicker() {
  const sp = useSpeech();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const previewing = (c: VoiceChoice) => sp.speakingId === 'voice-preview' && previewKey === keyOf(c);

  // the bar is only shown to logged-in users: fetch the voice names so the button shows the saved voice
  const { naturalAvailable, loadVoices } = sp;
  useEffect(() => {
    if (naturalAvailable) loadVoices();
  }, [naturalAvailable, loadVoices]);

  const open = (e: MouseEvent<HTMLElement>) => {
    sp.loadVoices();
    setAnchor(e.currentTarget);
  };
  const close = () => {
    if (sp.speakingId === 'voice-preview') sp.stop();
    setAnchor(null);
  };
  const play = (c: VoiceChoice) => {
    if (previewing(c)) return sp.stop();
    setPreviewKey(keyOf(c));
    sp.preview(c);
  };
  const choose = (c: VoiceChoice) => {
    sp.setVoice(c);
    play(c);
  };

  const natural = sp.voice?.engine === 'natural' ? sp.serverVoices?.find((v) => v.id === (sp.voice as { id: string }).id) : null;
  const def = sp.serverVoices?.find((v) => v.id === sp.serverDefault);
  const label =
    sp.voice === null
      ? 'Automatique'
      : sp.voice.engine === 'browser'
        ? cleanBrowserName(sp.voice.name)
        : natural
          ? natural.name
          : 'Voix naturelle';

  const row = (c: VoiceChoice, primary: string, secondary: string, star?: boolean) => {
    const k = keyOf(c);
    const selected = keyOf(sp.voice) === k;
    return (
      <ListItemButton key={k} selected={selected} onClick={() => choose(c)} sx={{ borderRadius: 1, mx: 1, pr: 6, position: 'relative' }}>
        <ListItemIcon sx={{ minWidth: 30 }}>
          {selected ? (
            <Iconify icon="solar:check-circle-bold" sx={{ color: 'primary.main' }} />
          ) : star ? (
            <Iconify icon="solar:star-bold-duotone" sx={{ color: 'secondary.main' }} width={18} />
          ) : (
            <Box sx={{ width: 20 }} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={primary}
          secondary={secondary}
          primaryTypographyProps={{ variant: 'subtitle2', noWrap: true }}
          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
        />
        <Tooltip title={previewing(c) ? 'Arrêter' : 'Écouter un exemple'}>
          <IconButton
            size="small"
            aria-label={`Écouter ${primary}`}
            onClick={(e) => {
              e.stopPropagation();
              play(c);
            }}
            sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: previewing(c) ? 'primary.main' : 'text.secondary' }}
          >
            <Iconify icon={previewing(c) ? 'solar:stop-circle-bold' : 'solar:play-circle-bold-duotone'} />
          </IconButton>
        </Tooltip>
      </ListItemButton>
    );
  };

  const sub = (t: string) => (
    <ListSubheader sx={{ lineHeight: '32px', typography: 'overline', bgcolor: 'background.paper', color: 'text.secondary' }}>{t}</ListSubheader>
  );

  return (
    <>
      <Tooltip title="Choisir la voix">
        <Button
          size="small"
          color="inherit"
          onClick={open}
          startIcon={<Iconify icon={sp.engine === 'natural' ? 'solar:soundwave-bold-duotone' : 'solar:user-speak-rounded-bold-duotone'} />}
          endIcon={<Iconify icon="solar:alt-arrow-down-linear" width={14} />}
          sx={{ color: sp.engine === 'natural' ? 'secondary.dark' : 'text.secondary', fontWeight: 600, maxWidth: 220, '& .MuiButton-startIcon': { mr: 0.5 } }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Voix : {label}
          </Box>
        </Button>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 32px)', maxHeight: 460 } } }}
      >
        <List dense disablePadding sx={{ pb: 1 }}>
          {sub('Recommandé')}
          {row(
            null,
            'Automatique',
            sp.naturalAvailable ? `Meilleure voix naturelle${def ? ` (${def.name})` : ''}` : 'Meilleure voix française de cet appareil',
          )}

          {sp.naturalAvailable && sub('Voix naturelles (en ligne)')}
          {sp.naturalAvailable && !sp.serverVoices && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 3, py: 1.5, color: 'text.secondary' }}>
              <CircularProgress size={16} />
              <Typography variant="caption">Chargement des voix…</Typography>
            </Box>
          )}
          {sp.serverVoices?.map((v) => row({ engine: 'natural', id: v.id }, v.name, describe(v), v.rank >= 5))}

          {sub('Voix de cet appareil')}
          {sp.browserVoices.length ? (
            sp.browserVoices.map((v) =>
              row(
                { engine: 'browser', name: v.name },
                cleanBrowserName(v.name),
                [v.lang.replace('_', '-'), v.localService ? 'hors ligne' : 'en ligne'].join(' · '),
              ),
            )
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 3, py: 1 }}>
              Aucune voix française installée sur cet appareil.
            </Typography>
          )}
        </List>
      </Popover>
    </>
  );
}
