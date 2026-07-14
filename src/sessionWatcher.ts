import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type ActivityCallback = () => void;

/**
 * Detects Claude Code activity by polling file modification times under
 * ~/.claude/projects/, mirroring the low-permission approach used by
 * claudecodeads.com (no access to session content, only mtimes).
 */
export class SessionWatcher {
  private timer: NodeJS.Timeout | undefined;
  private lastMtimeMs = 0;

  private readonly listeners: ActivityCallback[] = [];

  constructor(
    private readonly pollIntervalMs = 1000,
    private readonly projectsDir = path.join(os.homedir(), '.claude', 'projects')
  ) {}

  onActivity(callback: ActivityCallback): void {
    this.listeners.push(callback);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private poll(): void {
    const latest = findLatestMtime(this.projectsDir);
    if (latest > this.lastMtimeMs) {
      this.lastMtimeMs = latest;
      for (const listener of this.listeners) {
        listener();
      }
    }
  }
}

export function findLatestMtime(dir: string): number {
  let latest = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return latest;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, findLatestMtime(fullPath));
    } else if (entry.isFile()) {
      try {
        latest = Math.max(latest, fs.statSync(fullPath).mtimeMs);
      } catch {
        // file may have been removed between readdir and stat; ignore
      }
    }
  }
  return latest;
}
