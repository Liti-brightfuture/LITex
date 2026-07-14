# LIT Bytes

A VS Code extension that turns Claude Code's "thinking" wait time into something useful: a rotating byte-sized tech fact in your status bar, instead of an empty spinner.

## What it does

- **Detects Claude Code activity** by polling file modification times under `~/.claude/projects/`. It never reads prompts, code, or AI responses — only file timestamps, the same low-permission approach used by similar extensions (e.g. claudecodeads.com).
- **Shows a tech byte in the status bar** (bottom-left) whenever it detects activity — a short fact with a clickable link to learn more. It auto-hides after 15 seconds.
- **Tracks your stats locally** — how many bytes you've seen per day and your current daily streak — stored only in VS Code's local extension storage (`globalState`), nothing leaves your machine.
- **Lets you share a weekly recap** via a command that builds a short summary ("I read N tech bytes this week... Streak: N days") and offers to open a pre-filled tweet or copy the text to your clipboard.

### Commands

| Command | What it does |
|---|---|
| `LIT: Show my byte stats` | Shows a popup with your last-7-days byte count and current streak. |
| `LIT: Share my week` | Builds a shareable recap and offers "Share on X" or "Copy text". |

### Project structure

```
src/
  extension.ts       # activation entry point, wires everything together
  sessionWatcher.ts  # polls ~/.claude/projects/ for activity (mtime-based)
  contentFeed.ts      # loads and rotates through the tech byte feed
  statusBar.ts        # renders a byte in the status bar for 15s
  stats.ts             # local daily/streak tracking via globalState
  recapCard.ts         # builds and shares the weekly recap text
content/
  bytes.json           # curated feed of tech bytes (bundled, static for now)
```

## Status

This is an early MVP. The content feed is a small static file bundled with the extension (10 curated facts, English only) — it is **not yet** pulling live/daily news. See the architecture notes below for what's planned next.

## Running it locally

Requires [Node.js](https://nodejs.org/) (v18+) and VS Code.

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/Liti-brightfuture/LITex.git
   cd LITex
   npm install
   ```
2. Open the folder in VS Code.
3. Press **F5** (or `Run > Start Debugging`). This runs `npm run compile` automatically and opens a new **Extension Development Host** window with the extension loaded.
4. In that new window, open the Command Palette (`Ctrl+Shift+P`) and try:
   - `LIT: Show my byte stats`
   - `LIT: Share my week`
5. To see a byte appear live, just keep a Claude Code session active in that window — any write to a file under `~/.claude/projects/` (i.e. Claude Code actually doing something) is picked up within ~1 second and shown in the status bar.

### Useful scripts

```bash
npm run compile   # one-off TypeScript build (src/ -> out/)
npm run watch     # rebuilds automatically on save
```

## What's next (planned, not built yet)

- A content pipeline that pulls 20+ fresh tech/news bytes per day (Hacker News, TechCrunch, dev.to, market data) instead of the static bundled file, without requiring a new extension release for every update.
- A viral, embeddable visual card (WakaTime/GitHub-readme-stats style) and a "Wrapped"-style weekly recap image, not just text.
- Infrastructure to eventually support optional paid content channels (e.g. real-time stock news) alongside the always-free general tech feed.

## Privacy

LIT Bytes never reads the contents of your prompts, code, or Claude's responses. It only checks file modification timestamps under `~/.claude/projects/` to know a session is active.
