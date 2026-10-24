import { describe, expect, it } from 'vitest';
import { HunterLink, HUNTER_TIMEOUT_MS } from '../src/game/hunter';
import { Creature } from '../src/game/creature';
import { bfsField } from '../src/world/path';
import { parseLevel, type LevelDef } from '../src/world/level';

const meta = {
  id: 't', name: 't', order: 0, floor: 'stone' as const, playerHeading: 0, rt60: 1,
  clicksEnabled: true, beacon: false, beaconGain: 0,
  creature: { wander: 0.6, investigate: 1.0, hunt: 1.35 },
  narration: { intro: [], win: '', lose: '' },
};

// Corridor: P at col 2, C at col 22 → path distance up to 22.
const corridor: LevelDef = {
  meta,
  map: `#E#######################
#.P...................C.#
#########################`,
};

const ev = { onStateChange: () => {}, onGrowl: () => {}, onCatch: () => {} };

function setup(creatureCol = 10) {
  const l = parseLevel(corridor);
  const c = new Creature(() => 0.5);
  c.spawn(l);
  c.x = creatureCol + 0.5;
  c.y = 1.5;
  const field = bfsField(l, 2, 1);
  return { l, c, field, px: 2.5, py: 1.5 };
}

describe('hunter link', () => {
  it('first claim wins, a second hunter is refused', () => {
    const h = new HunterLink();
    expect(h.claim('a', 0)).toBe('accepted');
    expect(h.claim('b', 100)).toBe('busy');
    // Same hunter re-claiming (reconnect) is fine.
    expect(h.claim('a', 200)).toBe('accepted');
  });

  it('claim lapses after 10 s of silence so a new hunter can connect', () => {
    const h = new HunterLink();
    h.claim('a', 0);
    expect(h.claim('b', 11000)).toBe('accepted');
  });

  it('hands back to AI after 5 s of silence, retakes on a new message', () => {
    const h = new HunterLink();
    h.claim('a', 0);
    h.onTarget('a', 5, 3, 0);
    expect(h.active(4999)).toBe(true);
    expect(h.active(5001)).toBe(false); // > HUNTER_TIMEOUT_MS
    // Reconnect: a fresh message re-activates control.
    h.onTarget('a', 6, 3, 6000);
    expect(h.active(6000)).toBe(true);
    expect(h.target).toEqual({ col: 6, row: 3 });
    expect(HUNTER_TIMEOUT_MS).toBe(5000);
  });

  it('drops target messages above 10/s', () => {
    const h = new HunterLink();
    h.claim('a', 0);
    let last: string = '';
    for (let i = 0; i < 12; i++) last = h.onTarget('a', i, 1, 0);
    expect(last).toBe('dropped');
    // After a second the bucket refills.
    expect(h.onTarget('a', 3, 1, 1100)).toBe('ok');
  });

  it('ignores targets from a non-hunter and honours release', () => {
    const h = new HunterLink();
    h.claim('a', 0);
    expect(h.onTarget('b', 1, 1, 0)).toBe('not-hunter');
    h.release('a');
    expect(h.claimed).toBe(false);
    expect(h.active(0)).toBe(false);
  });
});

describe('hunter ripples reuse the hearing rules', () => {
  it('click in range reveals the same position the AI targets', () => {
    const { l, c, field, px, py } = setup(10); // dist ~8 ≤ 18
    const heard = c.hearClick(l, field, px, py, ev);
    expect(heard).not.toBeNull();
    expect(c.state).toBe('investigate'); // AI reacted to the same reveal
  });

  it('click beyond 18 m reveals nothing', () => {
    const { l, c, field, px, py } = setup(22); // dist 20 > 18
    expect(c.hearClick(l, field, px, py, ev)).toBeNull();
    expect(c.state).toBe('wander');
  });

  it('footstep ripple follows the per-material range', () => {
    const near = setup(4); // dist ~2 ≤ stone 2.5
    const heard = near.c.hearFootstep(near.l, near.field, 'stone', near.px, near.py, ev);
    expect(heard).not.toBeNull();
    const far = setup(6); // dist 4 > stone 2.5
    expect(far.c.hearFootstep(far.l, far.field, 'stone', far.px, far.py, ev)).toBeNull();
  });

  it('while puppeted the AI does not react but the reveal still emits', () => {
    const { l, c, field, px, py } = setup(10);
    c.puppet = true;
    const heard = c.hearClick(l, field, px, py, ev);
    expect(heard).not.toBeNull();   // ripple for the hunter
    expect(c.state).toBe('wander'); // AI decision-making stays off
  });
});

describe('hunter-driven movement', () => {
  it('driveTo walks the creature toward the target and can still catch', () => {
    const { l, c, px, py } = setup(4);
    let caught = false;
    const ev2 = { ...ev, onCatch: () => { caught = true; } };
    // Hunter targets the player's cell; close flag → hunt speed.
    for (let i = 0; i < 400 && !caught; i++) {
      c.driveTo(l, { col: 2, row: 1 }, 0.05, true, px, py, ev2);
    }
    expect(caught).toBe(true);
    expect(c.state).toBe('caught');
  });
});
