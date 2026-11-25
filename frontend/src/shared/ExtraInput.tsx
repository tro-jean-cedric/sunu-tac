/** Answer input of a complementary question (employee test + live preview in the console editor). */
import { useMemo, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';

import type { ExtraQuestion, ExtraValue } from './referentiel';

function Choice({ on, multi, children, onClick }: { on: boolean; multi?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <ButtonBase
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={on}
      onClick={onClick}
      sx={{
        p: 1.5,
        gap: 1.5,
        width: '100%',
        justifyContent: 'flex-start',
        textAlign: 'left',
        borderRadius: 1.5,
        border: '1.5px solid',
        borderColor: on ? 'primary.main' : 'divider',
        bgcolor: on ? 'primary.lighter' : 'background.paper',
        transition: 'all .15s ease',
        '&:hover': { borderColor: 'primary.light' },
        '[data-mui-color-scheme="dark"] &': on ? { bgcolor: 'rgba(224,108,127,.12)' } : {},
      }}
    >
      <Iconify
        width={22}
        sx={{ color: on ? 'primary.main' : 'text.disabled', flexShrink: 0 }}
        icon={
          multi
            ? on
              ? 'solar:check-square-bold'
              : 'solar:stop-linear'
            : on
              ? 'solar:record-circle-bold'
              : 'solar:record-linear'
        }
      />
      <Typography sx={{ lineHeight: 1.45 }}>{children}</Typography>
    </ButtonBase>
  );
}

export function ExtraInput({
  e,
  value,
  order: givenOrder,
  onChange,
}: {
  e: ExtraQuestion;
  value: ExtraValue | undefined;
  /** display order of the options (shuffled per respondent when the question asks for it) */
  order?: number[];
  onChange: (v: ExtraValue | null) => void;
}) {
  const options = e.options ?? [];
  const order = useMemo(
    () => (givenOrder && givenOrder.length === options.length ? givenOrder : options.map((_, k) => k)),
    [givenOrder, options],
  );

  switch (e.type) {
    case 'single':
      return (
        <Stack spacing={1} role="radiogroup" aria-label={e.txt}>
          {order.map((k) => (
            <Choice key={k} on={value === k} onClick={() => onChange(value === k ? null : k)}>
              {options[k].txt}
            </Choice>
          ))}
        </Stack>
      );
    case 'multiple': {
      const sel = Array.isArray(value) ? (value as number[]) : [];
      const max = e.maxChoices || options.length;
      return (
        <Stack spacing={1} role="group" aria-label={e.txt}>
          <Typography variant="caption" color="text.secondary">
            {e.maxChoices ? `Jusqu'à ${e.maxChoices} réponse${e.maxChoices > 1 ? 's' : ''}` : 'Plusieurs réponses possibles'}
            {(e.minChoices ?? 0) > 1 ? ` (au moins ${e.minChoices})` : ''} · {sel.length} sélectionnée{sel.length > 1 ? 's' : ''}
          </Typography>
          {order.map((k) => {
            const on = sel.includes(k);
            return (
              <Choice
                key={k}
                multi
                on={on}
                onClick={() => {
                  if (on) onChange(sel.filter((x) => x !== k));
                  else if (sel.length < max) onChange([...sel, k].sort((a, b) => a - b));
                }}
              >
                {options[k].txt}
              </Choice>
            );
          })}
        </Stack>
      );
    }
    case 'yesno': {
      const [yes, no] = e.labels ?? ['Oui', 'Non'];
      return (
        <Stack direction="row" spacing={1.5} role="radiogroup" aria-label={e.txt}>
          {([true, false] as const).map((b) => (
            <Box key={String(b)} sx={{ flex: 1 }}>
              <Choice on={value === b} onClick={() => onChange(value === b ? null : b)}>
                {b ? yes : no}
              </Choice>
            </Box>
          ))}
        </Stack>
      );
    }
    case 'scale': {
      const min = e.min ?? 0;
      const max = e.max ?? 10;
      const step = e.step ?? 1;
      const n = Math.floor((max - min) / step) + 1;
      const v = typeof value === 'number' ? value : null;
      if (n <= 11)
        return (
          <Box>
            <Box role="radiogroup" aria-label={e.txt} sx={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: { xs: 0.5, sm: 0.75 } }}>
              {Array.from({ length: n }, (_, i) => min + i * step).map((x) => (
                <ButtonBase
                  key={x}
                  role="radio"
                  aria-checked={v === x}
                  onClick={() => onChange(v === x ? null : x)}
                  sx={{
                    py: 1.25,
                    borderRadius: 1,
                    typography: 'subtitle2',
                    border: '1px solid',
                    borderColor: v === x ? 'primary.main' : 'divider',
                    bgcolor: v === x ? 'primary.main' : 'background.paper',
                    color: v === x ? 'primary.contrastText' : 'text.primary',
                  }}
                >
                  {x}
                </ButtonBase>
              ))}
            </Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
              <Typography variant="caption" color="text.secondary">{e.minLabel}</Typography>
              <Typography variant="caption" color="text.secondary">{e.maxLabel}</Typography>
            </Stack>
          </Box>
        );
      return (
        <Box sx={{ px: 1 }}>
          <Slider
            value={v ?? min}
            min={min}
            max={max}
            step={step}
            valueLabelDisplay="on"
            onChange={(_, x) => onChange(x as number)}
            sx={{ mt: 3, opacity: v == null ? 0.5 : 1 }}
            aria-label={e.txt}
          />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">{e.minLabel || min}</Typography>
            <Typography variant="caption" color="text.secondary">{e.maxLabel || max}</Typography>
          </Stack>
        </Box>
      );
    }
    case 'ranking': {
      const cur = Array.isArray(value) && value.length === options.length ? (value as number[]) : null;
      const list = cur ?? order;
      const move = (i: number, d: -1 | 1) => {
        const nx = list.slice();
        [nx[i], nx[i + d]] = [nx[i + d], nx[i]];
        onChange(nx);
      };
      return (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary">
            Classez du plus important (en haut) au moins important avec les flèches.
            {!cur && ' Validez l’ordre proposé si vous le partagez.'}
          </Typography>
          {list.map((k, i) => (
            <Stack
              key={k}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{ p: 1, pl: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: cur ? 'primary.light' : 'divider', bgcolor: 'background.paper' }}
            >
              <Chip size="small" label={i + 1} color={cur ? 'primary' : 'default'} />
              <Typography sx={{ flex: 1 }}>{options[k].txt}</Typography>
              <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter ${options[k].txt}`}>
                <Iconify icon="solar:alt-arrow-up-linear" />
              </IconButton>
              <IconButton size="small" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre ${options[k].txt}`}>
                <Iconify icon="solar:alt-arrow-down-linear" />
              </IconButton>
            </Stack>
          ))}
          {!cur && (
            <Box>
              <Chip
                clickable
                color="primary"
                variant="outlined"
                icon={<Iconify icon="solar:check-circle-linear" />}
                label="Je valide cet ordre"
                onClick={() => onChange(list)}
              />
            </Box>
          )}
        </Stack>
      );
    }
    case 'text': {
      const s = typeof value === 'string' ? value : '';
      const max = e.maxLength ?? 1000;
      return (
        <TextField
          fullWidth
          multiline={e.multiline !== false}
          minRows={e.multiline !== false ? 3 : undefined}
          value={s}
          onChange={(ev) => onChange(ev.target.value.slice(0, max))}
          placeholder="Votre réponse"
          helperText={`${s.length} / ${max} caractères · n'indiquez ni nom ni information personnelle`}
          inputProps={{ maxLength: max, 'aria-label': e.txt }}
        />
      );
    }
    default:
      return null;
  }
}
