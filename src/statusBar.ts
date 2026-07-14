import * as vscode from 'vscode';

/** Renders a tech byte in the status bar for a short window, then hides it. */
export class StatusBarController {
  private readonly item: vscode.StatusBarItem;
  private hideTimer: NodeJS.Timeout | undefined;

  constructor(private readonly visibleDurationMs = 15000) {
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

  dispose(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.item.dispose();
  }
}
