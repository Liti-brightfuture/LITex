import * as vscode from 'vscode';
import * as path from 'path';
import { SessionWatcher } from './sessionWatcher';
import { ContentFeed } from './contentFeed';
import { StatusBarController } from './statusBar';
import { Stats } from './stats';
import { shareMyWeek } from './recapCard';

let watcher: SessionWatcher | undefined;
let statusBar: StatusBarController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const feed = new ContentFeed(path.join(context.extensionPath, 'content', 'bytes.json'));
  const stats = new Stats(context.globalState);
  statusBar = new StatusBarController();
  watcher = new SessionWatcher();

  watcher.onActivity(() => {
    const byte = feed.next();
    if (!byte) return;
    statusBar?.showByte(byte.text, byte.url);
    stats.recordByteSeen();
  });
  watcher.start();

  context.subscriptions.push(
    vscode.commands.registerCommand('litBytes.shareMyWeek', () => shareMyWeek(stats)),
    vscode.commands.registerCommand('litBytes.showStats', () => {
      vscode.window.showInformationMessage(
        `Last 7 days: ${stats.getLast7DaysTotal()} bytes. Streak: ${stats.getStreakDays()} days.`
      );
    })
  );
}

export function deactivate(): void {
  watcher?.dispose();
  statusBar?.dispose();
}
