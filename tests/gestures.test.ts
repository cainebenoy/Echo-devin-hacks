import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type GestureEvent } from '../src/input/gestures';

function harness() {
  const events: GestureEvent[] = [];
  const g = new GestureRecognizer((e) => events.push(e));
  return { g, events };
}

describe('gesture state machine', () => {
  it('single quick tap → tap', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 102, 101, 150);
    expect(events).toEqual([{ type: 'tap' }]);
  });

  it('two-finger hold → walkStart/walkEnd, NEVER a tap', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 60);
    g.pointerUp(1, 100, 100, 900);
    g.pointerUp(2, 200, 100, 950);
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
    expect(events[0]).toEqual({ type: 'walkStart' });
    expect(events.at(-1)).toEqual({ type: 'walkEnd' });
  });

  it('second finger joining mid-press suppresses the click', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 100);
    g.pointerUp(2, 200, 100, 200);
    g.pointerUp(1, 100, 100, 240); // within tap window, but everMulti
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
  });

  it('long press → longPress at 800 ms, no tap on release', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.tick(850);
    expect(events).toEqual([{ type: 'longPress' }]);
    g.pointerUp(1, 100, 100, 1000);
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
  });

  it('three-finger tap → threeFingerTap', () => {
    const { g, events } = harness();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 30);
    g.pointerDown(3, 300, 100, 60);
    g.pointerUp(1, 100, 100, 200);
    g.pointerUp(2, 200, 100, 220);
    g.pointerUp(3, 300, 100, 240);
    expect(events).toContainEqual({ type: 'threeFingerTap' });
  });

  it('fast swipe → swipe with dominant direction', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 300, 0);
    g.pointerMove(1, 200, 300, 100);
    g.pointerUp(1, 180, 305, 200);
    expect(events).toContainEqual(expect.objectContaining({ type: 'swipe', dir: 'left' }));
  });

  it('slow small drag → no tap (moved too far for tap, too little for swipe)', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 300, 0);
    g.pointerMove(1, 290, 300, 400);
    g.pointerUp(1, 280, 300, 800);
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'swipe')).toHaveLength(0);
  });

  it('upward flick → flick event; never a tap, never a drag-turn', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 400, 0);
    g.pointerMove(1, 296, 340, 100);   // up 60, side −4
    g.pointerMove(1, 297, 330, 180);
    g.pointerUp(1, 297, 328, 260);     // net up 72, dur 260 < 300
    expect(events).toContainEqual({ type: 'flick' });
    expect(events.filter((e) => e.type === 'tap')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'drag')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'walkStart')).toHaveLength(0);
    // It still qualifies as a swipe — pause/results gestures keep working.
    expect(events).toContainEqual(expect.objectContaining({ type: 'swipe', dir: 'up' }));
  });

  it('an upward swipe that is too slow is not a flick', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 400, 0);
    g.pointerMove(1, 300, 320, 200);
    g.pointerUp(1, 300, 310, 380);     // up 90 but 380 ms > 300
    expect(events.filter((e) => e.type === 'flick')).toHaveLength(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'swipe', dir: 'up' }));
  });

  it('a sideways flick is not a pebble flick', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 400, 0);
    g.pointerMove(1, 340, 330, 100);   // side 40, up 70 — |dx| ≥ ½·|dy|
    g.pointerUp(1, 340, 330, 200);
    expect(events.filter((e) => e.type === 'flick')).toHaveLength(0);
  });

  it('vertical movement with sideways wander applies zero turn', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 400, 0);
    g.pointerMove(1, 312, 380, 60);    // +12 px x — under/at the gate and
    g.pointerMove(1, 313, 340, 120);   // vertical-dominant regardless
    g.pointerUp(1, 313, 336, 220);
    expect(events.filter((e) => e.type === 'drag')).toHaveLength(0);
  });

  it('a horizontal drag still turns once past the 10 px gate', () => {
    const { g, events } = harness();
    g.pointerDown(1, 300, 300, 0);
    g.pointerMove(1, 305, 300, 50);    // net 5 px — gated, no deltas yet
    expect(events.filter((e) => e.type === 'drag')).toHaveLength(0);
    g.pointerMove(1, 313, 300, 100);   // net 13 px dominant → gate opens
    g.pointerMove(1, 318, 300, 150);
    expect(events.filter((e) => e.type === 'drag').length).toBeGreaterThan(0);
  });

  it('walk ends only when fewer than two fingers remain', () => {
    const { g, events } = harness();
    g.pointerDown(1, 0, 0, 0);
    g.pointerDown(2, 10, 0, 10);
    g.pointerDown(3, 20, 0, 20); // three held → still walking
    g.pointerUp(1, 0, 0, 500);   // two remain → still walking
    expect(events.at(-1)).not.toEqual({ type: 'walkEnd' });
    g.pointerUp(2, 10, 0, 600);
    expect(events.at(-1)).toEqual({ type: 'walkEnd' });
    g.pointerUp(3, 20, 0, 700);
  });
});
