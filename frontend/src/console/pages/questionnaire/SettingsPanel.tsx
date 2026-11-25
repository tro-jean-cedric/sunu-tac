/** Answer scale of the practice statements, scoring weights and validity thresholds. */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';

import { DEFAULT_RULES, type QuestionnaireContent, type Regles } from '../../../shared/referentiel';
import type { QValidation } from '../../../shared/types';
import { issuesIn } from './common';

export function SettingsPanel({
  content,
  editable,
  update,
  validation,
}: {
  content: QuestionnaireContent;
  editable: boolean;
  update: (fn: (c: QuestionnaireContent) => QuestionnaireContent) => void;
  validation?: QValidation;
}) {
  const r = content.regles;
  const setR = (p: Partial<Regles>) => update((c) => ({ ...c, regles: { ...c.regles, ...p } }));
  const setW = (k: keyof Regles['poids'], v: number) => setR({ poids: { ...r.poids, [k]: v } });
  const ech = content.echelle;
  const setEch = (e: QuestionnaireContent['echelle']) => update((c) => ({ ...c, echelle: e.map((x, i) => ({ ...x, value: i + 1 })) }));
  const issues = [...issuesIn(validation?.errors, 'echelle'), ...issuesIn(validation?.errors, 'regles')];
  const warns = issuesIn(validation?.warnings, 'regles');
  const hasExtras = content.extras.some((e) => e.scored);
  const total = r.poids.sjt + r.poids.lik + (hasExtras ? r.poids.extra : 0) || 1;
  const pct = (v: number) => `${Math.round((v / total) * 100)} %`;
  const nDs = content.validite.filter((v) => v.kind === 'ds').length;
  const nInc = content.validite.filter((v) => v.kind === 'inc').length;
  const top = ech.at(-1)?.label ?? 'max';

  const num = (label: string, value: number, onChange: (v: number) => void, help: string, props: { step?: number; min?: number; max?: number; unit?: string } = {}) => (
    <TextField
      type="number"
      label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      helperText={help}
      fullWidth
      inputProps={{ step: props.step ?? 1, min: props.min ?? 0, max: props.max }}
      InputProps={props.unit ? { endAdornment: <InputAdornment position="end">{props.unit}</InputAdornment> } : undefined}
    />
  );

  return (
    <Box component="fieldset" disabled={!editable} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Stack spacing={3}>
        {issues.map((i, k) => (
          <Alert key={k} severity="error" variant="outlined">
            {i.message}
          </Alert>
        ))}
        {warns.map((i, k) => (
          <Alert key={k} severity="warning" variant="outlined">
            {i.message}
          </Alert>
        ))}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ p: 2.5, height: 1 }}>
              <Typography variant="subtitle1">Échelle de réponse des pratiques</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Utilisée par les énoncés de pratique et les items de contrôle (2 à 9 niveaux, du moins au plus fréquent).
              </Typography>
              <Stack spacing={1.25}>
                {ech.map((e, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: 'background.neutral', display: 'grid', placeItems: 'center', typography: 'subtitle2', flexShrink: 0 }}>
                      {i + 1}
                    </Box>
                    <TextField size="small" fullWidth value={e.label} error={!e.label.trim()} onChange={(ev) => setEch(ech.map((x, k) => (k === i ? { ...x, label: ev.target.value } : x)))} />
                    {editable && <IconButton size="small" color="error" disabled={ech.length <= 2} onClick={() => setEch(ech.filter((_, k) => k !== i))} aria-label="Retirer ce niveau">
                      <Iconify icon="solar:trash-bin-minimalistic-linear" width={18} />
                    </IconButton>}
                  </Stack>
                ))}
                {editable && <Box>
                  <Button size="small" startIcon={<Iconify icon="mingcute:add-line" />} disabled={ech.length >= 9} onClick={() => setEch([...ech, { value: ech.length + 1, label: '' }])}>
                    Ajouter un niveau
                  </Button>
                </Box>}
              </Stack>
              <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                Le score de pratique est ramené sur 0–100 quelle que soit la longueur de l'échelle. La désirabilité sociale compte les
                réponses « {top} ».
              </Alert>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ p: 2.5, height: 1 }}>
              <Typography variant="subtitle1">Calcul du score d'une dimension</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Moyenne pondérée des composantes disponibles pour la dimension, sur 0–100. Le score global est la moyenne des quatre
                dimensions.
              </Typography>
              {(
                [
                  ['sjt', 'Mises en situation', true],
                  ['lik', 'Pratiques déclarées', true],
                  ['extra', 'Questions complémentaires notées', hasExtras],
                ] as const
              ).map(([k, label, on]) => (
                <Box key={k} sx={{ opacity: on ? 1 : 0.5 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">{label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {r.poids[k].toFixed(2)} {on && `· ${pct(r.poids[k])}`}
                    </Typography>
                  </Stack>
                  <Slider size="small" value={r.poids[k]} min={0} max={1} step={0.05} onChange={(_, v) => setW(k, v as number)} disabled={!editable} />
                </Box>
              ))}
              <Box sx={{ p: 1.5, mt: 1, borderRadius: 1, bgcolor: 'background.neutral', typography: 'body2', fontFamily: 'monospace' }}>
                score = {pct(r.poids.sjt)} × situations + {pct(r.poids.lik)} × pratiques
                {hasExtras && ` + ${pct(r.poids.extra)} × complémentaires`}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Si la désirabilité sociale est élevée, les pratiques sont ignorées. Valeurs d'origine : 0,6 / 0,4.
              </Typography>
            </Card>
          </Grid>
        </Grid>

        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="subtitle1">Contrôles de fiabilité</Typography>
              <Typography variant="body2" color="text.secondary">
                Un résultat « non exploitable » n'entre pas dans les statistiques collectives et peut être repassé par le collaborateur.
              </Typography>
            </Box>
            {editable && (
              <Button size="small" color="inherit" onClick={() => setR({ ...DEFAULT_RULES, poids: r.poids })} startIcon={<Iconify icon="solar:restart-linear" />}>
                Seuils d'origine
              </Button>
            )}
          </Stack>
          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={6} md={4}>
              {num('Désirabilité sociale élevée', r.dsSeuil, (v) => setR({ dsSeuil: Math.round(v) }), `à partir de N réponses « ${top} » sur ${nDs} item(s) DS → pratiques ignorées`)}
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              {num('Incohérence', r.incSeuil, (v) => setR({ incSeuil: Math.round(v) }), `écart cumulé des ${nInc} paires jumelles ≥ seuil → non exploitable`)}
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              {num('Normalisation de l’écart', r.incNorm, (v) => setR({ incNorm: Math.max(1, Math.round(v)) }), 'écart ramené à ce nombre de paires si certaines sont sans réponse', { min: 1 })}
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              {num('Réponses uniformes : part', Math.round(r.uniformeSeuil * 100), (v) => setR({ uniformeSeuil: Math.min(100, Math.max(1, v)) / 100 }), 'au-delà de cette part de réponses identiques → non exploitable', { unit: '%', max: 100 })}
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              {num('Réponses uniformes : minimum', r.uniformeMin, (v) => setR({ uniformeMin: Math.round(v) }), `contrôle appliqué à partir de N énoncés répondus (sur ${content.likert.length})`)}
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              {num('Passation rapide', Math.round(r.rapideS / 60), (v) => setR({ rapideS: Math.round(v * 60) }), 'en dessous de cette durée → signalée (information seulement)', { unit: 'min' })}
            </Grid>
          </Grid>
        </Card>

        <Card variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Présentation
          </Typography>
          <FormControlLabel
            control={<Switch checked={r.melangerOptions} onChange={(e) => setR({ melangerOptions: e.target.checked })} />}
            label={
              <Box>
                <Typography variant="body2">Mélanger l'ordre des réactions des mises en situation</Typography>
                <Typography variant="caption" color="text.secondary">
                  Ordre propre à chaque répondant, stable s'il reprend son test. Limite les effets de position.
                </Typography>
              </Box>
            }
          />
        </Card>
      </Stack>
    </Box>
  );
}
