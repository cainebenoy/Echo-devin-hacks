import { describe, expect, it } from 'vitest';
import { Creature, type CreatureEvents } from '../src/game/creature';
import { Player } from '../src/game/player';
import { astar, bfsField } from '../src/world/path';
import { parseLevel } from '../src/world/level';
import { hold } from '../src/levels/hold';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A competent blind player: walks the shortest path to the exit at full
 * speed, clicking periodically to "look" — the strategy the narration
 * teaches. If this player cannot win, the level is broken, not hard.
 */
function simulate(seed: number, clickEvery: number): 'win' | 'caught' | 'timeout' {
  const l = parseLevel(hold);
  const p = new Player();
  p.spawn(l);
  const c = new Creature(mulberry32(seed));
  c.spawn(l);
  const exit = l.exits[0];
  let out: 'win' | 'caught' | 'timeout' = 'timeout';
  const ev: CreatureEvents = {
    onStateChange: () => {},
    onGrowl: () => {},
    onCatch: () => { out = 'caught'; },
  };
  const dt = 1 / 30;
  let t = 0;
  let nextClick = 3;
  while (t < 150 && out === 'timeout') {
    t += dt;
    // Steer toward the next A* waypoint like a player homing on the beacon.
    const path = astar(l, { col: Math.floor(p.x), row: Math.floor(p.y) }, exit) ?? [];
    const wp = path.length > 1 ? path[1] : exit;
    const want = Math.atan2(wp.col + 0.5 - p.x, -(wp.row + 0.5 - p.y));
    let diff = want - p.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const maxTurn = (120 * Math.PI / 180) * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const won = p.update(l, dt, 1, turn, 1.1, 0.5, {
      onFootstep: (f) => {
        const fld = bfsField(l, Math.floor(p.x), Math.floor(p.y));
        c.hearFootstep(l, fld, f, p.x, p.y, ev);
      },
      onBump: () => {},
    });
    if (won) { out = 'win'; break; }
    if (t >= nextClick) {
      nextClick = t + clickEvery;
      // Competent play: the heartbeat warns it is close — don't click then.
      const fld = bfsField(l, Math.floor(p.x), Math.floor(p.y));
      if (c.distanceTo(fld) > 8) c.hearClick(l, fld, p.x, p.y, ev);
    }
    c.update(l, dt, p.x, p.y, ev);
  }
  return out;
}

const ev = { onStateChange: () => {}, onGrowl: () => {}, onCatch: () => {} };

describe('The Hold — beatability', () => {
  it('a player walking the exit path while clicking wins on most seeds', () => {
    const results = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => simulate(s, 2.5));
    const wins = results.filter((r) => r === 'win').length;
    // Deterministic: report what happened for tuning visibility.
    // A fair-but-scary level lets a sensible strategy win most of the time.
    expect(wins).toBeGreaterThanOrEqual(6);
  });

  it('during a hunt, footsteps do not re-target — it charges the last position', () => {
    const l = parseLevel(hold);
    const c = new Creature(() => 0.99); // near-zero gaussian error
    c.spawn(l);
    c.x = 10.5; c.y = 5.5;
    const px = 5.5, py = 5.5;
    const field = bfsField(l, Math.floor(px), Math.floor(py));
    // Age past grace so the click can trigger a hunt.
    for (let i = 0; i < 70; i++) { c.update(l, 0.1, px, py, ev); c.x = 10.5; c.y = 5.5; }
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('hunt');
    const target = c.targetPos!;
    // Player slips away and steps loudly — mid-hunt the target must NOT move.
    c.hearFootstep(l, field, 'wood', px + 2, py + 2, ev);
    expect(c.targetPos!.x).toBeCloseTo(target.x, 5);
    expect(c.targetPos!.y).toBeCloseTo(target.y, 5);
  });

  it('after a hunt ends, a close click only investigates (cooldown)', () => {
    const l = parseLevel(hold);
    const c = new Creature(() => 0.99);
    c.spawn(l);
    c.x = 10.5; c.y = 5.5;
    const px = 5.5, py = 5.5;
    const field = bfsField(l, Math.floor(px), Math.floor(py));
    for (let i = 0; i < 70; i++) { c.update(l, 0.1, px, py, ev); c.x = 10.5; c.y = 5.5; }
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('hunt');
    // Let the hunt timer expire.
    for (let i = 0; i < 90; i++) { c.update(l, 0.1, px, py, ev); c.x = 10.5; c.y = 5.5; }
    expect(c.state).not.toBe('hunt');
    // Immediately clicking close by → investigate, not a fresh hunt.
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('investigate');
  });

  it('after the cooldown, a close click hunts again', () => {
    const l = parseLevel(hold);
    const c = new Creature(() => 0.99);
    c.spawn(l);
    c.x = 10.5; c.y = 5.5;
    const px = 5.5, py = 5.5;
    const field = bfsField(l, Math.floor(px), Math.floor(py));
    for (let i = 0; i < 70; i++) { c.update(l, 0.1, px, py, ev); c.x = 10.5; c.y = 5.5; }
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('hunt');
    // Expire the hunt, then wait out the 4 s cooldown plus margin.
    for (let i = 0; i < 90 + 50; i++) { c.update(l, 0.1, px, py, ev); c.x = 10.5; c.y = 5.5; }
    c.hearClick(l, field, px, py, ev);
    expect(c.state).toBe('hunt');
  });
});
