import { castRay } from '../world/grid';
import { floorAt, isSolidCell, type Level } from '../world/level';
import type { FloorMaterial, WallMaterial } from '../world/materials';

/**
 * Throw a Pebble — a noise made somewhere else to pull the creature off
 * your path. Three per run; landing is heard exactly like a click at the
 * landing point (the loop reuses `Creature.hearClick`, so the hunter's
 * ripple is identical to a player's click ripple).
 */
export const PEBBLE_COUNT = 3;
export const PEBBLE_RANGE_M = 6;
export const PEBBLE_SPEED = 8;        // m/s — flight time = dist / speed
export const PEBBLE_COOLDOWN_MS = 800;
export const PEBBLE_WALL_OFFSET = 0.3; // comes to rest this far before the face

export interface PebbleThrow {
  x: number;
  y: number;
  /** Metres actually flown (0 when the wall is at your feet). */
  dist: number;
  /** Seconds in the air. */
  flightSec: number;
  /** Wall material it rebounded from, or null when it landed in the open. */
  wall: WallMaterial | null;
  /** Floor material under the landing point. */
  floor: FloorMaterial;
}

/**
 * Where a pebble thrown from (x,y) along `heading` (world rad) comes to
 * rest: the ray flies up to PEBBLE_RANGE_M and lands PEBBLE_WALL_OFFSET
 * before the first solid cell, or at max range in the open. Guaranteed
 * never inside a solid cell — a wall closer than the offset drops it at
 * your feet.
 */
export function pebbleLanding(l: Level, x: number, y: number, heading: number): PebbleThrow {
  const hit = castRay(l, x, y, heading, PEBBLE_RANGE_M);
  let d = hit ? Math.max(0, hit.dist - PEBBLE_WALL_OFFSET) : PEBBLE_RANGE_M;
  const dx = Math.sin(heading);
  const dy = -Math.cos(heading);
  // Paranoia: walk the point back until it sits in a walkable cell.
  while (d > 0 && isSolidCell(l, Math.floor(x + dx * d), Math.floor(y + dy * d))) {
    d = Math.max(0, d - 0.05);
  }
  const lx = x + dx * d;
  const ly = y + dy * d;
  return {
    x: lx,
    y: ly,
    dist: d,
    flightSec: d / PEBBLE_SPEED,
    wall: hit ? hit.material : null,
    floor: floorAt(l, Math.floor(lx), Math.floor(ly)),
  };
}

/** The pouch: 3 per run, reset on retry. The 4th take() is a no-op. */
export class PebblePouch {
  left = PEBBLE_COUNT;
  reset(): void {
    this.left = PEBBLE_COUNT;
  }
  /** True when a pebble was actually thrown. */
  take(): boolean {
    if (this.left <= 0) return false;
    this.left--;
    return true;
  }
}
