import * as vscode from 'vscode';
import * as path from 'path';
import { SessionWatcher } from './sessionWatcher';
import { ContentFeed } from './contentFeed';
import { StatusBarController } from './statusBar';
import { ByteRotator } from './byteRotator';
import { IdleNotifier } from './notifier';
import { Stats } from './stats';
import { StatsSync } from './sync';
import { shareMyWeek, copyBadgeUrl } from './recapCard';
import { SpinnerVerbsManager, bytesToVerbs } from './spinnerVerbs';

const FEED_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MILESTONES_KEY = 'litBytes.milestonesShown';
const SPINNER_PROMPT_KEY = 'litBytes.spinnerPromptShown';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('LIT Bytes');
  context.subscriptions.push(output);

  const feed = new ContentFeed(
    path.join(context.extensionPath, 'content', 'bytes.json'),
    context.globalState
  );
  const spinner = new SpinnerVerbsManager(context.globalState, (msg) => output.appendLine(msg));
  const refreshFeed = async (): Promise<void> => {
    await feed.refresh();
    spinner.syncVerbs(bytesToVerbs(feed.getAll()));
  };
  void refreshFeed();
  const feedRefreshTimer = setInterval(() => void refreshFeed(), FEED_REFRESH_INTERVAL_MS);

  void maybeOfferSpinnerBytes(context.globalState, spinner, feed);

  const stats = new Stats(context.globalState);
  const sync = new StatsSync(context.globalState, stats);
  const statusBar = new StatusBarController();
  const notifier = new IdleNotifier();
  const rotator = new ByteRotator(feed, statusBar, (byte) => {
    stats.recordByteSeen(byte.category);
    sync.maybeSync();
    void checkMilestones(context.globalState, stats, sync);
  });
  const watcher = new SessionWatcher(getIdleThresholdMs);

  watcher.onActivity(() => rotator.noteActivity());
  watcher.onSessionStart(() => notifier.clear());
  watcher.onSessionIdle(() => notifier.notifyIdle());
  watcher.start();

  context.subscriptions.push(
    new vscode.Disposable(() => clearInterval(feedRefreshTimer)),
    watcher,
    rotator,
    statusBar,
    notifier,
    vscode.commands.registerCommand('litBytes.shareMyWeek', () => shareMyWeek(stats, sync)),
    vscode.commands.registerCommand('litBytes.copyBadgeUrl', () => copyBadgeUrl(sync)),
    vscode.commands.registerCommand('litBytes.showStats', () => {
      vscode.window.showInformationMessage(
        `Last 7 days: ${stats.getLast7DaysTotal()} bytes. Streak: ${stats.getStreakDays()} days.`
      );
    }),
    vscode.commands.registerCommand('litBytes.enableSpinnerBytes', () =>
      enableSpinnerBytes(spinner, feed)
    ),
    vscode.commands.registerCommand('litBytes.disableSpinnerBytes', async () => {
      if (!spinner.isEnabled()) {
        vscode.window.showInformationMessage('LIT Bytes: spinner bytes are not enabled.');
        return;
      }
      await spinner.restore();
      vscode.window.showInformationMessage('LIT Bytes: Claude Code spinner restored.');
    })
  );
}

function getIdleThresholdMs(): number {
  const seconds = vscode.workspace
    .getConfiguration('litBytes')
    .get<number>('idleThresholdSeconds', 20);
  // Transcript writes can legitimately pause 10-20s during a long generation;
  // enforce a floor so users can't configure a false-positive machine.
  return Math.max(10, seconds) * 1000;
}

/** One-time opt-in prompt for taking over the Claude Code spinner verbs. */
async function maybeOfferSpinnerBytes(
  memento: vscode.Memento,
  spinner: SpinnerVerbsManager,
  feed: ContentFeed
): Promise<void> {
  if (spinner.isEnabled() || memento.get<boolean>(SPINNER_PROMPT_KEY, false)) return;
  await memento.update(SPINNER_PROMPT_KEY, true);
  const choice = await vscode.window.showInformationMessage(
    'LIT Bytes can also show tech bytes in the Claude Code thinking spinner. Enable?',
    'Enable',
    'Not now'
  );
  if (choice === 'Enable') {
    await enableSpinnerBytes(spinner, feed);
  }
}

async function enableSpinnerBytes(spinner: SpinnerVerbsManager, feed: ContentFeed): Promise<void> {
  const existing = spinner.currentUserSetting();
  if (existing !== undefined && !spinner.isEnabled()) {
    const choice = await vscode.window.showWarningMessage(
      'You already have custom Claude Code spinner verbs. Replace them with LIT bytes? (Disable restores them.)',
      'Replace',
      'Cancel'
    );
    if (choice !== 'Replace') return;
  }
  await spinner.enable(bytesToVerbs(feed.getAll()));
  vscode.window.showInformationMessage('LIT Bytes: tech bytes now show in the Claude Code spinner.');
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
  // all cleanup is handled via context.subscriptions
}
