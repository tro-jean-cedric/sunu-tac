import { useMemo } from 'react';

import Box from '@mui/material/Box';
import { m } from '@vionhub/design-system/motion';

const COLORS = ['#A6192E', '#D85A6B', '#B5862F', '#DCB26A', '#6B0F1E', '#F8D9DD'];

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** One-shot confetti burst (pure framer-motion, no dependency). Ignores pointer events; honours reduced motion. */
export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        i,
        left: Math.random() * 100,
        drift: (Math.random() - 0.5) * 240,
        delay: Math.random() * 0.5,
        duration: 2.2 + Math.random() * 1.6,
        rotate: (Math.random() - 0.5) * 900,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        round: Math.random() < 0.3,
        color: COLORS[i % COLORS.length],
      })),
    [count],
  );
  if (reduced()) return null;
  return (
    <Box aria-hidden className="no-print" sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1400 }}>
      {pieces.map((p) => (
        <m.div
          key={p.i}
          initial={{ y: -40, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift, rotate: p.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.6, 0.4, 1] }}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.w,
            height: p.round ? p.w : p.h,
            borderRadius: p.round ? '50%' : 2,
            background: p.color,
          }}
        />
      ))}
    </Box>
  );
}
