import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { Stats } from './stats';

const USER_ID_KEY = 'litBytes.userId';
const LAST_SYNC_KEY = 'litBytes.lastSyncAt';
const OPT_IN_PROMPTED_KEY = 'litBytes.cardSyncPrompted';
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // at most one upload per hour

/**
 * Opt-in sync of anonymous stats (a random UUID plus numeric counters only —
 * never code, prompts, or AI responses) to the cards worker, which serves the
 * live badge SVG and the weekly recap PNG.
 */
export class StatsSync {
  constructor(
    private readonly memento: vscode.Memento,
    private readonly stats: Stats
  ) {}

  isEnabled(): boolean {
    return vscode.workspace.getConfiguration('litBytes').get<boolean>('enableCardSync', false);
  }

  /** Base URL of the deployed worker; empty until the user deploys and configures it. */
  private serviceUrl(): string | undefined {
    const url = vscode.workspace
      .getConfiguration('litBytes')
      .get<string>('cardServiceUrl', '')
      .trim()
      .replace(/\/+$/, '');
    return url.length > 0 ? url : undefined;
  }

  getUserId(): string {
    let id = this.memento.get<string>(USER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      this.memento.update(USER_ID_KEY, id);
    }
    return id;
  }

  badgeUrl(): string | undefined {
    const base = this.serviceUrl();
    return base ? `${base}/card/${this.getUserId()}.svg` : undefined;
  }

  recapUrl(): string | undefined {
    const base = this.serviceUrl();
    return base ? `${base}/recap/${this.getUserId()}.png` : undefined;
  }

  /** Fire-and-forget upload, debounced to once per hour. No-op unless opted in. */
  maybeSync(): void {
    if (!this.isEnabled()) return;
    const base = this.serviceUrl();
    if (!base) return;
    const lastSyncAt = this.memento.get<number>(LAST_SYNC_KEY, 0);
    if (Date.now() - lastSyncAt < SYNC_INTERVAL_MS) return;
    this.memento.update(LAST_SYNC_KEY, Date.now());

    const body = JSON.stringify({
      totalBytes: this.stats.getTotalBytes(),
      streak: this.stats.getStreakDays(),
      last7: this.stats.getLast7DaysTotal(),
      topCategory: this.stats.getTopCategory(),
    });
    fetch(`${base}/stats/${this.getUserId()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      /* offline or worker down — next hourly attempt will retry */
    });
  }

  /** One-time opt-in prompt, shown the first time the user opens the share flow. */
  async promptOptInOnce(): Promise<void> {
    if (this.isEnabled() || this.memento.get<boolean>(OPT_IN_PROMPTED_KEY, false)) return;
    await this.memento.update(OPT_IN_PROMPTED_KEY, true);
    const choice = await vscode.window.showInformationMessage(
      'Want a live badge and recap image? LIT Bytes can sync your stats — only a random ID and ' +
        'numeric counters (bytes read, streak). Never your code, prompts, or AI responses.',
      'Enable sync',
      'No thanks'
    );
    if (choice === 'Enable sync') {
      await vscode.workspace
        .getConfiguration('litBytes')
        .update('enableCardSync', true, vscode.ConfigurationTarget.Global);
      this.maybeSync();
    }
  }
}
