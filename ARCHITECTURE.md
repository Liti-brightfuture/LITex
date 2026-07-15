# LIT Bytes — Architecture

How the pieces fit together today, and the monetization design that everything is already shaped for (design only — none of the payment flow is built).

## System overview

```
┌────────────────────┐   every 4h    ┌──────────────┐
│ GitHub Actions      │──────────────▶│ Firestore    │  source of truth
│ pipeline/ingest.mjs │               │ `bytes`      │  (dedup + future gating)
│  HN / TC / dev.to / │               └──────────────┘
│  Finnhub → DeepSeek │
│                     │── feed.json ─▶ `feed` branch (raw.githubusercontent.com)
└────────────────────┘                      │ public, cacheable, free CDN
                                            ▼
┌────────────────────┐   fetch/4h   ┌──────────────┐
│ VS Code extension   │◀─────────────│ feed.json    │
│  status bar bytes   │              └──────────────┘
│  local stats        │
│  (opt-in) stats ────┼──▶ Cloudflare Worker ──▶ KV (per-user counters)
└────────────────────┘        │
                              ├─ GET /card/:id.svg   (live badge)
                              └─ GET /recap/:id.png  (weekly recap, Satori+resvg)
```

Design principle: **Firestore is the durable, queryable source of truth; the static `feed.json` is the free public distribution layer.** Firestore has no free anonymous public-read path that is fast and cacheable at extension scale; a static file behind GitHub's CDN is. Entitlement checks, when they arrive, attach to Firestore — the distribution layer becomes per-category endpoints then.

## Firestore schema

### `bytes/{byteId}` — implemented
- Doc ID: SHA-1 of the article URL (this is also the dedup mechanism — the pipeline checks existence *before* any LLM call).
- Fields: `text` (≤160 chars), `url`, `category` (`tech` | `ai` | `stocks` | `dev-tip`), `publishedAt` (Timestamp), `source`.
- The `category` field is the single load-bearing piece of the monetization design: gating is a filter on it, so no data restructuring is ever needed.

### `users/{userId}` — reserved, not yet created
- `userId` = the same random UUID the extension already generates for card sync (anonymous device identity).
- Upgrade path: linking an email via Firebase Auth adds fields to this doc; the ID does not change.

### `entitlements/{userId}` — reserved, not yet created
- Shape: `{ category: 'stocks', active: true, source: 'stripe', expiresAt: Timestamp }` (one doc per user, map of categories, or subcollection — decide at build time based on how many paid channels exist).

## Stats storage: Workers KV, deliberately not Firestore

Card stats (`totalBytes`, `streak`, `last7`, `topCategory`) live in Workers KV, keyed by the anonymous UUID. Reasons: there is no Firestore admin SDK on Workers (REST + manual JWT signing is unjustified complexity for four counters), and KV reads happen at the edge where the cards render. Firestore remains the home of content and future user/entitlement data. If entitlements ever need to influence card rendering, the Worker gets a scoped Firestore REST credential then — not before.

## Payment flow (future)

1. **Stripe Checkout, subscription mode** — Stripe hosts the payment page; neither the extension nor any backend ever touches card data. The checkout link encodes the user's UUID as `client_reference_id`.
2. **Webhook receiver** — a small endpoint (the existing cards Worker or a sibling) receives `checkout.session.completed` / `customer.subscription.deleted` events, verifies the Stripe signature, and writes/updates `entitlements/{userId}`.
3. **Feed gating** — the flat `feed.json` becomes per-category endpoints: `/feed?categories=tech,dev-tip` stays free and static; `/feed?categories=stocks` is served by a Worker that checks `entitlements` before responding. The extension's rotation/status-bar logic needs zero changes — `contentFeed.ts` already consumes `{ text, url, category }`.

## Why deferring is safe

Nothing built today changes shape when billing arrives:
- The `category` tag already flows from pipeline → Firestore → feed → extension stats.
- The anonymous UUID already exists and is the future `users`/`entitlements` key.
- The Worker already terminates user-facing HTTPS and can host the webhook + gated feed routes.

The only new artifacts at build time are the Stripe account, the webhook route, and the gated feed route.
