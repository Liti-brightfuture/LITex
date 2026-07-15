import * as vscode from 'vscode';

type NotifyMode = 'off' | 'statusBar' | 'toast';

/** How long the "done" status bar signal stays visible. */
const DONE_VISIBLE_MS = 10_000;

/**
 * Signals the moment Claude Code goes idle — the answer to "is it done yet?"
 * without staring at the terminal. Mode is read from settings on every
 * notification, so changes apply immediately.
 */
export class IdleNotifier implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private hideTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.item.name = 'LIT Bytes: Claude done';
  }

  /** Called on the active -> idle transition. */
  notifyIdle(): void {
    const mode = vscode.workspace
      .getConfiguration('litBytes')
      .get<NotifyMode>('notifyOnIdle', 'statusBar');
    if (mode === 'off') return;

    if (mode === 'toast') {
      void vscode.window.showInformationMessage('Claude Code is done — back to it!');
      return;
    }

    this.item.text = '$(check-all) Claude is done';
    this.item.tooltip = 'Claude Code stopped writing to its session — your turn.';
    this.item.show();
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.item.hide(), DONE_VISIBLE_MS);
  }

  /** Called when a new session starts — clear any lingering "done" signal. */
  clear(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    this.item.hide();
  }

  dispose(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.item.dispose();
  }
}
