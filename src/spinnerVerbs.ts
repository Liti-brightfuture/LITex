import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TechByte } from './contentFeed';

export interface SpinnerVerbsSetting {
  mode: 'replace' | 'append';
  verbs: string[];
}

/** Snapshot of the user's spinnerVerbs value before we first touched it. */
interface SpinnerVerbsBackup {
  existed: boolean;
  value?: unknown;
}

const ENABLED_KEY = 'litBytes.spinnerVerbsEnabled';
const BACKUP_KEY = 'litBytes.spinnerVerbsBackup';

export function bytesToVerbs(bytes: TechByte[]): string[] {
  return bytes.map((b) => b.text);
}

/**
 * Reads a Claude Code settings.json. Returns {} when the file does not
 * exist (safe to create), and undefined when it exists but is not valid
 * JSON — in which case callers must not write, to avoid corrupting it.
 */
export function readSettings(settingsPath: string): Record<string, unknown> | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sets or removes the spinnerVerbs key, leaving every other key untouched.
 * Atomic: writes a temp file in the same directory, then renames over the
 * target. Returns false (writing nothing) when the existing file is invalid.
 */
export function writeSpinnerVerbs(settingsPath: string, value: unknown | undefined): boolean {
  const settings = readSettings(settingsPath);
  if (settings === undefined) return false;

  if (value === undefined) {
    delete settings.spinnerVerbs;
  } else {
    settings.spinnerVerbs = value;
  }

  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.lit-bytes-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tempPath, settingsPath);
  } catch (err) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // best effort cleanup
    }
    throw err;
  }
  return true;
}

/**
 * Owns the spinnerVerbs key in ~/.claude/settings.json while the feature is
 * enabled: backs up whatever the user had, keeps the verb list in sync with
 * the feed, and restores the original value on disable.
 */
export class SpinnerVerbsManager {
  constructor(
    private readonly memento: vscode.Memento,
    private readonly log: (message: string) => void,
    private readonly settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  ) {}

  isEnabled(): boolean {
    return this.memento.get<boolean>(ENABLED_KEY, false);
  }

  /** The user's current spinnerVerbs value, for the pre-replace confirmation. */
  currentUserSetting(): unknown | undefined {
    return readSettings(this.settingsPath)?.spinnerVerbs;
  }

  async enable(verbs: string[]): Promise<void> {
    const settings = readSettings(this.settingsPath);
    if (settings === undefined) {
      this.log(`Cannot enable spinner bytes: ${this.settingsPath} is not valid JSON.`);
      return;
    }
    if (this.memento.get<SpinnerVerbsBackup>(BACKUP_KEY) === undefined) {
      const backup: SpinnerVerbsBackup =
        'spinnerVerbs' in settings
          ? { existed: true, value: settings.spinnerVerbs }
          : { existed: false };
      await this.memento.update(BACKUP_KEY, backup);
    }
    await this.memento.update(ENABLED_KEY, true);
    this.write(verbs);
  }

  /** Refreshes the verb list; no-op unless the feature is enabled. */
  syncVerbs(verbs: string[]): void {
    if (!this.isEnabled()) return;
    this.write(verbs);
  }

  async restore(): Promise<void> {
    if (!this.isEnabled()) return;
    const backup = this.memento.get<SpinnerVerbsBackup>(BACKUP_KEY);
    try {
      const restored = writeSpinnerVerbs(
        this.settingsPath,
        backup?.existed ? backup.value : undefined
      );
      if (!restored) {
        this.log(`Cannot restore spinnerVerbs: ${this.settingsPath} is not valid JSON.`);
        return;
      }
    } catch (err) {
      this.log(`Failed to restore spinnerVerbs: ${String(err)}`);
      return;
    }
    await this.memento.update(BACKUP_KEY, undefined);
    await this.memento.update(ENABLED_KEY, false);
  }

  private write(verbs: string[]): void {
    if (verbs.length === 0) return;
    const setting: SpinnerVerbsSetting = { mode: 'replace', verbs };
    try {
      if (!writeSpinnerVerbs(this.settingsPath, setting)) {
        this.log(`Skipped spinnerVerbs write: ${this.settingsPath} is not valid JSON.`);
      }
    } catch (err) {
      this.log(`Failed to write spinnerVerbs: ${String(err)}`);
    }
  }
}
