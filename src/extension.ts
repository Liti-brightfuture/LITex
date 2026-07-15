import * as vscode from 'vscode';
import * as path from 'path';
import { SessionWatcher } from './sessionWatcher';
import { ContentFeed } from './contentFeed';
import { StatusBarController } from './statusBar';
import { Stats } from './stats';
import { StatsSync } from './sync';
import { shareMyWeek, copyBadgeUrl } from './recapCard';

let watcher: SessionWatcher | undefined;
let statusBar: StatusBarController | undefined;
let feedRefreshTimer: NodeJS.Timeout | undefined;

const FEED_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MILESTONES_KEY = 'litBytes.milestonesShown';

export function activate(context: vscode.ExtensionContext): void {
  const feed = new ContentFeed(
    path.join(context.extensionPath, 'content', 'bytes.json'),
    context.globalState
  );
  void feed.refresh();
  feedRefreshTimer = setInterval(() => void feed.refresh(), FEED_REFRESH_INTERVAL_MS);

  const stats = new Stats(context.globalState);
  const sync = new StatsSync(context.globalState, stats);
  statusBar = new StatusBarController();
  watcher = new SessionWatcher();

  watcher.onActivity(() => {
    const byte = feed.next();
    if (!byte) return;
    statusBar?.showByte(byte.text, byte.url);
    stats.recordByteSeen(byte.category);
    sync.maybeSync();
    void checkMilestones(context.globalState, stats, sync);
  });
  watcher.start();

  context.subscriptions.push(
    vscode.commands.registerCommand('litBytes.shareMyWeek', () => shareMyWeek(stats, sync)),
    vscode.commands.registerCommand('litBytes.copyBadgeUrl', () => copyBadgeUrl(sync)),
    vscode.commands.registerCommand('litBytes.showStats', () => {
      vscode.window.showInformationMessage(
        `Last 7 days: ${stats.getLast7DaysTotal()} bytes. Streak: ${stats.getStreakDays()} days.`
      );
    })
  );
}

/**
 * One-time celebrations at meaningful milestones — the only place a share
 * prompt is proactively suggested (deliberately rate-limited by design).
 */
async function checkMilestones(
  memento: vscode.Memento,
  stats: Stats,
  sync: StatsSync
): Promise<void> {
  const milestones: Array<{ id: string; hit: boolean; message: string }> = [
    { id: 'streak-7', hit: stats.getStreakDays() >= 7, message: '7-day streak! A full week of tech bytes.' },
    { id: 'streak-30', hit: stats.getStreakDays() >= 30, message: '30-day streak! A whole month of tech bytes.' },
    { id: 'bytes-100', hit: stats.getTotalBytes() >= 100, message: '100 bytes read! You are officially well-informed.' },
    { id: 'bytes-500', hit: stats.getTotalBytes() >= 500, message: '500 bytes read! That is dedication.' },
  ];
  const shown = memento.get<string[]>(MILESTONES_KEY, []);
  const next = milestones.find((m) => m.hit && !shown.includes(m.id));
  if (!next) return;

  await memento.update(MILESTONES_KEY, [...shown, next.id]);
  const choice = await vscode.window.showInformationMessage(next.message, 'Share');
  if (choice === 'Share') {
    await shareMyWeek(stats, sync);
  }
}

export function deactivate(): void {
  if (feedRefreshTimer) clearInterval(feedRefreshTimer);
  watcher?.dispose();
  statusBar?.dispose();
}
