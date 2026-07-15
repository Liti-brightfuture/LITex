# LIT Bytes

A VS Code extension that turns Claude Code's "thinking" wait time into something useful: a rotating byte-sized tech fact in your status bar, instead of an empty spinner.

## What it does

- **Detects Claude Code activity** by polling file modification times under `~/.claude/projects/`. It never reads prompts, code, or AI responses — only file timestamps, the same low-permission approach used by similar extensions (e.g. claudecodeads.com).
- **Shows a tech byte in the status bar** (bottom-left) whenever it detects activity — a short fact with a clickable link to learn more. It auto-hides after 15 seconds.
- **Pulls fresh content daily** from a hosted feed (Hacker News, TechCrunch, dev.to, market news) that is updated every 4 hours by an automated pipeline — no extension update needed. If the feed is unreachable, it falls back to the last cached feed, then to a small bundled set of facts.
- **Tracks your stats locally** — bytes seen per day, per category, and your daily streak — stored in VS Code's local extension storage (`globalState`). Nothing leaves your machine unless you opt in to card sync (below).
- **Celebrates milestones** (7/30-day streaks, 100/500 bytes) with a one-time message — the only time a share is proactively suggested.
- **Optional, opt-in shareables**: a live badge for your GitHub README ("🔥 12-day streak · 340 bytes read") and a weekly "Wrapped"-style recap image, both rendered by a small Cloudflare Worker.

### Commands

| Command | What it does |
|---|---|
| `LIT: Show my byte stats` | Shows a popup with your last-7-days byte count and current streak. |
| `LIT: Share my week` | Builds a shareable recap and offers "Share on X", "Open recap image" (if sync is on) or "Copy text". |
| `LIT: Copy my badge URL` | Copies README-ready markdown embedding your live badge. |

### Settings

| Setting | Default | What it does |
|---|---|---|
| `litBytes.enableCardSync` | `false` | Opt in to syncing anonymous stats (random ID + numeric counters only) to power the badge/recap. |
| `litBytes.cardServiceUrl` | `""` | Base URL of the deployed cards worker. Empty disables badge/recap features. |

### Project structure

```
src/
  extension.ts       # activation entry point, wires everything together
  sessionWatcher.ts  # polls ~/.claude/projects/ for activity (mtime-based)
  contentFeed.ts     # remote feed fetch + cache + bundled fallback, rotation
  statusBar.ts       # renders a byte in the status bar for 15s
  stats.ts           # local daily/streak/category tracking via globalState
  sync.ts            # opt-in anonymous stats sync for badge/recap cards
  recapCard.ts       # share flow: recap text, recap image, badge markdown
content/
  bytes.json         # bundled fallback feed (offline resilience)
pipeline/
  src/ingest.mjs     # GitHub Actions job: RSS/news -> DeepSeek bytes -> Firestore + feed.json
worker/
  src/index.ts       # Cloudflare Worker: POST /stats, GET /card/:id.svg, GET /recap/:id.png
  src/recap.ts       # Satori layout for the weekly recap PNG
.github/workflows/
  feed.yml           # cron (every 4h): runs the pipeline, publishes feed.json to the `feed` branch
```

## Running the extension locally

Requires [Node.js](https://nodejs.org/) (v18+) and VS Code.

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/Liti-brightfuture/LITex.git
   cd LITex
   npm install
   ```
2. Open the folder in VS Code.
3. Press **F5** (or `Run > Start Debugging`). This runs `npm run compile` automatically and opens a new **Extension Development Host** window with the extension loaded.
4. In that new window, open the Command Palette (`Ctrl+Shift+P`) and try the commands above.
5. To see a byte appear live, keep a Claude Code session active in that window — any write under `~/.claude/projects/` is picked up within ~1 second.

### Useful scripts

```bash
npm run compile   # one-off TypeScript build (src/ -> out/)
npm run watch     # rebuilds automatically on save
```

## Backend setup (one-time, all free tiers)

The extension works out of the box with the bundled/hosted feed. To run your own pipeline and cards service:

1. **Firebase**: create a project + Firestore, generate a service account JSON, add it as the `FIREBASE_SERVICE_ACCOUNT` GitHub Actions secret.
2. **DeepSeek**: add your API key as the `DEEPSEEK_API_KEY` secret. Optionally add `FINNHUB_API_KEY` for market news.
3. **Feed pipeline**: enable GitHub Actions — `.github/workflows/feed.yml` runs every 4 hours (or trigger it manually via *Run workflow*) and publishes `feed.json` to the `feed` branch, which the extension fetches.
   To test locally: `cd pipeline && npm install && FIREBASE_SERVICE_ACCOUNT='...' DEEPSEEK_API_KEY='...' node src/ingest.mjs`
4. **Cards worker**: `cd worker && npm install && npx wrangler login`, then `npx wrangler kv namespace create LIT_STATS`, put the returned id in `wrangler.toml`, and `npx wrangler deploy`. Set the deployed URL as `litBytes.cardServiceUrl` in your VS Code settings.

## Releasing

Publish to **both** the VS Code Marketplace (`vsce publish`) and **Open VSX** (`ovsx publish`) — Cursor and other VS Code forks use Open VSX. Treat launch as an event (Show HN, r/vscode, X) rather than a silent release.

## What's next (planned, not built yet)

- Contextual bytes: occasionally show a tip tied to the language of the file you're editing (needs per-language taxonomy in the feed).
- Paid content channels (e.g. real-time stock news) alongside the always-free general feed — see [ARCHITECTURE.md](ARCHITECTURE.md).

## Privacy

LIT Bytes never reads the contents of your prompts, code, or Claude's responses. It only checks file modification timestamps under `~/.claude/projects/` to know a session is active.

Network access, in full:
- **Feed download (read-only)**: the extension fetches the public `feed.json` from this repo's `feed` branch. Nothing about you is sent — it's a plain file download.
- **Stats sync (opt-in only, off by default)**: if you enable `litBytes.enableCardSync`, the extension sends a randomly generated ID plus numeric counters (total bytes, streak, last-7-days count, top category name) to the cards worker, at most once per hour, so your badge and recap image can render. Nothing else is ever sent, and the ID cannot be linked to you.
