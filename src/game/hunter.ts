import type { CellPos } from '../world/level';

/**
 * HunterLink — phone-side authority for hunter mode. A remote hunter on
 * /watch claims the room, then streams target cells. The creature's physics
 * stay here; the link just decides who is driving and where to.
 *
 * Timing uses caller-supplied `now` (ms) so it is unit-testable.
 */

export type HunterMsg =
  | { t: 'claim'; id: string }
  | { t: 'release'; id: string }
  | { t: 'target'; id: string; col: number; row: number };

export const HUNTER_TIMEOUT_MS = 5000;   // silence → AI takes over
export const HUNTER_CLAIM_STALE_MS = 10000; // dead hunter's claim lapses
export const HUNTER_MSG_CAP = 10;          // max target messages per second

export class HunterLink {
  hunterId: string | null = null;
  target: CellPos | null = null;
  private lastMsgAt = -Infinity;
  private tokens = HUNTER_MSG_CAP;
  private lastRefill = -Infinity;

  /** A hunter asks to take control. Second hunter while one is live → busy. */
  claim(id: string, now: number): 'accepted' | 'busy' {
    if (this.hunterId === null || this.hunterId === id || now - this.lastMsgAt > HUNTER_CLAIM_STALE_MS) {
      this.hunterId = id;
      this.lastMsgAt = now;
      return 'accepted';
    }
    return 'busy';
  }

  /** Explicit hang-up from the hunter UI. */
  release(id: string): void {
    if (this.hunterId === id) {
      this.hunterId = null;
      this.target = null;
      this.lastMsgAt = -Infinity;
    }
  }

  /**
   * A target-cell message from the hunter. Rate-capped at 10 msg/s by token
   * bucket — anything above that is dropped, not queued.
   */
  onTarget(id: string, col: number, row: number, now: number): 'ok' | 'dropped' | 'not-hunter' {
    if (this.hunterId !== id) return 'not-hunter';
    this.refill(now);
    if (this.tokens < 1) return 'dropped';
    this.tokens--;
    this.target = { col, row };
    this.lastMsgAt = now;
    return 'ok';
  }

  /** True while the hunter is in control (heard from within 5 s). */
  active(now: number): boolean {
    return this.hunterId !== null && now - this.lastMsgAt < HUNTER_TIMEOUT_MS;
  }

  /** A hunter has claimed this room at some point (intro/results copy). */
  get claimed(): boolean {
    return this.hunterId !== null;
  }

  private refill(now: number): void {
    if (this.lastRefill === -Infinity) this.lastRefill = now;
    if (now > this.lastRefill) {
      this.tokens = Math.min(HUNTER_MSG_CAP, this.tokens + ((now - this.lastRefill) / 1000) * HUNTER_MSG_CAP);
      this.lastRefill = now;
    }
  }
}
