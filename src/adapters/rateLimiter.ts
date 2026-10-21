/** Limitador de janela deslizante: no máximo `limit` chamadas a cada `windowMs`. */
export class RateLimiter {
  private stamps: number[] = [];
  private pausedUntil = 0;

  constructor(private limit: number, private windowMs = 60_000) {}

  private prune(now: number) {
    const cut = now - this.windowMs;
    while (this.stamps.length && this.stamps[0] <= cut) this.stamps.shift();
  }

  /** Quantas chamadas cabem agora. */
  available(now = Date.now()): number {
    if (now < this.pausedUntil) return 0;
    this.prune(now);
    return Math.max(0, this.limit - this.stamps.length);
  }

  used(now = Date.now()): number {
    this.prune(now);
    return this.stamps.length;
  }

  /** Pausa todas as chamadas (ex.: após HTTP 429). */
  pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      if (this.available(now) > 0) {
        this.stamps.push(now);
        return;
      }
      const waitPause = this.pausedUntil - now;
      const waitSlot = this.stamps.length ? this.stamps[0] + this.windowMs - now : 250;
      await new Promise((r) => setTimeout(r, Math.max(50, waitPause > 0 ? waitPause : waitSlot)));
    }
  }
}
