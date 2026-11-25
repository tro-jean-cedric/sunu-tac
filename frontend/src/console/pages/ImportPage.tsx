import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Iconify, Label, UploadBox, toast } from '@vionhub/design-system/components';
import { SunuBreadcrumbs } from '../brand';

import { api } from '../../shared/api';
import { decode } from '../../shared/codec';
import type { ImportReport } from '../../shared/types';
import { InternalUse, SectionCard } from '../components';
import { errMsg } from '../lib';

type Outcome = { origin: string; report: ImportReport };

const readText = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(f, 'utf-8');
  });

export function ImportPage() {
  const [codes, setCodes] = useState('');
  const [busy, setBusy] = useState<'files' | 'codes' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const preview = useMemo(() => {
    const lines = codes
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const decoded = lines.map((l) => decode(l));
    const ok = decoded.filter((d): d is NonNullable<typeof d> => d != null);
    return { lines, ok, bad: lines.length - ok.length };
  }, [codes]);

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy('files');
    setOutcome(null);
    try {
      const items: unknown[] = [];
      const local: string[] = [];
      for (const f of files) {
        try {
          const parsed: unknown = JSON.parse(await readText(f));
          // a file may hold one answer object or an array of them
          if (Array.isArray(parsed)) items.push(...parsed);
          else items.push(parsed);
        } catch {
          local.push(`${f.name} : fichier illisible (JSON invalide).`);
        }
      }
      const report: ImportReport = items.length
        ? await api.importFiles(items)
        : { imported: 0, replaced: 0, invalid_tests: 0, unreadable: 0, errors: [] };
      report.unreadable += local.length;
      report.errors = [...local, ...report.errors];
      setOutcome({ origin: `${files.length} fichier${files.length > 1 ? 's' : ''}`, report });
      if (report.imported) toast.success(`${report.imported} réponse${report.imported > 1 ? 's' : ''} importée${report.imported > 1 ? 's' : ''}.`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const onCodes = async () => {
    setBusy('codes');
    setOutcome(null);
    try {
      const report = await api.importCodes(preview.lines);
      setOutcome({ origin: `${preview.lines.length} code${preview.lines.length > 1 ? 's' : ''}`, report });
      if (report.imported) {
        toast.success(`${report.imported} réponse${report.imported > 1 ? 's' : ''} importée${report.imported > 1 ? 's' : ''}.`);
        if (!report.errors.length) setCodes('');
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <InternalUse />
        <SunuBreadcrumbs heading="Import" links={[{ name: 'Console DRH', href: '/' }, { name: 'Import' }]} sx={{ mt: 1.5 }} />
        <Typography sx={{ color: 'text.secondary', maxWidth: 760 }}>
          Déposez les fichiers <code>.json</code> reçus des répondants, ou collez leurs codes de restitution, un par
          ligne. Une passation déjà présente pour le même matricule et la même campagne est remplacée.
        </Typography>
      </Box>

      {outcome && <ReportAlert outcome={outcome} onClose={() => setOutcome(null)} />}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <SectionCard title="Fichiers .json" subheader="Sauvegardes téléchargées par les répondants depuis le test">
            <UploadBox
              multiple
              accept={{ 'application/json': ['.json'] }}
              disabled={busy != null}
              onDrop={(accepted) => onFiles(accepted)}
              placeholder={
                <Stack spacing={1} alignItems="center" sx={{ px: 2, textAlign: 'center' }}>
                  <Iconify icon="solar:cloud-upload-bold-duotone" width={48} sx={{ color: 'primary.main' }} />
                  <Typography variant="subtitle1" sx={{ color: 'text.primary' }}>
                    Glissez ici les fichiers .json
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    ou cliquez pour les choisir — plusieurs fichiers à la fois
                  </Typography>
                </Stack>
              }
              sx={{ width: 1, height: 220, borderRadius: 2 }}
            />
            {busy === 'files' && <LinearProgress sx={{ mt: 2 }} />}
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard title="Codes de restitution" subheader="Codes TAC1.… affichés en fin de test, un par ligne">
            <TextField
              multiline
              fullWidth
              minRows={7}
              maxRows={14}
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
              placeholder={'TAC1.xxxxx\nTAC1.yyyyy'}
              InputProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 } }}
            />
            <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} sx={{ mt: 1.5 }}>
              {preview.lines.length > 0 ? (
                <>
                  <Label color="success" variant="soft">
                    {preview.ok.length} code{preview.ok.length > 1 ? 's' : ''} lisible{preview.ok.length > 1 ? 's' : ''}
                  </Label>
                  {preview.bad > 0 && (
                    <Label color="error" variant="soft">
                      {preview.bad} illisible{preview.bad > 1 ? 's' : ''}
                    </Label>
                  )}
                </>
              ) : (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Les codes sont vérifiés ici avant l'envoi.
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              <Button
                variant="contained"
                onClick={onCodes}
                disabled={!preview.lines.length || busy != null}
                startIcon={<Iconify icon="solar:import-bold" />}
              >
                Importer les codes
              </Button>
            </Stack>
            {preview.ok.length > 0 && (
              <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 2 }}>
                {preview.ok.slice(0, 12).map((d, i) => (
                  <Label key={i} variant="outlined">
                    {d.ident.matricule || '?'} · {d.ident.campagne || 'T0'}
                  </Label>
                ))}
                {preview.ok.length > 12 && <Label variant="outlined">+ {preview.ok.length - 12}</Label>}
              </Stack>
            )}
            {busy === 'codes' && <LinearProgress sx={{ mt: 2 }} />}
          </SectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}

function ReportAlert({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  const { report: r, origin } = outcome;
  const severity = r.imported === 0 ? 'error' : r.errors.length || r.unreadable ? 'warning' : 'success';
  const s = (n: number) => (n > 1 ? 's' : '');
  return (
    <Alert
      severity={severity}
      onClose={onClose}
      action={
        r.imported > 0 ? (
          <Button color="inherit" size="small" component={RouterLink} to="/">
            Voir le tableau de bord
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>Rapport d'import — {origin}</AlertTitle>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        <li>
          <strong>{r.imported}</strong> réponse{s(r.imported)} importée{s(r.imported)}
          {r.replaced > 0 && (
            <>
              {' '}
              (dont <strong>{r.replaced}</strong> remplacée{s(r.replaced)})
            </>
          )}
          .
        </li>
        {r.invalid_tests > 0 && (
          <li>
            <strong>{r.invalid_tests}</strong> passation{s(r.invalid_tests)} non exploitable{s(r.invalid_tests)} (à
            refaire).
          </li>
        )}
        {r.unreadable > 0 && (
          <li>
            <strong>{r.unreadable}</strong> entrée{s(r.unreadable)} illisible{s(r.unreadable)} ou refusée{s(r.unreadable)}.
          </li>
        )}
      </Box>
      {r.errors.length > 0 && (
        <Box
          component="ul"
          sx={{ mt: 1, mb: 0, pl: 2.5, maxHeight: 180, overflow: 'auto', typography: 'caption', opacity: 0.9 }}
        >
          {r.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </Box>
      )}
    </Alert>
  );
}
