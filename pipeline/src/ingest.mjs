/**
 * LIT Bytes ingestion job.
 *
 * Fetches items from free news sources, dedupes against Firestore,
 * rewrites new items into one-sentence "bytes" via DeepSeek, stores them
 * in the `bytes` collection, and emits feed.json (the public feed the
 * extension downloads).
 *
 * Required env:
 *   FIREBASE_SERVICE_ACCOUNT  - service account JSON (the whole JSON string)
 *   DEEPSEEK_API_KEY          - DeepSeek API key
 * Optional env:
 *   FINNHUB_API_KEY           - enables the market-news source (category: stocks)
 *   FEED_OUT                  - output path for feed.json (default: ./feed.json)
 *   MAX_NEW_ITEMS             - cap on LLM calls per run (default: 30)
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import admin from 'firebase-admin';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_NEW_ITEMS = Number(process.env.MAX_NEW_ITEMS ?? 30);
const FEED_OUT = process.env.FEED_OUT ?? 'feed.json';
const FEED_SIZE = 100;
const CATEGORIES = ['tech', 'ai', 'stocks', 'dev-tip'];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function fetchWithTimeout(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}

// ---------- Sources ----------
// Each source returns raw items: { title, url, publishedAt: Date, source, category? }

const xmlParser = new XMLParser({ ignoreAttributes: false });

async function fetchRss(url, sourceName) {
  const xml = await (await fetchWithTimeout(url)).text();
  const parsed = xmlParser.parse(xml);
  const items = parsed?.rss?.channel?.item ?? [];
  return (Array.isArray(items) ? items : [items])
    .filter((it) => typeof it?.title === 'string' && typeof it?.link === 'string')
    .map((it) => ({
      title: it.title.trim(),
      url: it.link.trim(),
      publishedAt: it.pubDate ? new Date(it.pubDate) : new Date(),
      source: sourceName,
    }));
}

async function fetchFinnhub(apiKey) {
  const res = await fetchWithTimeout(`https://finnhub.io/api/v1/news?category=general&token=${apiKey}`);
  const items = await res.json();
  if (!Array.isArray(items)) return [];
  return items
    .filter((it) => typeof it?.headline === 'string' && typeof it?.url === 'string')
    .map((it) => ({
      title: it.headline.trim(),
      url: it.url.trim(),
      publishedAt: it.datetime ? new Date(it.datetime * 1000) : new Date(),
      source: 'finnhub',
      category: 'stocks',
    }));
}

async function fetchAllSources() {
  const tasks = [
    ['hackernews', () => fetchRss('https://hnrss.org/newest?points=100', 'hackernews')],
    ['techcrunch', () => fetchRss('https://techcrunch.com/feed/', 'techcrunch')],
    ['dev.to', () => fetchRss('https://dev.to/feed', 'dev.to')],
  ];
  if (process.env.FINNHUB_API_KEY) {
    tasks.push(['finnhub', () => fetchFinnhub(process.env.FINNHUB_API_KEY)]);
  }

  const all = [];
  const results = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  results.forEach((result, i) => {
    const name = tasks[i][0];
    if (result.status === 'fulfilled') {
      console.log(`${name}: ${result.value.length} items`);
      all.push(...result.value);
    } else {
      console.warn(`${name}: FAILED - ${result.reason}`);
    }
  });
  return all;
}

// ---------- DeepSeek summarization ----------

async function summarize(item, apiKey) {
  const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You turn tech news headlines into a single punchy sentence of at most 120 characters ' +
            '(a "byte") for a VS Code status bar. Reply as JSON: ' +
            '{"text": "<the byte>", "category": "tech" | "ai" | "stocks" | "dev-tip"}. ' +
            'No hashtags, no emoji, no trailing period needed.',
        },
        { role: 'user', content: `Headline: ${item.title}\nSource: ${item.source}` },
      ],
    }),
  });
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  if (typeof parsed.text !== 'string' || parsed.text.length === 0) throw new Error('empty text');
  return {
    text: parsed.text.slice(0, 160),
    category: item.category ?? (CATEGORIES.includes(parsed.category) ? parsed.category : 'tech'),
  };
}

// ---------- Main ----------

/** Accepts the service account either as raw JSON or base64-encoded JSON. */
function parseServiceAccount(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      console.error('FIREBASE_SERVICE_ACCOUNT is neither valid JSON nor base64-encoded JSON.');
      process.exit(1);
    }
  }
}

async function main() {
  const serviceAccount = parseServiceAccount(requireEnv('FIREBASE_SERVICE_ACCOUNT'));
  const deepseekKey = requireEnv('DEEPSEEK_API_KEY');

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const bytesCol = db.collection('bytes');

  const rawItems = await fetchAllSources();

  // Dedup by URL hash — check Firestore BEFORE any LLM call.
  const byHash = new Map();
  for (const item of rawItems) {
    const hash = createHash('sha1').update(item.url).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, item);
  }
  const hashes = [...byHash.keys()];
  const existing = new Set();
  for (let i = 0; i < hashes.length; i += 100) {
    const refs = hashes.slice(i, i + 100).map((h) => bytesCol.doc(h));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap) => snap.exists && existing.add(snap.id));
  }
  const newEntries = [...byHash.entries()]
    .filter(([hash]) => !existing.has(hash))
    .sort(([, a], [, b]) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_NEW_ITEMS);
  console.log(`${byHash.size} unique items, ${existing.size} already known, processing ${newEntries.length}`);

  let created = 0;
  for (const [hash, item] of newEntries) {
    try {
      const byte = await summarize(item, deepseekKey);
      await bytesCol.doc(hash).create({
        text: byte.text,
        url: item.url,
        category: byte.category,
        publishedAt: admin.firestore.Timestamp.fromDate(item.publishedAt),
        source: item.source,
      });
      created += 1;
    } catch (err) {
      // ALREADY_EXISTS (race) or LLM failure — skip this item, keep going.
      console.warn(`skip ${item.url}: ${err.message ?? err}`);
    }
  }
  console.log(`created ${created} new bytes`);

  // Emit the public feed from the latest bytes in Firestore.
  const snapshot = await bytesCol.orderBy('publishedAt', 'desc').limit(FEED_SIZE).get();
  const feed = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      text: d.text,
      url: d.url,
      category: d.category,
      publishedAt: d.publishedAt.toDate().toISOString(),
    };
  });
  writeFileSync(FEED_OUT, JSON.stringify(feed, null, 2));
  console.log(`wrote ${feed.length} bytes to ${FEED_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
