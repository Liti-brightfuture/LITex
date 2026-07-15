/**
 * Weekly recap card layout (rendered by satori into an 800x418 SVG).
 *
 * Satori accepts plain element objects, so no React dependency is needed.
 * Dark, single-look design: stat-tile pattern — hero number in primary ink,
 * labels in secondary/muted ink, one accent (blue) as a mark, never on text.
 */
import type { UserStats } from './index';

// Palette (dark mode tokens)
const PAGE = '#0d0d0d';
const SURFACE = '#1a1a19';
const INK = '#ffffff';
const INK_SECONDARY = '#c3c2b7';
const INK_MUTED = '#898781';
const BORDER = 'rgba(255,255,255,0.10)';
const ACCENT = '#3987e5';

type Node = { type: string; props: Record<string, unknown> };

function el(type: string, style: Record<string, unknown>, children?: Node[] | string): Node {
  return { type, props: { style: { display: 'flex', ...style }, children } };
}

function text(content: string, style: Record<string, unknown>): Node {
  return { type: 'div', props: { style, children: content } };
}

function tile(value: string, label: string, withAccent = false): Node {
  const children: Node[] = [];
  if (withAccent) {
    children.push(el('div', { width: 4, height: 40, backgroundColor: ACCENT, borderRadius: 2, marginRight: 12 }));
  }
  children.push(
    el('div', { flexDirection: 'column' }, [
      text(value, { fontSize: 32, fontWeight: 700, color: INK }),
      text(label, { fontSize: 15, color: INK_MUTED, marginTop: 2 }),
    ])
  );
  return el('div', { alignItems: 'center', marginRight: 56 }, children);
}

export function renderRecap(stats: UserStats): Node {
  return el('div', { width: '100%', height: '100%', backgroundColor: PAGE, padding: 24, fontFamily: 'Inter' }, [
    el(
      'div',
      {
        flexDirection: 'column',
        flexGrow: 1,
        backgroundColor: SURFACE,
        borderRadius: 16,
        border: `1px solid ${BORDER}`,
        padding: '36px 44px',
      },
      [
        // Header
        el('div', { justifyContent: 'space-between', alignItems: 'center' }, [
          text('LIT Bytes', { fontSize: 20, fontWeight: 700, color: INK }),
          text('Weekly Recap', { fontSize: 18, color: INK_SECONDARY }),
        ]),
        // Hero
        el('div', { flexDirection: 'column', marginTop: 28 }, [
          text(String(stats.last7), { fontSize: 104, fontWeight: 700, color: INK, lineHeight: 1 }),
          text('bytes read this week', { fontSize: 20, color: INK_SECONDARY, marginTop: 6 }),
        ]),
        // Stat tiles
        el('div', { marginTop: 36 }, [
          tile(`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`, 'current streak'),
          tile(String(stats.totalBytes), 'bytes all time'),
          ...(stats.topCategory ? [tile(stats.topCategory, 'top category', true)] : []),
        ]),
        // Footer watermark
        el('div', { flexGrow: 1, alignItems: 'flex-end', marginTop: 20 }, [
          text('Powered by LIT Bytes — byte-sized tech news while Claude Code thinks', {
            fontSize: 13,
            color: INK_MUTED,
          }),
        ]),
      ]
    ),
  ]);
}
