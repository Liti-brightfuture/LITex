import * as vscode from 'vscode';

/** Renders a tech byte in the status bar for a short window, then hides it. */
export class StatusBarController {
  private readonly item: vscode.StatusBarItem;
  private hideTimer: NodeJS.Timeout | undefined;

  // 7s display + 1s grace: the rotator replaces the byte every 7s while
  // Claude Code works, resetting this timer; if no replacement comes, the
  // item hides itself (safety net for the idle case).
  constructor(private readonly visibleDurationMs = 8000) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  }

  showByte(text: string, url?: string): void {
    this.item.text = `$(zap) ${text}`;
    this.item.tooltip = url ?? text;
    this.item.command = url
      ? { title: 'Open', command: 'vscode.open', arguments: [vscode.Uri.parse(url)] }
      : undefined;
    this.item.show();

    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.item.hide(), this.visibleDurationMs);
  }

  hide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    this.item.hide();
  }

  dispose(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.item.dispose();
  }
}
