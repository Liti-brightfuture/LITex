import * as vscode from 'vscode';

interface DailyCounts {
  [dateKey: string]: number;
}

const STORAGE_KEY = 'litBytes.dailyCounts';

/** Tracks how many tech bytes the user has seen, purely locally. */
export class Stats {
  constructor(private readonly memento: vscode.Memento) {}

  recordByteSeen(): void {
    const counts = this.memento.get<DailyCounts>(STORAGE_KEY, {});
    const key = dateKey(new Date());
    counts[key] = (counts[key] ?? 0) + 1;
    this.memento.update(STORAGE_KEY, counts);
  }

  getLast7DaysTotal(): number {
    const counts = this.memento.get<DailyCounts>(STORAGE_KEY, {});
    let total = 0;
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      total += counts[dateKey(d)] ?? 0;
    }
    return total;
  }

  getStreakDays(): number {
    const counts = this.memento.get<DailyCounts>(STORAGE_KEY, {});
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if ((counts[dateKey(d)] ?? 0) > 0) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
