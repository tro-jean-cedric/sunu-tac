import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Iconify, Label } from '@vionhub/design-system/components';
import { m, varFade } from '@vionhub/design-system/motion';

import { likall } from '../../shared/referentiel';
import { useQ } from '../questionnaire';
import type { Campaign, Me } from '../../shared/types';

interface Props {
  me: Me;
  campaign: Campaign;
  resumable: boolean;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
}

function useParts() {
  const ref = useQ();
  const parts = [
    { icon: 'solar:case-round-bold-duotone', n: ref.situations.length, label: 'situations', text: 'Des cas de travail concrets, communs à tous les métiers. Les réactions proposées sont toutes défendables.' },
    { icon: 'solar:scale-bold-duotone', n: ref.blocs.length, label: 'blocs', text: 'Des affirmations positives : celle qui vous ressemble le plus, celle qui vous ressemble le moins.' },
    { icon: 'solar:chart-square-bold-duotone', n: likall(ref).length, label: 'énoncés', text: 'À quelle fréquence chacun correspond à votre façon de travailler.' },
  ];
  if (ref.extras?.length)
    parts.push({ icon: 'solar:checklist-minimalistic-bold-duotone', n: ref.extras.length, label: 'questions', text: ref.extrasIntro || ref.extrasTitre });
  // same weights as the console estimate (backend EST_SECONDS): the original bank gives 30 à 35 minutes
  const sec = ref.situations.length * 75 + ref.blocs.length * 45 + likall(ref).length * 15 + (ref.extras?.length ?? 0) * 25;
  const mins = Math.max(5, Math.floor(sec / 60 / 5) * 5);
  return { parts, duration: `${mins} à ${mins + 5}` };
}

const ENGAGEMENTS = [
  'Vous recevez votre résultat en premier, avant tout autre destinataire.',
  "Il n'entre dans aucune décision de carrière, de rémunération ou de sanction.",
  "L'accès nominatif est limité à la DRH Groupe et à votre manager direct.",
  'Toute restitution collective porte sur cinq personnes au minimum.',
];

const PRINCIPES = [
  { k: 'H', t: 'Héritage', c: '#A6192E' },
  { k: 'C', t: 'Collaboration', c: '#B5862F' },
  { k: 'A', t: 'Autonomie', c: '#2E6E5E' },
  { k: 'P', t: 'Performance', c: '#3D5A80' },
];

export function Welcome({ me, campaign, resumable, onStart, onResume, onRestart }: Props) {
  const firstName = me.name.split(' ')[0];
  const { parts: PARTS, duration } = useParts();
  return (
    <Stack spacing={3}>
      {/* hero */}
      <m.div initial="initial" animate="animate" variants={varFade({ distance: 30 }).inUp}>
        <Card
          sx={{
            p: { xs: 3, md: 5 },
            color: 'common.white',
            background: 'linear-gradient(135deg, #6B0F1E 0%, #A6192E 60%, #B5862F 140%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={7}>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Label variant="filled" color="secondary">SUNU Attitude+ · CAP</Label>
                <Label variant="soft" sx={{ bgcolor: 'rgba(255,255,255,.16)', color: 'common.white' }}>
                  {campaign.label}
                </Label>
              </Stack>
              <Typography variant="h3" component="h1" sx={{ fontWeight: 800, lineHeight: 1.15, textWrap: 'balance' }}>
                Où en êtes-vous de notre culture&nbsp;?
              </Typography>
              <Typography sx={{ mt: 2, opacity: 0.9, fontSize: '1.05rem' }}>
                Bonjour {firstName}. Ce test situe vos pratiques sur les quatre principes de la Maison SUNU. Il vous donne une
                note sur chacun et une note globale d'alignement.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2.5 }}>
                {PRINCIPES.map((p) => (
                  <Box key={p.k} sx={{ px: 1.5, py: 0.5, borderRadius: 5, bgcolor: 'rgba(255,255,255,.14)', typography: 'caption', fontWeight: 600 }}>
                    <Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: p.c, mr: 0.75, border: '1px solid #fff' }} />
                    {p.t}
                  </Box>
                ))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                {resumable ? (
                  <>
                    <Button size="large" variant="contained" color="secondary" onClick={onResume} startIcon={<Iconify icon="solar:play-bold" />}>
                      Reprendre ma passation
                    </Button>
                    <Button size="large" variant="outlined" sx={{ color: 'common.white', borderColor: 'rgba(255,255,255,.5)' }} onClick={onRestart}>
                      Recommencer
                    </Button>
                  </>
                ) : (
                  <Button size="large" variant="contained" color="secondary" onClick={onStart} startIcon={<Iconify icon="solar:play-bold" />}>
                    Commencer le test
                  </Button>
                )}
              </Stack>
            </Grid>
            <Grid item xs={12} md={5} sx={{ display: { xs: 'none', md: 'block' } }}>
              <Box
                component="img"
                src="/maison-sunu.png"
                alt="La Maison SUNU : l'Héritage en fondation, les principes CAP en piliers"
                sx={{ width: '100%', borderRadius: 2, bgcolor: 'common.white', p: 1.5, boxShadow: '0 20px 40px -20px rgba(0,0,0,.5)' }}
              />
            </Grid>
          </Grid>
        </Card>
      </m.div>

      {resumable && (
        <Alert severity="info" icon={<Iconify icon="solar:history-bold-duotone" />}>
          Vous avez une passation en cours. Vos réponses ont été conservées : reprenez là où vous vous étiez arrêté.
        </Alert>
      )}

      {/* how it works */}
      <Card sx={{ p: { xs: 2.5, md: 3.5 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Comment cela se passe
        </Typography>
        <Grid container spacing={2}>
          {PARTS.map((p, i) => (
            <Grid item xs={12} sm={12 / PARTS.length} key={p.label}>
              <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}>
                <Box sx={{ p: 2, height: '100%', borderRadius: 1.5, bgcolor: 'background.neutral' }}>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                    <Iconify icon={p.icon} width={28} sx={{ color: 'primary.main' }} />
                    <Typography variant="subtitle1">
                      <Box component="span" sx={{ typography: 'h5', mr: 0.5 }}>{p.n}</Box>
                      {p.label}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Partie {i + 1}. {p.text}
                  </Typography>
                </Box>
              </m.div>
            </Grid>
          ))}
        </Grid>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2.5, color: 'text.secondary' }}>
          <Iconify icon="solar:clock-circle-bold-duotone" width={20} />
          <Typography variant="body2">
            Comptez {duration} minutes. Vos réponses sont enregistrées au fil de l'eau : vous pouvez vous interrompre et reprendre plus tard.
          </Typography>
        </Stack>
      </Card>

      {/* engagements */}
      <Card sx={{ p: { xs: 2.5, md: 3.5 } }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Nos engagements
        </Typography>
        <Alert severity="warning" variant="outlined" icon={<Iconify icon="solar:lightbulb-bolt-bold-duotone" />} sx={{ mb: 2 }}>
          Il n'y a pas de bonne réponse évidente. Le test mesure des comportements, pas votre performance.
        </Alert>
        <Stack spacing={1.25}>
          {ENGAGEMENTS.map((e) => (
            <Stack key={e} direction="row" spacing={1.25} alignItems="flex-start">
              <Iconify icon="solar:shield-check-bold-duotone" width={22} sx={{ color: 'success.main', flexShrink: 0, mt: '1px' }} />
              <Typography variant="body2">{e}</Typography>
            </Stack>
          ))}
        </Stack>
      </Card>

      <Alert severity="error" variant="outlined" icon={<Iconify icon="solar:test-tube-bold-duotone" />}>
        <strong>Version 1.0, en phase de validation.</strong> Les seuils d'interprétation sont provisoires : ils seront établis sur
        la population réelle à l'issue du pilote. Les résultats individuels ne fondent aucune décision à ce stade.
      </Alert>
    </Stack>
  );
}
