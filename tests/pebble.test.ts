import { describe, expect, it } from 'vitest';
import { PEBBLE_COUNT, PEBBLE_RANGE_M, PebblePouch, pebbleLanding } from '../src/game/pebble';
import { Creature, type CreatureEvents } from '../src/game/creature';
import { bfsField, fieldDist } from '../src/world/path';
import { isSolidCell, parseLevel, type LevelDef } from '../src/world/level';
import { hold } from '../src/levels/hold';

const meta = {
  id: 't', name: 't', order: 99, floor: 'stone' as const, playerHeading: 0,
  rt60: 1, clicksEnabled: true, beacon: false, beaconGain: 0,
  narration: { intro: ['x'], win: 'x' },
};

const level = (map: string): LevelDef => ({ meta, map });

const ev: CreatureEvents = { onStateChange: () => {}, onGrowl: () => {}, onCatch: () => {} };

describe('pebble landing', () => {
  it('lands 0.3 m before the first solid hit', () => {
    // Wall face at x=4 → ray travels 2.5 m → lands 2.2 m out.
    const l = parseLevel(level(`#####
#P.E#
#####`));
    const th = pebbleLanding(l, 1.5, 1.5, Math.PI / 2);
    expect(th.wall).toBe('stone');
    expect(th.dist).toBeCloseTo(2.2, 5);
    expect(th.x).toBeCloseTo(3.7, 5);
    expect(th.y).toBeCloseTo(1.5, 5);
  });

  it('lands at max range in open space', () => {
    const l = parseLevel(level(`##########
#P......E#
##########`));
    const th = pebbleLanding(l, 1.5, 1.5, Math.PI / 2);
    expect(th.wall).toBeNull();
    expect(th.dist).toBeCloseTo(PEBBLE_RANGE_M, 5);
    expect(th.x).toBeCloseTo(7.5, 5);
  });

  it('a wall closer than the offset drops it at your feet — never inside solid', () => {
    const l = parseLevel(level(`###
#P#
#.E`));
    const th = pebbleLanding(l, 1.5, 1.5, Math.PI / 2);
    expect(th.wall).toBe('stone');
    expect(th.dist).toBeCloseTo(0.2, 5); // 0.5 m face − 0.3 m
    expect(isSolidCell(l, Math.floor(th.x), Math.floor(th.y))).toBe(false);
  });

  it('picks up the floor material under the landing (water → splash)', () => {
    // Open flight — lands at max range, which is a water cell here.
    const l = parseLevel(level(`#########
#P.....~#
#E......#
#########`));
    const th = pebbleLanding(l, 1.5, 1.5, Math.PI / 2);
    expect(th.floor).toBe('water');
    expect(th.flightSec).toBeCloseTo(th.dist / 8, 5);
  });
});

describe('the creature hears a landing like a click at that point', () => {
  const l = parseLevel(hold);
  const px = l.playerStart.col + 0.5;
  const py = l.playerStart.row + 0.5;
  const th = pebbleLanding(l, px, py, Math.PI / 2); // ~6 m east of spawn
  const landField = bfsField(l, Math.floor(th.x), Math.floor(th.y));

  const aged = (x: number, y: number) => {
    const c = new Creature(() => 0.5);
    c.spawn(l);
    for (let i = 0; i < 70; i++) { c.update(l, 0.1, px, py, ev); c.x = x; c.y = y; }
    return c;
  };

  it('within hunt range it charges the landing — same as a click there', () => {
    const c = aged(9.5, 2.5); // ~1 m path from the (8.5,2.5) landing
    const heard = c.hearClick(l, landField, th.x, th.y, ev);
    expect(heard).not.toBeNull();
    expect(c.state).toBe('hunt');
    // It goes to the landing cell, not the player.
    expect(Math.hypot(c.targetPos!.x - th.x, c.targetPos!.y - th.y)).toBeLessThan(2.5);
  });

  it('out of hunt range it investigates — again identical to a click', () => {
    const c = aged(15.5, 2.5); // ~10 m path — > 7 m, < 18 m
    expect(fieldDist(landField, 15, 2)).toBeGreaterThan(7);
    expect(fieldDist(landField, 15, 2)).toBeLessThanOrEqual(18);
    const heard = c.hearClick(l, landField, th.x, th.y, ev);
    expect(heard).not.toBeNull();
    expect(c.state).toBe('investigate');
  });

  it('beyond 18 m path distance a landing is simply not heard', () => {
    // Straight corridor → exact path distances. Landing at (7.5,1.5);
    // the creature at cell 26 sits 19 m away — outside hearing.click.
    const corridor = parseLevel(level(`##############################
#P..........................E#
##############################`));
    const th2 = pebbleLanding(corridor, 1.5, 1.5, Math.PI / 2);
    const f2 = bfsField(corridor, Math.floor(th2.x), Math.floor(th2.y));
    const c = new Creature(() => 0.5);
    c.spawn(corridor);
    c.x = 26.5; c.y = 1.5;
    expect(fieldDist(f2, 26, 1)).toBeGreaterThan(18);
    const heard = c.hearClick(corridor, f2, th2.x, th2.y, ev);
    expect(heard).toBeNull();
    expect(c.state).toBe('wander');
  });
});

describe('the pouch', () => {
  it('allows three throws; the fourth is a no-op; reset restores', () => {
    const p = new PebblePouch();
    expect(p.take()).toBe(true);
    expect(p.take()).toBe(true);
    expect(p.take()).toBe(true);
    expect(p.left).toBe(0);
    expect(p.take()).toBe(false);
    p.reset();
    expect(p.left).toBe(PEBBLE_COUNT);
    expect(p.take()).toBe(true);
  });
});
