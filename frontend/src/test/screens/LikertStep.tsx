import { useMemo, type Dispatch } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';

import { LIKERT_PAGE_SIZE, likertOrder } from '../../shared/referentiel';
import { SpokenText, useSpeech } from '../../shared/speech';
import { StepShell } from '../components/StepShell';
import { SpeakIcon } from '../components/ReadAloud';
import { hasExtras, likPages, type Action, type FlowState, type Vue } from '../state';
import { useQ } from '../questionnaire';

interface Props {
  state: FlowState;
  dispatch: Dispatch<Action>;
  go: (vue: Vue, idx?: number) => void;
  onFinish: () => void;
  submitting: boolean;
}

export function LikertStep({ state, dispatch, go, onFinish, submitting }: Props) {
  const ref = useQ();
  const ECHELLE = ref.echelle;
  const LIK_PAGES = likPages(ref);
  const toExtras = hasExtras(ref);
  const ord = useMemo(() => likertOrder(ref), [ref]);
  const page = ord.slice(state.idx * LIKERT_PAGE_SIZE, (state.idx + 1) * LIKERT_PAGE_SIZE);
  const reste = page.filter((it) => state.answers.lik[it.id] == null).length;
  const last = state.idx === LIK_PAGES - 1;
  const sp = useSpeech();
  const speechId = `lik-${state.idx}`;
  const segments = useMemo(
    () => ['À quelle fréquence ? Pensez à vos six derniers mois de travail.', ...page.map((it) => it.txt)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.idx],
  );

  return (
    <StepShell
      stepKey={`lik-${state.idx}`}
      speech={{ id: speechId, segments }}
      eyebrow={`Page ${state.idx + 1} sur ${LIK_PAGES}`}
      title="À quelle fréquence ?"
      hint="Pensez à vos six derniers mois de travail."
      onPrev={() => (state.idx ? go('lik', state.idx - 1) : go('bloc', ref.blocs.length - 1))}
      onNext={() => (last ? (toExtras ? go('extra', 0) : onFinish()) : go('lik', state.idx + 1))}
      nextLabel={last ? (toExtras ? 'Dernière partie' : 'Voir mes résultats') : 'Suivant'}
      nextDisabled={reste > 0}
      nextLoading={submitting && !toExtras}
      footer={
        reste > 0 ? (
          <Typography variant="body2" color="text.secondary">
            {reste} énoncé{reste > 1 ? 's' : ''} à compléter sur cette page.
          </Typography>
        ) : null
      }
    >
      <Card sx={{ px: { xs: 2, md: 3 }, py: 1 }}>
        {page.map((it, i) => {
          const v = state.answers.lik[it.id];
          return (
            <Box key={it.id} sx={{ py: 2.25, borderTop: i ? '1px dashed' : 0, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 1.5 }}>
                <Typography sx={{ flex: 1, lineHeight: 1.5, fontWeight: 500, pt: 0.5 }}>
                  {sp.speakingId === `lik-item-${it.id}` ? (
                    <SpokenText id={`lik-item-${it.id}`} seg={0} text={it.txt} />
                  ) : (
                    <SpokenText id={speechId} seg={1 + i} text={it.txt} />
                  )}
                </Typography>
                <SpeakIcon id={`lik-item-${it.id}`} segments={[it.txt]} label={it.txt} />
              </Box>
              <Box role="radiogroup" aria-label={it.txt} sx={{ display: 'grid', gridTemplateColumns: `repeat(${ECHELLE.length}, 1fr)`, gap: { xs: 0.5, sm: 1 } }}>
                {ECHELLE.map((e) => {
                  const on = v === e.value;
                  return (
                    <ButtonBase
                      key={e.value}
                      role="radio"
                      aria-checked={on}
                      onClick={() => dispatch({ type: 'lik', id: it.id, value: e.value })}
                      sx={{
                        flexDirection: 'column',
                        py: 1,
                        px: 0.5,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: on ? 'primary.main' : 'divider',
                        bgcolor: on ? 'primary.main' : 'background.paper',
                        color: on ? 'primary.contrastText' : 'text.secondary',
                        transition: 'all .12s ease',
                        '&:hover': { borderColor: 'primary.light' },
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ lineHeight: 1.1, color: on ? 'inherit' : 'text.primary' }}>
                        {e.value}
                      </Typography>
                      <Typography sx={{ fontSize: { xs: 10, sm: 11.5 }, lineHeight: 1.2, mt: 0.25, textAlign: 'center' }}>
                        {e.label}
                      </Typography>
                    </ButtonBase>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Card>
    </StepShell>
  );
}
