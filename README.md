# LIT Bytes ⚡

**Learn something while Claude Code thinks — and know the second it's done.**

Claude Code runs for 30 seconds, 2 minutes, sometimes 10. That wait is dead time: too short to context-switch, too long to stare at a spinner. LIT Bytes fills it with rotating byte-sized tech news in your status bar, then pings you the moment Claude finishes.

<!-- TODO before publishing: add media/demo.gif showing a byte rotating in the status bar during a Claude Code run, ending with the "Claude is done" check -->

## Features

- ⚡ **Tech bytes while you wait** — while Claude Code works, a short fact or headline rotates in your status bar every 5 seconds, with a clickable link to the source. Categories: tech, AI, stocks, dev tips.
- ✅ **"Claude is done" signal** — when the session goes quiet, a subtle status bar check (or a toast, your choice) tells you it's your turn. No more alt-tabbing to check the terminal.
- 📰 **Always fresh** — content comes from a hosted feed (Hacker News, TechCrunch, dev.to, market news) updated every 4 hours by an automated pipeline. No extension updates needed. Offline? It falls back to the last cached feed, then to a bundled set of evergreen facts.
- 🔥 **Streaks & stats** — bytes seen per day, per category, and your daily streak, stored locally. Milestones (7/30-day streaks, 100/500 bytes) get a one-time celebration.
- 🏅 **Optional shareables** — an opt-in live badge for your GitHub README ("🔥 12-day streak · 340 bytes read") and a weekly "Wrapped"-style recap image.
- 🌀 **Spinner bytes (opt-in)** — replace Claude Code's own "Thinking...", "Vibing..." spinner text with tech bytes, so you're reading even without glancing at the status bar. Your original spinner verbs are backed up and restored exactly on disable.

## How it works

LIT Bytes watches file **modification timestamps** under `~/.claude/projects/` to know when Claude Code is active. It never reads your prompts, code, or Claude's responses — only that files changed. Detection is event-driven (VS Code's file watcher) with a lightweight adaptive fallback, and fully dormant if you don't use Claude Code.

If you enable spinner bytes, LIT writes the `spinnerVerbs` key in your local `~/.claude/settings.json` — nothing else in that file is touched, and your original value (if any) is restored exactly when you disable the feature.

## Commands

| Command | What it does |
|---|---|
| `LIT: Show my byte stats` | Popup with your last-7-days byte count and current streak. |
| `LIT: Share my week` | Builds a shareable recap — "Share on X", "Open recap image" (if sync is on), or "Copy text". |
| `LIT: Copy my badge URL` | Copies README-ready markdown embedding your live badge. |
| `LIT: Enable spinner bytes (Claude Code)` | Takes over Claude Code's `spinnerVerbs` setting to show tech bytes instead. |
| `LIT: Disable spinner bytes (restore Claude Code spinner)` | Restores whatever spinner verbs you had before enabling. |

## Settings

| Setting | Default | What it does |
|---|---|---|
| `litBytes.notifyOnIdle` | `"statusBar"` | How to signal Claude Code is done: `off`, `statusBar` (subtle check), or `toast`. |
| `litBytes.idleThresholdSeconds` | `20` | Seconds of silence before Claude Code counts as done (min 10 — writes can pause mid-generation). |
| `litBytes.enableCardSync` | `false` | Opt in to syncing anonymous stats (random ID + numeric counters only) for the badge/recap. |
| `litBytes.cardServiceUrl` | `""` | Base URL of the cards worker. Empty disables badge/recap features. |

## Privacy

LIT Bytes never reads the contents of your prompts, code, or Claude's responses — only file modification timestamps under `~/.claude/projects/`.

Network access, in full:
- **Feed download (read-only)**: fetches the public `feed.json` from this repo's `feed` branch. Nothing about you is sent — it's a plain file download.
- **Stats sync (opt-in only, off by default)**: with `litBytes.enableCardSync` on, the extension sends a randomly generated ID plus numeric counters (total bytes, streak, last-7-days count, top category name) to the cards worker, at most once per hour. Nothing else is ever sent, and the ID cannot be linked to you.

---

## Development

Requires [Node.js](https://nodejs.org/) v18+ and VS Code.

```bash
git clone https://github.com/Liti-brightfuture/LITex.git
cd LITex
npm install
```

Press **F5** in VS Code — this bundles with esbuild and opens an Extension Development Host. Keep a Claude Code session active in that window to see bytes appear live.

```bash
npm run compile    # typecheck (tsc --noEmit)
npm run build      # production bundle (esbuild, minified -> dist/)
npm run build:dev  # dev bundle with sourcemaps
npm run package    # build .vsix (vsce)
```

Architecture, backend setup (feed pipeline + cards worker) and design docs: see [ARCHITECTURE.md](ARCHITECTURE.md).

### Backend setup (one-time, all free tiers)

The extension works out of the box with the bundled/hosted feed. To run your own pipeline and cards service:

1. **Firebase**: create a project + Firestore, generate a service account JSON, add it as the `FIREBASE_SERVICE_ACCOUNT` GitHub Actions secret.
2. **DeepSeek**: add your API key as the `DEEPSEEK_API_KEY` secret. Optionally add `FINNHUB_API_KEY` for market news.
3. **Feed pipeline**: enable GitHub Actions — `.github/workflows/feed.yml` runs every 4 hours and publishes `feed.json` to the `feed` branch, which the extension fetches.
4. **Cards worker**: `cd worker && npm install && npx wrangler login`, then `npx wrangler kv namespace create LIT_STATS`, put the returned id in `wrangler.toml`, and `npx wrangler deploy`. Set the deployed URL as `litBytes.cardServiceUrl`.

### Releasing

Publish to **both** the VS Code Marketplace (`vsce publish`) and **Open VSX** (`ovsx publish`) — Cursor and other VS Code forks use Open VSX.

## License

[MIT](LICENSE)
