import { useCallback, useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Iconify, Label } from '@vionhub/design-system/components';
import { m, varFade } from '@vionhub/design-system/motion';

import { streamAi, useAiEnabled } from '../../shared/ai';
import { AiAvatar, AiChat, Markdown, SpeakText, TypingDots } from '../../shared/ai-ui';
import { DIMNAME, type DimKey } from '../../shared/referentiel';

interface Props {
  campaignId: number;
  domBas: DimKey;
  domHaut: DimKey;
}

type Status = 'loading' | 'streaming' | 'done' | 'error';

/** Results page: Claude's personal debrief (streamed, cached server-side) + "Parlez à votre coach" chat. */
export function AiCoach(props: Props) {
  const enabled = useAiEnabled();
  if (!enabled) return null;
  return <AiCoachInner {...props} />;
}

function AiCoachInner({ campaignId, domBas, domHaut }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(() => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setText('');
    setError(null);
    setStatus('loading');
    streamAi('/ai/me/debrief', { campaign_id: campaignId }, {
      signal: ac.signal,
      onDelta: (t) => {
        setStatus('streaming');
        setText((cur) => cur + t);
      },
    })
      .then(() => !ac.signal.aborted && setStatus('done'))
      .catch((e: Error) => {
        if (e.name === 'AbortError' || ac.signal.aborted) return;
        setError(e.message);
        setStatus('error');
      });
  }, [campaignId]);

  useEffect(() => {
    run();
    return () => abort.current?.abort();
  }, [run]);

  return (
    <>
      <m.div initial="initial" animate="animate" variants={varFade({ distance: 24 }).inUp}>
        <Card
          sx={{
            p: { xs: 2.5, md: 3.5 },
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            '&:before': {
              content: '""',
              position: 'absolute',
              inset: '0 0 auto 0',
              height: 4,
              background: 'linear-gradient(90deg, #6B0F1E, #A6192E, #B5862F)',
            },
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <AiAvatar size={40} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                Votre lecture personnalisée
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Rédigée pour vous par votre coach IA
              </Typography>
            </Box>
            <Label color="secondary" variant="soft" startIcon={<Iconify icon="solar:magic-stick-3-bold" width={14} />}>
              IA
            </Label>
            {status === 'done' && <SpeakText id="ai-debrief" text={text} />}
          </Stack>

          {status === 'loading' && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3, color: 'text.secondary' }}>
              <TypingDots />
              <Typography variant="body2">Votre coach analyse votre profil…</Typography>
            </Stack>
          )}
          {text && (
            <Box sx={{ '& > :last-child': { mb: 0 } }}>
              <Markdown text={text} />
              {status === 'streaming' && (
                <Box component="span" sx={{ display: 'inline-block', width: 8, height: 16, ml: 0.5, bgcolor: 'primary.main', animation: 'tacBlink 1s steps(2) infinite', '@keyframes tacBlink': { '50%': { opacity: 0 } } }} />
              )}
            </Box>
          )}
          {status === 'error' && (
            <Alert
              severity="warning"
              className="no-print"
              action={
                <Button color="inherit" size="small" onClick={run}>
                  Réessayer
                </Button>
              }
            >
              {error}
            </Alert>
          )}
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
            Texte généré par une IA (Claude) à partir de vos seuls scores : aucune donnée nominative ne lui est transmise. C'est une piste de
            réflexion, pas une évaluation.
          </Typography>
        </Card>
      </m.div>

      {(status === 'done' || status === 'error') && (
        <m.div initial="initial" animate="animate" variants={varFade({ distance: 24 }).inUp}>
          <Card sx={{ p: { xs: 2.5, md: 3 } }} className="no-print">
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <Iconify icon="solar:chat-round-line-bold-duotone" width={28} sx={{ color: 'primary.main' }} />
              <Box>
                <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                  Parlez à votre coach
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Posez vos questions sur votre profil et sur les valeurs HCAP
                </Typography>
              </Box>
            </Stack>
            <AiChat
              endpoint="/ai/me/coach"
              extraBody={{ campaign_id: campaignId }}
              greeting="Bonjour ! Je connais vos résultats et je suis là pour vous aider à en tirer le meilleur. Par quoi voulez-vous commencer ?"
              placeholder="Votre question à votre coach…"
              suggestions={[
                `Comment progresser en ${DIMNAME[domBas]} ?`,
                `Comment tirer parti de mon goût pour ${DIMNAME[domHaut].toLowerCase()} ?`,
                'Lancez-moi un défi pour cette semaine 💪',
                'Comment en parler avec mon manager ?',
              ]}
            />
          </Card>
        </m.div>
      )}
    </>
  );
}
