/** Shared pieces of the questionnaire builder. */
import { useCallback, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { LabelColor } from '@vionhub/design-system/components';
import { Label } from '@vionhub/design-system/components';

import { DIMNAME, DIMS, DIM_COLORS, type DimKey, type ExtraType, type QuestionnaireContent } from '../../../shared/referentiel';
import type { QIssue, QStatus } from '../../../shared/types';

export const STATUS: Record<QStatus, { label: string; color: LabelColor; icon: string }> = {
  draft: { label: 'Brouillon', color: 'warning', icon: 'solar:pen-new-square-linear' },
  published: { label: 'Publié', color: 'success', icon: 'solar:verified-check-linear' },
  archived: { label: 'Archivé', color: 'default', icon: 'solar:archive-linear' },
};

export const EXTRA_TYPES: Record<ExtraType, { label: string; icon: string; help: string }> = {
  single: { label: 'Choix unique', icon: 'solar:list-check-bold-duotone', help: 'Une seule réponse parmi plusieurs.' },
  multiple: { label: 'Choix multiples', icon: 'solar:checklist-bold-duotone', help: 'Plusieurs réponses possibles, avec un minimum et un maximum.' },
  yesno: { label: 'Oui / Non', icon: 'solar:check-circle-bold-duotone', help: 'Deux réponses, libellés personnalisables.' },
  scale: { label: 'Échelle numérique', icon: 'solar:ruler-bold-duotone', help: 'Une note entre deux bornes (ex. 0 à 10).' },
  ranking: { label: 'Classement', icon: 'solar:sort-vertical-bold-duotone', help: 'Ordonner des propositions par importance.' },
  text: { label: 'Réponse libre', icon: 'solar:text-field-bold-duotone', help: 'Texte saisi par le répondant (jamais noté).' },
};

export type Section = 'situations' | 'blocs' | 'likert' | 'validite' | 'extras';

export const SECTION_PREFIX: Record<Section, string> = { situations: 'A', blocs: 'B', likert: 'C', validite: 'D', extras: 'X' };

/** All ids used anywhere in the questionnaire (they share one namespace in answers and codes). */
export function allIds(c: QuestionnaireContent): Set<string> {
  return new Set(
    [...c.situations, ...c.blocs, ...c.likert, ...c.validite, ...c.extras].map((x) => x.id.toLowerCase()),
  );
}

export function nextId(c: QuestionnaireContent, prefix: string): string {
  const used = allIds(c);
  for (let i = 1; ; i++) {
    const id = `${prefix}${i}`;
    if (!used.has(id.toLowerCase())) return id;
  }
}

export function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const nx = list.slice();
  [nx[i], nx[j]] = [nx[j], nx[i]];
  return nx;
}

export function DimLabel({ dim, short }: { dim: DimKey | null | undefined; short?: boolean }) {
  if (!dim) return null;
  return (
    <Label variant="soft" sx={{ color: DIM_COLORS[dim], bgcolor: `${DIM_COLORS[dim]}1F`, flexShrink: 0 }}>
      {short ? dim : DIMNAME[dim]}
    </Label>
  );
}

export function DimSelect({ value, onChange, allowNone, ...rest }: { value: DimKey | '' | null; onChange: (d: DimKey | null) => void; allowNone?: boolean } & Omit<TextFieldProps, 'onChange' | 'value'>) {
  return (
    <TextField select label="Dimension" value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as DimKey | null)} {...rest}>
      {allowNone && <MenuItem value="">Aucune</MenuItem>}
      {DIMS.map((d) => (
        <MenuItem key={d.id} value={d.id}>
          <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: DIM_COLORS[d.id], mr: 1.25, display: 'inline-block' }} />
          {d.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Issues reported for one item (path "section.index") or a whole section. */
export const issuesAt = (issues: QIssue[] | undefined, path: string) => (issues ?? []).filter((i) => i.path === path);
export const issuesIn = (issues: QIssue[] | undefined, section: string) =>
  (issues ?? []).filter((i) => i.path === section || i.path.startsWith(`${section}.`));

// ---------------------------------------------------------------- confirm dialog

interface ConfirmOpts { title: string; body?: ReactNode; ok?: string; danger?: boolean }

export function useConfirm(): [(o: ConfirmOpts) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const ui = state ? (
    <Dialog open onClose={() => done(false)} maxWidth="xs" fullWidth>
      <DialogTitle>{state.title}</DialogTitle>
      {state.body && (
        <DialogContent>
          <Typography color="text.secondary">{state.body}</Typography>
        </DialogContent>
      )}
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={() => done(false)}>
          Annuler
        </Button>
        <Button variant="contained" color={state.danger ? 'error' : 'primary'} onClick={() => done(true)} autoFocus>
          {state.ok ?? 'Confirmer'}
        </Button>
      </DialogActions>
    </Dialog>
  ) : null;
  return [ask, ui];
}
