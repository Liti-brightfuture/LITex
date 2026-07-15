/**
 * LIT Bytes cards worker.
 *
 * Routes:
 *   POST /stats/:userId       - extension pushes stats (opt-in, numbers only)
 *   GET  /card/:userId.svg    - live embeddable badge (GitHub README etc.)
 *   GET  /recap/:userId.png   - weekly "Wrapped"-style recap image
 */
import satori, { init as initSatori } from 'satori/wasm';
import initYoga from 'yoga-wasm-web';
import { Resvg, initWasm as initResvg } from '@resvg/resvg-wasm';
// Binary assets bundled via wrangler rules (see wrangler.toml).
import yogaWasm from 'yoga-wasm-web/dist/yoga.wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff';
import { renderRecap } from './recap';

export interface Env {
  LIT_STATS: KVNamespace;
}

export interface UserStats {
  totalBytes: number;
  streak: number;
  last7: number;
  topCategory?: string;
  updatedAt: number;
}

const CATEGORIES = ['tech', 'ai', 'stocks', 'dev-tip'];
const MIN_WRITE_INTERVAL_MS = 10 * 60 * 1000; // best-effort (KV is eventually consistent)
const USER_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    let match = url.pathname.match(/^\/stats\/([^/]+)$/);
    if (match && request.method === 'POST') {
      return handlePostStats(match[1], request, env);
    }

    match = url.pathname.match(/^\/card\/([^/]+)\.svg$/);
    if (match && request.method === 'GET') {
      return handleBadge(match[1], env);
    }

    match = url.pathname.match(/^\/recap\/([^/]+)\.png$/);
    if (match && request.method === 'GET') {
      return handleRecap(match[1], env);
    }

    return new Response('Not found', { status: 404 });
  },
};

// ---------- POST /stats/:userId ----------

async function handlePostStats(userId: string, request: Request, env: Env): Promise<Response> {
  if (!USER_ID_RE.test(userId)) return new Response('Invalid user id', { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // Strict validation with plausibility caps so nobody can fabricate absurd badges.
  const totalBytes = asBoundedInt(b.totalBytes, 1_000_000);
  const streak = asBoundedInt(b.streak, 3650);
  const last7 = asBoundedInt(b.last7, 10_000);
  if (totalBytes === undefined || streak === undefined || last7 === undefined) {
    return new Response('Invalid stats', { status: 400 });
  }
  const topCategory =
    typeof b.topCategory === 'string' && CATEGORIES.includes(b.topCategory)
      ? b.topCategory
      : undefined;

  const existing = await readStats(userId, env);
  if (existing && Date.now() - existing.updatedAt < MIN_WRITE_INTERVAL_MS) {
    return new Response('Too many updates', { status: 429 });
  }

  const stats: UserStats = { totalBytes, streak, last7, topCategory, updatedAt: Date.now() };
  await env.LIT_STATS.put(userId, JSON.stringify(stats));
  return new Response('ok', { status: 200 });
}

function asBoundedInt(value: unknown, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    return undefined;
  }
  return value;
}

async function readStats(userId: string, env: Env): Promise<UserStats | undefined> {
  const raw = await env.LIT_STATS.get(userId);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as UserStats;
  } catch {
    return undefined;
  }
}

// ---------- GET /card/:userId.svg ----------

function handleBadgeResponse(svg: string): Response {
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

async function handleBadge(userId: string, env: Env): Promise<Response> {
  if (!USER_ID_RE.test(userId)) return new Response('Invalid user id', { status: 400 });
  const stats = await readStats(userId, env);
  const value = stats
    ? `${stats.streak}-day streak · ${stats.totalBytes} bytes read`
    : 'no data yet';
  return handleBadgeResponse(badgeSvg('LIT Bytes', value));
}

/** Flat shields-style badge: dark label plate + accent value plate. */
function badgeSvg(label: string, value: string): string {
  const charW = 6.7; // Verdana 11px average advance — good enough for a badge
  const pad = 10;
  const labelW = Math.round(label.length * charW + pad * 2);
  const valueW = Math.round(value.length * charW + pad * 2);
  const width = labelW + valueW;
  const height = 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${label}: ${value}">
  <clipPath id="r"><rect width="${width}" height="${height}" rx="4"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${height}" fill="#1a1a19"/>
    <rect x="${labelW}" width="${valueW}" height="${height}" fill="#2a78d6"/>
  </g>
  <g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
    <text x="${labelW / 2}" y="16" fill="#ffffff">${label}</text>
    <text x="${labelW + valueW / 2}" y="16" fill="#ffffff">${value}</text>
  </g>
</svg>`;
}

// ---------- GET /recap/:userId.png ----------

let rendererReady = false;

async function ensureRenderer(): Promise<void> {
  if (rendererReady) return;
  initSatori(await initYoga(yogaWasm));
  await initResvg(resvgWasm);
  rendererReady = true;
}

async function handleRecap(userId: string, env: Env): Promise<Response> {
  if (!USER_ID_RE.test(userId)) return new Response('Invalid user id', { status: 400 });
  const stats = await readStats(userId, env);
  if (!stats) return new Response('No stats for this user yet', { status: 404 });

  await ensureRenderer();
  const svg = await satori(renderRecap(stats), {
    width: 800,
    height: 418,
    fonts: [
      { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
      { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
