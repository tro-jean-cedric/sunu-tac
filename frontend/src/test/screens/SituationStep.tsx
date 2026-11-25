import { useEffect, useMemo, useRef, type Dispatch } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';

import { SpokenText } from '../../shared/speech';
import { StepShell } from '../components/StepShell';
import { optionOrders, type Action, type FlowState, type Vue } from '../state';
import { useQ } from '../questionnaire';

interface Props {
  state: FlowState;
  dispatch: Dispatch<Action>;
  go: (vue: Vue, idx?: number) => void;
}

const LETTERS = 'ABCDEFGHI';

export function SituationStep({ state, dispatch, go }: Props) {
  const ref = useQ();
  const SITUATIONS = ref.situations;
  const q = SITUATIONS[state.idx];
  const order = useMemo(() => optionOrders(state.seed, ref)[q.id], [state.seed, q.id, ref]);
  const sel = state.answers.sit[q.id];
  const last = state.idx === SITUATIONS.length - 1;
  const next = () => (last ? go('bloc', 0) : go('sit', state.idx + 1));
  const prev = () => (state.idx ? go('sit', state.idx - 1) : go('ident'));

  // auto-advance (as in the legacy test); cancelled if the step changes first (e.g. "Suivant" clicked)
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), [q.id]);
  const choose = (k: number) => {
    dispatch({ type: 'sit', id: q.id, value: k });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(next, 280);
  };

  // keyboard: A–D or 1–4 (up to I / 9)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const i = k.length !== 1 ? -1 : 'abcdefghi'.includes(k) ? 'abcdefghi'.indexOf(k) : '123456789'.indexOf(k);
      if (i >= 0 && order[i] != null) choose(order[i]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, order]);

  const speechId = `sit-${q.id}`;
  const segments = useMemo(
    () => [q.txt, 'Que feriez-vous réellement ?', ...order.map((k, n) => `Réponse ${LETTERS[n]}. ${q.options[k].txt}`)],
    [q, order],
  );

  return (
    <StepShell
      stepKey={`sit-${q.id}`}
      speech={{ id: speechId, segments }}
      eyebrow={`Situation ${state.idx + 1} sur ${SITUATIONS.length}`}
      onPrev={prev}
      onNext={next}
      nextLabel={last ? 'Partie 2' : 'Suivant'}
      nextDisabled={sel == null}
      footer={
        <Typography variant="caption" color="text.disabled" sx={{ display: { xs: 'none', md: 'block' } }}>
          Astuce : répondez au clavier avec les touches {LETTERS.slice(0, order.length).split('').join(', ')}.{' '}
          {ref.blocs.length} blocs vous attendent ensuite.
        </Typography>
      }
    >
      <Card sx={{ p: { xs: 2.5, md: 3.5 }, borderLeft: '4px solid', borderColor: 'primary.main' }}>
        <Typography sx={{ fontSize: { xs: '1.05rem', md: '1.15rem' }, lineHeight: 1.6, fontWeight: 500 }}>
          <SpokenText id={speechId} seg={0} text={q.txt} />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, fontStyle: 'italic' }}>
          Que feriez-vous réellement&nbsp;?
        </Typography>
        {q.aide && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {q.aide}
          </Typography>
        )}
      </Card>
      <Stack spacing={1.25} role="radiogroup" aria-label="Réactions possibles">
        {order.map((k, n) => {
          const on = sel === k;
          return (
            <ButtonBase
              key={k}
              role="radio"
              aria-checked={on}
              onClick={() => choose(k)}
              sx={{
                p: { xs: 1.75, md: 2 },
                gap: 1.75,
                width: '100%',
                textAlign: 'left',
                justifyContent: 'flex-start',
                alignItems: 'flex-start',
                borderRadius: 1.5,
                bgcolor: on ? 'primary.lighter' : 'background.paper',
                border: '1.5px solid',
                borderColor: on ? 'primary.main' : 'divider',
                boxShadow: on ? 'inset 4px 0 0 var(--palette-primary-main)' : 'none',
                transition: 'all .15s ease',
                '&:hover': { borderColor: 'primary.light', transform: 'translateX(2px)' },
                '[data-mui-color-scheme="dark"] &': on ? { bgcolor: 'rgba(224,108,127,.12)' } : {},
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  typography: 'subtitle2',
                  border: '1.5px solid',
                  borderColor: on ? 'primary.main' : 'divider',
                  bgcolor: on ? 'primary.main' : 'transparent',
                  color: on ? 'primary.contrastText' : 'text.secondary',
                }}
              >
                {LETTERS[n]}
              </Box>
              <Typography sx={{ lineHeight: 1.55, pt: '3px' }}>
                <SpokenText id={speechId} seg={2 + n} text={q.options[k].txt} />
              </Typography>
            </ButtonBase>
          );
        })}
      </Stack>
    </StepShell>
  );
}
