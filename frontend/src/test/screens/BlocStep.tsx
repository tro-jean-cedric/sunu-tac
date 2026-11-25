import { useEffect, useMemo, useRef, type Dispatch } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';

import { SpokenText } from '../../shared/speech';
import { StepShell } from '../components/StepShell';
import type { Action, FlowState, Vue } from '../state';
import { useQ } from '../questionnaire';

const COUNT = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six'];

interface Props {
  state: FlowState;
  dispatch: Dispatch<Action>;
  go: (vue: Vue, idx?: number) => void;
}

export function BlocStep({ state, dispatch, go }: Props) {
  const ref = useQ();
  const BLOCS = ref.blocs;
  const b = BLOCS[state.idx];
  const cur = state.answers.bloc[b.id] ?? { most: null, least: null };
  const last = state.idx === BLOCS.length - 1;
  const complete = cur.most != null && cur.least != null;
  const next = () => (last ? go('lik', 0) : go('bloc', state.idx + 1));
  const prev = () => (state.idx ? go('bloc', state.idx - 1) : go('sit', ref.situations.length - 1));

  // auto-advance once both picks are made by the user on this bloc; cancelled if the step changes first
  const touched = useRef(false);
  const timer = useRef<number>();
  useEffect(() => {
    touched.current = false;
    return () => window.clearTimeout(timer.current);
  }, [b.id]);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (touched.current && complete) timer.current = window.setTimeout(next, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.most, cur.least]);

  const pick = (t: 'most' | 'least', k: number) => {
    touched.current = true;
    dispatch({ type: 'blocPick', id: b.id, t, k });
  };

  const Pick = ({ t, k, txt }: { t: 'most' | 'least'; k: number; txt: string }) => {
    const on = cur[t] === k;
    const most = t === 'most';
    return (
      <Tooltip title={most ? 'Me ressemble le plus' : 'Me ressemble le moins'}>
        <IconButton
          aria-pressed={on}
          aria-label={`${most ? 'Le plus' : 'Le moins'} : ${txt}`}
          onClick={() => pick(t, k)}
          sx={{
            width: 40,
            height: 40,
            border: '1.5px solid',
            borderColor: on ? (most ? 'primary.main' : 'grey.600') : 'divider',
            bgcolor: on ? (most ? 'primary.main' : 'grey.600') : 'transparent',
            color: on ? 'common.white' : 'text.secondary',
            '&:hover': { bgcolor: on ? (most ? 'primary.dark' : 'grey.700') : 'action.hover' },
          }}
        >
          <Iconify icon={most ? 'mingcute:add-line' : 'mingcute:minimize-line'} width={18} />
        </IconButton>
      </Tooltip>
    );
  };

  const speechId = `bloc-${b.id}`;
  const segments = useMemo(
    () => ['Lequel vous ressemble le plus, et lequel le moins ?', ...b.items.map((it, k) => `Affirmation ${k + 1}. ${it.txt}`)],
    [b],
  );

  return (
    <StepShell
      stepKey={`bloc-${b.id}`}
      speech={{ id: speechId, segments }}
      eyebrow={`Bloc ${state.idx + 1} sur ${BLOCS.length}`}
      title="Lequel vous ressemble le plus ?"
      hint={`Les ${COUNT[b.items.length] ?? b.items.length} affirmations sont positives. Désignez celle qui vous ressemble le plus (+) et celle qui vous ressemble le moins (−).`}
      onPrev={prev}
      onNext={next}
      nextLabel={last ? 'Partie 3' : 'Suivant'}
      nextDisabled={!complete}
    >
      <Card>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 64px 64px',
            alignItems: 'center',
            px: 2,
            py: 1.25,
            bgcolor: 'background.neutral',
            typography: 'overline',
            color: 'text.secondary',
          }}
        >
          <span>Affirmation</span>
          <Box sx={{ textAlign: 'center' }}>Le plus</Box>
          <Box sx={{ textAlign: 'center' }}>Le moins</Box>
        </Box>
        {b.items.map((it, k) => {
          const tone = cur.most === k ? 'primary.lighter' : cur.least === k ? 'action.hover' : 'transparent';
          return (
            <Box
              key={k}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr 64px 64px',
                alignItems: 'center',
                px: 2,
                py: 1.75,
                borderTop: '1px solid',
                borderColor: 'divider',
                bgcolor: tone,
                transition: 'background-color .15s',
                '[data-mui-color-scheme="dark"] &': cur.most === k ? { bgcolor: 'rgba(224,108,127,.12)' } : {},
              }}
            >
              <Typography sx={{ lineHeight: 1.5, pr: 1 }}>
                <SpokenText id={speechId} seg={1 + k} text={it.txt} />
              </Typography>
              <Stack alignItems="center">
                <Pick t="most" k={k} txt={it.txt} />
              </Stack>
              <Stack alignItems="center">
                <Pick t="least" k={k} txt={it.txt} />
              </Stack>
            </Box>
          );
        })}
      </Card>
    </StepShell>
  );
}
