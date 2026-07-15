import * as fs from 'fs';
import * as vscode from 'vscode';

export interface TechByte {
  text: string;
  url?: string;
  category?: string;
}

export const FEED_URL = 'https://raw.githubusercontent.com/Liti-brightfuture/LITex/feed/feed.json';
const CACHE_KEY = 'litBytes.cachedFeed';
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Rotates through short tech bytes. Content priority:
 * 1. remote feed.json (refreshed periodically), 2. last cached remote feed,
 * 3. the bundled content/bytes.json (offline fallback).
 */
export class ContentFeed {
  private bytes: TechByte[] = [];
  private cursor = 0;

  constructor(
    private readonly bundledPath: string,
    private readonly memento: vscode.Memento
  ) {
    const cached = this.memento.get<TechByte[]>(CACHE_KEY);
    this.bytes = sanitize(cached) ?? loadBundled(this.bundledPath);
  }

  /** Fetches the hosted feed; on failure keeps whatever content we already have. */
  async refresh(): Promise<void> {
    try {
      const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) return;
      const fresh = sanitize(await res.json());
      if (!fresh) return;
      this.bytes = fresh;
      this.cursor = 0;
      await this.memento.update(CACHE_KEY, fresh);
    } catch {
      // offline or feed unavailable — cached/bundled content stays in place
    }
  }

  next(): TechByte | undefined {
    if (this.bytes.length === 0) return undefined;
    const byte = this.bytes[this.cursor % this.bytes.length];
    this.cursor += 1;
    return byte;
  }
}

function sanitize(parsed: unknown): TechByte[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const bytes = parsed.filter(
    (b): b is TechByte => typeof b?.text === 'string' && b.text.length > 0
  );
  return bytes.length > 0 ? bytes : undefined;
}

function loadBundled(path: string): TechByte[] {
  try {
    return sanitize(JSON.parse(fs.readFileSync(path, 'utf8'))) ?? [];
  } catch {
    return [];
  }
}
