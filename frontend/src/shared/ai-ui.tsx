/** Shared AI UI: a minimal safe Markdown renderer and a streaming chat panel (employee coach + HR assistant). */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { Iconify } from '@vionhub/design-system/components';

import { speakableSegments, streamAi } from './ai';
import { useSpeech } from './speech';

// ---------------------------------------------------------------------------------------- Markdown

function inline(text: string): ReactNode[] {
  // **bold** and _italic_ only — rendered as React nodes (no HTML injection possible)
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|(?<![\w])_(.+?)_(?![\w])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] != null ? (
        <Box component="strong" key={k++} sx={{ fontWeight: 700 }}>
          {m[1]}
        </Box>
      ) : (
        <em key={k++}>{m[2]}</em>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders the small Markdown subset the prompts ask for: ### headings, "-" lists, paragraphs, bold/italic. */
export function Markdown({ text, dense }: { text: string; dense?: boolean }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <Box component="ul" key={blocks.length} sx={{ pl: 2.5, my: dense ? 0.5 : 1, listStyle: 'disc', '& li': { mb: 0.75, display: 'list-item' }, '& li::marker': { color: 'primary.main' } }}>
        {items.map((it, i) => (
          <Typography component="li" key={i} variant="body2" sx={{ lineHeight: 1.65 }}>
            {inline(it)}
          </Typography>
        ))}
      </Box>,
    );
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*•]\s+(.*)$/) ?? line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (li) {
      list.push(li[1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h)
      blocks.push(
        <Typography key={blocks.length} variant="subtitle1" sx={{ fontWeight: 700, mt: blocks.length ? (dense ? 1 : 2) : 0, mb: 0.5, color: 'primary.main' }}>
          {inline(h[2])}
        </Typography>,
      );
    else
      blocks.push(
        <Typography key={blocks.length} variant="body2" sx={{ lineHeight: 1.7, my: dense ? 0.5 : 0.75 }}>
          {inline(line)}
        </Typography>,
      );
  }
  flush();
  return <>{blocks}</>;
}

// ----------------------------------------------------------------------------------- speak button

export function SpeakText({ id, text }: { id: string; text: string }) {
  const sp = useSpeech();
  if (!sp.supported || !text.trim()) return null;
  const on = sp.speakingId === id;
  return (
    <Tooltip title={on ? 'Arrêter la lecture' : 'Écouter'}>
      <IconButton size="small" onClick={() => sp.toggle(id, speakableSegments(text))} aria-label={on ? 'Arrêter la lecture' : 'Écouter'}>
        <Iconify icon={on ? 'solar:stop-circle-bold' : 'solar:volume-loud-bold-duotone'} width={18} />
      </IconButton>
    </Tooltip>
  );
}

// ------------------------------------------------------------------------------------- typing dots

export function TypingDots() {
  return (
    <Box
      component="span"
      aria-label="Rédaction en cours"
      sx={{
        display: 'inline-flex',
        gap: 0.5,
        '& i': {
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: 'text.disabled',
          animation: 'tacDot 1.2s infinite ease-in-out',
        },
        '& i:nth-of-type(2)': { animationDelay: '.15s' },
        '& i:nth-of-type(3)': { animationDelay: '.3s' },
        '@keyframes tacDot': { '0%, 80%, 100%': { opacity: 0.25, transform: 'translateY(0)' }, '40%': { opacity: 1, transform: 'translateY(-3px)' } },
      }}
    >
      <i />
      <i />
      <i />
    </Box>
  );
}

// ------------------------------------------------------------------------------------------- chat

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
}

interface ChatProps {
  /** e.g. "/ai/me/coach" */
  endpoint: string;
  extraBody?: Record<string, unknown>;
  suggestions: string[];
  placeholder: string;
  /** shown as the assistant's first bubble (not sent to the API) */
  greeting: string;
  toolLabel?: (t: { name: string; input: Record<string, unknown> }) => string;
  minHeight?: number;
  maxHeight?: number | string;
}

export function AiChat({ endpoint, extraBody, suggestions, placeholder, greeting, toolLabel, minHeight = 160, maxHeight = 460 }: ChatProps) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput('');
    const history: Msg[] = [...msgs.filter((m) => m.content.trim()), { role: 'user', content: q }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    abort.current = new AbortController();
    const patchLast = (f: (m: Msg) => Msg) => setMsgs((cur) => [...cur.slice(0, -1), f(cur[cur.length - 1])]);
    try {
      await streamAi(
        endpoint,
        { ...extraBody, messages: history.slice(-20).map(({ role, content }) => ({ role, content })) },
        {
          signal: abort.current.signal,
          onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
          onTool: (t) => patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), toolLabel ? toolLabel(t) : t.name] })),
        },
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Erreur');
      // drop the empty answer bubble; keep the question so the user can retry
      setMsgs((cur) => (cur[cur.length - 1]?.content ? cur : cur.slice(0, -1)));
    } finally {
      setBusy(false);
    }
  };

  const bubble = (m: Msg, i: number) => {
    const mine = m.role === 'user';
    const last = i === msgs.length - 1;
    return (
      <Stack key={i} direction="row" spacing={1} justifyContent={mine ? 'flex-end' : 'flex-start'} alignItems="flex-start">
        {!mine && <AiAvatar />}
        <Box
          sx={{
            maxWidth: '85%',
            px: 1.75,
            py: 1.25,
            borderRadius: 2,
            ...(mine
              ? { bgcolor: 'primary.main', color: 'primary.contrastText', borderTopRightRadius: 4 }
              : { bgcolor: 'background.neutral', borderTopLeftRadius: 4 }),
          }}
        >
          {m.tools?.length ? (
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5} sx={{ mb: m.content ? 1 : 0 }}>
              {m.tools.map((t, k) => (
                <Chip key={k} size="small" variant="outlined" icon={<Iconify icon="solar:database-bold-duotone" width={14} />} label={t} />
              ))}
            </Stack>
          ) : null}
          {mine ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {m.content}
            </Typography>
          ) : m.content ? (
            <>
              <Markdown text={m.content} dense />
              {!(busy && last) && (
                <Box sx={{ textAlign: 'right', mt: -0.5, mb: -0.75 }}>
                  <SpeakText id={`chat-${endpoint}-${i}`} text={m.content} />
                </Box>
              )}
            </>
          ) : (
            <TypingDots />
          )}
        </Box>
      </Stack>
    );
  };

  return (
    <Stack spacing={1.5}>
      <Stack ref={scroller} spacing={1.5} sx={{ minHeight: msgs.length ? minHeight : 0, maxHeight, overflowY: 'auto', pr: 0.5, scrollBehavior: 'smooth' }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <AiAvatar />
          <Box sx={{ maxWidth: '85%', px: 1.75, py: 1.25, borderRadius: 2, borderTopLeftRadius: 4, bgcolor: 'background.neutral' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.65 }}>
              {greeting}
            </Typography>
          </Box>
        </Stack>
        {msgs.map(bubble)}
      </Stack>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {!msgs.length && (
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
          {suggestions.map((s) => (
            <Chip key={s} label={s} onClick={() => send(s)} variant="outlined" color="primary" icon={<Iconify icon="solar:chat-round-dots-bold-duotone" width={16} />} sx={{ height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
          ))}
        </Stack>
      )}
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          fullWidth
          multiline
          maxRows={4}
          size="small"
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          inputProps={{ 'aria-label': placeholder }}
        />
        <IconButton color="primary" disabled={busy || !input.trim()} onClick={() => send(input)} aria-label="Envoyer" sx={{ bgcolor: 'primary.lighter' }}>
          <Iconify icon={busy ? 'solar:menu-dots-bold' : 'solar:plain-2-bold'} />
        </IconButton>
      </Stack>
    </Stack>
  );
}

export function AiAvatar({ size = 30 }: { size?: number }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        color: 'common.white',
        background: 'linear-gradient(135deg, #A6192E 0%, #B5862F 100%)',
      }}
    >
      <Iconify icon="solar:magic-stick-3-bold" width={size * 0.55} />
    </Box>
  );
}

