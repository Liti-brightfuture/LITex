import * as vscode from 'vscode';
import { Stats } from './stats';

export function buildRecapText(stats: Stats): string {
  const total = stats.getLast7DaysTotal();
  const streak = stats.getStreakDays();
  return `I read ${total} tech bytes while coding this week with Claude Code. Streak: ${streak} days. #LITBytes`;
}

export async function shareMyWeek(stats: Stats): Promise<void> {
  const text = buildRecapText(stats);
  const choice = await vscode.window.showInformationMessage(text, 'Share on X', 'Copy text');

  if (choice === 'Share on X') {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
  } else if (choice === 'Copy text') {
    await vscode.env.clipboard.writeText(text);
  }
}
