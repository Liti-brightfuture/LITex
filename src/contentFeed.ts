import * as fs from 'fs';

export interface TechByte {
  text: string;
  url?: string;
}

/** Rotates through a curated, locally-stored feed of short tech bytes. */
export class ContentFeed {
  private bytes: TechByte[] = [];
  private cursor = 0;

  constructor(private readonly feedPath: string) {
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.feedPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.bytes = parsed.filter(
          (b): b is TechByte => typeof b?.text === 'string' && b.text.length > 0
        );
      }
    } catch {
      this.bytes = [];
    }
  }

  next(): TechByte | undefined {
    if (this.bytes.length === 0) return undefined;
    const byte = this.bytes[this.cursor % this.bytes.length];
    this.cursor += 1;
    return byte;
  }
}
