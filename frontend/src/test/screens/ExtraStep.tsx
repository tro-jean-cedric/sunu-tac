/** Part 4 (only when the questionnaire has some): complementary questions of free types, with display conditions. */
import { useEffect, useMemo, type Dispatch } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EXTRA_PAGE_SIZE, extraAnswered, visibleExtras, type ExtraValue } from '../../shared/referentiel';
import { ExtraInput } from '../../shared/ExtraInput';
import { StepShell } from '../components/StepShell';
import { extraOrder, likPages, type Action, type FlowState, type Vue } from '../state';
import { useQ } from '../questionnaire';

interface Props {
  state: FlowState;
  dispatch: Dispatch<Action>;
  go: (vue: Vue, idx?: number) => void;
  onFinish: () => void;
  submitting: boolean;
}

export function ExtraStep({ state, dispatch, go, onFinish, submitting }: Props) {
  const ref = useQ();
  const answers = useMemo(() => state.answers.extra ?? {}, [state.answers.extra]);
  const visible = useMemo(() => visibleExtras(ref, answers), [ref, answers]);
  const pages = Math.max(1, Math.ceil(visible.length / EXTRA_PAGE_SIZE));
  const idx = Math.min(state.idx, pages - 1);
  const page = visible.slice(idx * EXTRA_PAGE_SIZE, (idx + 1) * EXTRA_PAGE_SIZE);
  const last = idx === pages - 1;
  const missing = page.filter((e) => e.required && !extraAnswered(e, answers[e.id]));

  // a condition may hide questions and shorten the part: keep the page index in range
  useEffect(() => {
    if (state.idx !== idx) go('extra', idx);
  }, [state.idx, idx, go]);

  const set = (id: string, value: ExtraValue | null) => dispatch({ type: 'extra', id, value });

  return (
    <StepShell
      stepKey={`extra-${idx}`}
      speech={{ id: `extra-${idx}`, segments: page.map((e) => e.txt) }}
      eyebrow={pages > 1 ? `Page ${idx + 1} sur ${pages}` : 'Dernière partie'}
      title={ref.extrasTitre || 'Questions complémentaires'}
      hint={ref.extrasIntro || undefined}
      onPrev={() => (idx ? go('extra', idx - 1) : go('lik', likPages(ref) - 1))}
      onNext={() => (last ? onFinish() : go('extra', idx + 1))}
      nextLabel={last ? 'Voir mes résultats' : 'Suivant'}
      nextDisabled={missing.length > 0}
      nextLoading={submitting}
      footer={
        missing.length > 0 ? (
          <Typography variant="body2" color="text.secondary">
            {missing.length} question{missing.length > 1 ? 's' : ''} obligatoire{missing.length > 1 ? 's' : ''} à compléter sur cette page.
          </Typography>
        ) : null
      }
    >
      <Stack spacing={2}>
        {page.map((e) => (
          <Card key={e.id} sx={{ p: { xs: 2.25, md: 3 } }}>
            <Typography sx={{ fontWeight: 600, lineHeight: 1.5 }}>
              {e.txt}
              {!e.required && (
                <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                  (facultatif)
                </Typography>
              )}
            </Typography>
            {e.aide && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {e.aide}
              </Typography>
            )}
            <Box sx={{ mt: 2 }}>
              <ExtraInput
                e={e}
                value={answers[e.id]}
                order={e.shuffle ? extraOrder(state.seed, e.id, e.options?.length ?? 0) : undefined}
                onChange={(v) => set(e.id, v)}
              />
            </Box>
          </Card>
        ))}
      </Stack>
    </StepShell>
  );
}
