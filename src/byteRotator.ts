import { ContentFeed, TechByte } from './contentFeed';
import { StatusBarController } from './statusBar';

const BYTE_DURATION_MS = 7_000;
// Transcript writes can pause 10-20s during a long generation; only after
// this much silence do we consider Claude Code done working.
const IDLE_THRESHOLD_MS = 20_000;

/**
 * Shows each byte for exactly BYTE_DURATION_MS, rotating on its own clock —
 * but only while Claude Code is working. Activity events merely start the
 * rotation and keep it alive; they never drive the display directly.
 */
export class ByteRotator {
  private timer: NodeJS.Timeout | undefined;
  private lastActivityAt = 0;

  constructor(
    private readonly feed: ContentFeed,
    private readonly statusBar: StatusBarController,
    private readonly onByteShown: (byte: TechByte) => void
  ) {}

  /** Called on every detected transcript write (the activity heartbeat). */
  noteActivity(): void {
    this.lastActivityAt = Date.now();
    if (this.timer) return; // already rotating
    this.showNext();
    this.timer = setInterval(() => this.tick(), BYTE_DURATION_MS);
  }

  private tick(): void {
    if (Date.now() - this.lastActivityAt > IDLE_THRESHOLD_MS) {
      this.stop();
      return;
    }
    this.showNext();
  }

  private showNext(): void {
    const byte = this.feed.next();
    if (!byte) return;
    this.statusBar.showByte(byte.text, byte.url);
    this.onByteShown(byte);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.statusBar.hide();
  }

  dispose(): void {
    this.stop();
  }
}
