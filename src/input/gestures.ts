/**
 * Gesture state machine — fully usable without sight.
 *
 * Abstracted over pointer events so it is unit-testable with synthetic input:
 * feed pointerDown/pointerMove/pointerUp with ids, positions and times.
 *
 *  - single tap (< 250 ms, < 15 px, no second finger ever joined) → 'tap'
 *  - two or more fingers held → 'walkStart' … 'walkEnd' (never a tap)
 *  - one finger held 800 ms, < 15 px → 'longPress'
 *  - three-finger tap → 'threeFingerTap'
 *  - one-finger release after ≥ 40 px travel → 'swipe'
 *  - strict upward flick (> 60 px up, |dx| < ½·|dy|, < 300 ms) → 'flick'
 *    (emitted in ADDITION to the qualifying 'swipe'; throws a pebble)
 *  - one-finger horizontal movement → 'drag' deltas (fallback turning),
 *    only once net horizontal travel exceeds 10 px AND dominates vertical
 */
export type GestureEvent =
  | { type: 'tap' }
  | { type: 'threeFingerTap' }
  | { type: 'longPress' }
  | { type: 'walkStart' }
  | { type: 'walkEnd' }
  | { type: 'flick' }
  | { type: 'swipe'; dir: 'left' | 'right' | 'up' | 'down'; dx: number; dy: number }
  | { type: 'drag'; dx: number; dy: number };

const TAP_MAX_MS = 350;
const TAP_MAX_PX = 15;
const LONGPRESS_MS = 800;
const SWIPE_MIN_PX = 40;
const THREE_TAP_MS = 400;
const FLICK_MIN_UP = 60;
const FLICK_MAX_MS = 300;
const DRAG_START_PX = 10;

interface Finger {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  moved: number; // accumulated path length
}

export class GestureRecognizer {
  private fingers = new Map<number, Finger>();
  private everMulti = false;
  private maxSimultaneous = 0;
  private thirdJoinedAt = -1;
  private longPressFired = false;
  private walking = false;
  private dragging = false;
  private emitFn: (e: GestureEvent) => void;
  private detachFns: (() => void)[] = [];

  constructor(emit: (e: GestureEvent) => void) {
    this.emitFn = emit;
  }

  private emit(e: GestureEvent) {
    this.emitFn(e);
  }

  get isWalking(): boolean {
    return this.walking;
  }

  pointerDown(id: number, x: number, y: number, t: number): void {
    if (this.fingers.size === 0) {
      this.everMulti = false;
      this.maxSimultaneous = 0;
      this.thirdJoinedAt = -1;
      this.longPressFired = false;
      this.dragging = false;
    }
    this.fingers.set(id, { id, x0: x, y0: y, x, y, t0: t, moved: 0 });
    this.maxSimultaneous = Math.max(this.maxSimultaneous, this.fingers.size);
    if (this.fingers.size >= 2) {
      this.everMulti = true;
      if (!this.walking) {
        this.walking = true;
        this.emit({ type: 'walkStart' });
      }
    }
    if (this.fingers.size >= 3 && this.thirdJoinedAt < 0) {
      this.thirdJoinedAt = t;
    }
  }

  pointerMove(id: number, x: number, y: number, t: number): void {
    const f = this.fingers.get(id);
    if (!f) return;
    const dx = x - f.x;
    const dy = y - f.y;
    f.moved += Math.hypot(dx, dy);
    f.x = x;
    f.y = y;
    // One-finger horizontal drag → fallback turning deltas. The drag gate
    // opens only once net horizontal travel exceeds 10 px AND dominates
    // vertical — an upward pebble flick never turns the player.
    if (this.fingers.size === 1 && !this.walking && dx !== 0) {
      const netX = Math.abs(x - f.x0);
      const netY = Math.abs(y - f.y0);
      if (netX > DRAG_START_PX && netX > netY) this.dragging = true;
      if (this.dragging) this.emit({ type: 'drag', dx, dy });
    }
    void t;
  }

  pointerUp(id: number, x: number, y: number, t: number): void {
    const f = this.fingers.get(id);
    if (!f) return;
    this.fingers.delete(id);
    const dur = t - f.t0;
    const dist = Math.hypot(x - f.x0, y - f.y0);
    const totalMoved = f.moved + Math.hypot(x - f.x, y - f.y);

    const wasThreeTap = this.maxSimultaneous >= 3
      && this.thirdJoinedAt >= 0
      && t - this.thirdJoinedAt < THREE_TAP_MS;

    if (this.fingers.size === 0) {
      if (wasThreeTap) {
        this.emit({ type: 'threeFingerTap' });
      } else if (!this.everMulti && !this.longPressFired) {
        // Strict upward pebble flick — emitted alongside the 'swipe' it
        // also qualifies as, so pause/results swipe-up behaviour is kept.
        const upPx = f.y0 - y;
        if (upPx > FLICK_MIN_UP && Math.abs(x - f.x0) < upPx * 0.5 && dur < FLICK_MAX_MS) {
          this.emit({ type: 'flick' });
        }
        if (dur < TAP_MAX_MS && dist < TAP_MAX_PX && totalMoved < TAP_MAX_PX) {
          this.emit({ type: 'tap' });
        } else if (dist >= SWIPE_MIN_PX && dur < 900) {
          // Still quick flicks — a held drag-turn must not become a menu
          // swipe — but 900 ms forgives slow deliberate blind swipes.
          const dir = Math.abs(x - f.x0) >= Math.abs(y - f.y0)
            ? (x > f.x0 ? 'right' : 'left')
            : (y > f.y0 ? 'down' : 'up');
          this.emit({ type: 'swipe', dir, dx: x - f.x0, dy: y - f.y0 });
        }
      }
    }
    if (this.walking && this.fingers.size < 2) {
      this.walking = false;
      this.emit({ type: 'walkEnd' });
    }
  }

  pointerCancel(id: number): void {
    this.fingers.delete(id);
    if (this.walking && this.fingers.size < 2) {
      this.walking = false;
      this.emit({ type: 'walkEnd' });
    }
    if (this.fingers.size === 0) {
      this.everMulti = false;
      this.maxSimultaneous = 0;
      this.thirdJoinedAt = -1;
      this.dragging = false;
    }
  }

  /** Call periodically (or on long-press deadline) to fire held-finger hints. */
  tick(now: number): void {
    if (this.fingers.size === 1 && !this.everMulti && !this.longPressFired) {
      const f = this.fingers.values().next().value!;
      if (now - f.t0 >= LONGPRESS_MS && f.moved < TAP_MAX_PX) {
        this.longPressFired = true;
        this.emit({ type: 'longPress' });
      }
    }
  }

  /** Wire real pointer events on an element. Returns a detach function. */
  attach(el: HTMLElement): () => void {
    const isUi = (e: PointerEvent) =>
      (e.target as HTMLElement | null)?.closest?.('button,input,select,a,[data-ui],#tuning-panel,#board,#name-prompt');
    const down = (e: PointerEvent) => {
      if (isUi(e)) return;
      el.setPointerCapture?.(e.pointerId);
      this.pointerDown(e.pointerId, e.clientX, e.clientY, performance.now());
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!this.fingers.has(e.pointerId)) return;
      this.pointerMove(e.pointerId, e.clientX, e.clientY, performance.now());
    };
    const up = (e: PointerEvent) => {
      if (!this.fingers.has(e.pointerId)) return;
      this.pointerUp(e.pointerId, e.clientX, e.clientY, performance.now());
    };
    const cancel = (e: PointerEvent) => this.pointerCancel(e.pointerId);
    let longPressTimer = 0;
    const scheduleLongPress = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = window.setTimeout(() => this.tick(performance.now()), LONGPRESS_MS + 20);
    };
    const downWrap = (e: PointerEvent) => { down(e); scheduleLongPress(); };
    el.addEventListener('pointerdown', downWrap);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    const detach = () => {
      el.removeEventListener('pointerdown', downWrap);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      window.clearTimeout(longPressTimer);
    };
    this.detachFns.push(detach);
    return detach;
  }

  detachAll(): void {
    for (const d of this.detachFns) d();
    this.detachFns = [];
  }
}
