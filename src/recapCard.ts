import * as vscode from 'vscode';
import { Stats } from './stats';
import { StatsSync } from './sync';

export function buildRecapText(stats: Stats): string {
  const total = stats.getLast7DaysTotal();
  const streak = stats.getStreakDays();
  return `I read ${total} tech bytes while coding this week with Claude Code. Streak: ${streak} days. #LITBytes`;
}

export async function shareMyWeek(stats: Stats, sync: StatsSync): Promise<void> {
  await sync.promptOptInOnce();

  const text = buildRecapText(stats);
  const recapUrl = sync.isEnabled() ? sync.recapUrl() : undefined;
  const actions = recapUrl
    ? ['Share on X', 'Open recap image', 'Copy text']
    : ['Share on X', 'Copy text'];
  const choice = await vscode.window.showInformationMessage(text, ...actions);

  if (choice === 'Share on X') {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
  } else if (choice === 'Open recap image' && recapUrl) {
    await vscode.env.openExternal(vscode.Uri.parse(recapUrl));
  } else if (choice === 'Copy text') {
    await vscode.env.clipboard.writeText(text);
  }
}

/** Copies a README-ready markdown snippet embedding the live badge. */
export async function copyBadgeUrl(sync: StatsSync): Promise<void> {
  await sync.promptOptInOnce();
  const badgeUrl = sync.badgeUrl();
  if (!badgeUrl) {
    vscode.window.showWarningMessage(
      'Badge service not configured. Set "litBytes.cardServiceUrl" in settings (requires the deployed cards worker).'
    );
    return;
  }
  const markdown = `[![LIT Bytes](${badgeUrl})](https://github.com/Liti-brightfuture/LITex)`;
  await vscode.env.clipboard.writeText(markdown);
  vscode.window.showInformationMessage('Badge markdown copied — paste it into your GitHub README.');
}
