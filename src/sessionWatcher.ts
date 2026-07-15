import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type SessionCallback = () => void;

/** Minimum gap between activity notifications (fs events can fire in bursts). */
const THROTTLE_MS = 500;
/** Poll cadence while a session is active (fallback for missed fs events). */
const POLL_ACTIVE_MS = 2_000;
/** Poll cadence decays up to this while idle. */
const POLL_IDLE_MAX_MS = 30_000;

/**
 * Detects Claude Code activity from file changes under ~/.claude/projects/
 * (no access to session content — only that files changed, mirroring the
 * low-permission approach used by claudecodeads.com).
 *
 * Primary signal: a VS Code FileSystemWatcher (cross-platform, event-driven).
 * Backup: an async mtime poller with adaptive backoff, in case fs events are
 * unreliable (network home dirs, some Linux setups).
 *
 * Emits three signals:
 * - onActivity: every detected transcript write (throttled heartbeat)
 * - onSessionStart: idle -> active transition
 * - onSessionIdle: active -> idle transition (no writes for the idle threshold)
 */
export class SessionWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private pollTimer: NodeJS.Timeout | undefined;
  private idleTimer: NodeJS.Timeout | undefined;

  private pollIntervalMs = POLL_ACTIVE_MS;
  private scanning = false;
  private baselined = false;
  private lastMtimeMs = 0;
  private lastActivityAt = 0;
  private sessionActive = false;
  private dirExists = false;
  private disposed = false;

  private readonly activityListeners: SessionCallback[] = [];
  private readonly startListeners: SessionCallback[] = [];
  private readonly idleListeners: SessionCallback[] = [];

  constructor(
    private readonly getIdleThresholdMs: () => number = () => 20_000,
    private readonly projectsDir = path.join(os.homedir(), '.claude', 'projects')
  ) {}

  onActivity(callback: SessionCallback): void {
    this.activityListeners.push(callback);
  }

  onSessionStart(callback: SessionCallback): void {
    this.startListeners.push(callback);
  }

  onSessionIdle(callback: SessionCallback): void {
    this.idleListeners.push(callback);
  }

  start(): void {
    this.checkDirAndInit();
    // If ~/.claude/projects doesn't exist yet (Claude Code never used), don't
    // poll for it — re-check lazily whenever the window regains focus.
    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused && !this.dirExists) this.checkDirAndInit();
      })
    );
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.pollTimer = undefined;
    this.idleTimer = undefined;
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }

  private checkDirAndInit(): void {
    fs.promises.stat(this.projectsDir).then(
      () => {
        if (this.disposed || this.dirExists) return;
        this.dirExists = true;
        this.initFsWatcher();
        this.schedulePoll();
      },
      () => {
        /* directory still missing — stay dormant until next focus */
      }
    );
  }

  private initFsWatcher(): void {
    try {
      const pattern = new vscode.RelativePattern(vscode.Uri.file(this.projectsDir), '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onEvent = () => this.noteActivityThrottled();
      this.disposables.push(
        watcher,
        watcher.onDidChange(onEvent),
        watcher.onDidCreate(onEvent),
        watcher.onDidDelete(onEvent)
      );
    } catch {
      // watcher unavailable — the poller alone still works
    }
  }

  private noteActivityThrottled(): void {
    if (Date.now() - this.lastActivityAt < THROTTLE_MS) return;
    this.fireActivity();
  }

  private fireActivity(): void {
    if (this.disposed) return;
    this.lastActivityAt = Date.now();
    this.pollIntervalMs = POLL_ACTIVE_MS;
    if (!this.sessionActive) {
      this.sessionActive = true;
      for (const listener of this.startListeners) listener();
    }
    for (const listener of this.activityListeners) listener();
    this.armIdleTimer();
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const threshold = this.getIdleThresholdMs();
    this.idleTimer = setTimeout(() => {
      if (this.disposed || !this.sessionActive) return;
      if (Date.now() - this.lastActivityAt >= threshold) {
        this.sessionActive = false;
        for (const listener of this.idleListeners) listener();
      } else {
        this.armIdleTimer();
      }
    }, threshold);
  }

  private schedulePoll(): void {
    if (this.disposed) return;
    this.pollTimer = setTimeout(() => void this.poll(), this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.scanning) {
      this.scanning = true;
      try {
        const latest = await findLatestMtime(this.projectsDir);
        if (!this.baselined) {
          // First scan establishes a baseline so pre-existing old sessions
          // don't count as activity on every extension startup.
          this.baselined = true;
          this.lastMtimeMs = latest;
        } else if (latest > this.lastMtimeMs) {
          this.lastMtimeMs = latest;
          this.noteActivityThrottled();
        } else if (!this.sessionActive) {
          this.pollIntervalMs = Math.min(this.pollIntervalMs * 2, POLL_IDLE_MAX_MS);
        }
      } finally {
        this.scanning = false;
      }
    }
    this.schedulePoll();
  }
}

export async function findLatestMtime(dir: string): Promise<number> {
  let latest = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return latest;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, await findLatestMtime(fullPath));
    } else if (entry.isFile()) {
      try {
        latest = Math.max(latest, (await fs.promises.stat(fullPath)).mtimeMs);
      } catch {
        // file may have been removed between readdir and stat; ignore
      }
    }
  }
  return latest;
}
