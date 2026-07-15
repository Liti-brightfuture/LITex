# Changelog

## 0.1.0 — 2026-07-15

First public release.

### Added
- **"Claude is done" notification** — when Claude Code stops writing to its session, LIT signals it via a subtle status bar check (default) or an information toast. Settings: `litBytes.notifyOnIdle` (`off` / `statusBar` / `toast`) and `litBytes.idleThresholdSeconds`.
- Rotating byte-sized tech news in the status bar while Claude Code works, fed by a live pipeline (Hacker News, TechCrunch, dev.to, market news) refreshed every 4 hours.
- Local stats (bytes per day, categories, streak) with milestone celebrations.
- Opt-in anonymous badge + weekly recap image (`litBytes.enableCardSync`).

### Changed
- Activity detection rewritten: event-driven file watching with an adaptive async fallback poller, replacing the previous 1-second synchronous directory scan. Dramatically lower overhead, and fully dormant if Claude Code isn't used.
- Extension is now bundled and minified with esbuild (~11 KB).

### Fixed
- All timers and watchers are now properly disposed with the extension.
- Pre-existing old sessions no longer trigger a byte on startup.
- Bundled offline fallback bytes now carry categories, so they count toward category stats.
