import { astar, fieldDist, type BfsField } from '../world/path';
import type { CellPos, Level } from '../world/level';
import type { FloorMaterial } from '../world/materials';

export type CreatureState = 'wander' | 'investigate' | 'hunt' | 'caught';

export interface CreatureEvents {
  onStateChange(state: CreatureState): void;
  onGrowl(x: number, y: number): void;
  onCatch(): void;
}

/** Hearing thresholds (path distance in metres) per floor surface. */
export const HEARING = {
  click: 18,
  footstep: { stone: 2.5, wood: 3.5, water: 6 } as Record<FloorMaterial, number>,
  huntEnter: 7,
  huntDropSec: 8,
  catchDist: 0.6,
  gracePeriodSec: 6,
};

const pos = (c: CellPos) => ({ x: c.col + 0.5, y: c.row + 0.5 });

/** Box-Muller gaussian. */
function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Creature {
  x = 0;
  y = 0;
  state: CreatureState = 'wander';
  speeds = { wander: 0.6, investigate: 1.0, hunt: 1.35 };
  /** Effective hearing/speed profile — assist mode scales these down. */
  hearing = { ...HEARING, footstep: { ...HEARING.footstep } };
  private path: CellPos[] = [];
  private pathIdx = 0;
  private target: { x: number; y: number } | null = null;
  private huntTimer = 0;
  private age = 0;
  private rng: () => number;
  private repathCooldown = 0;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  /** Calm/assist mode: slower than the player's walk, duller hearing,
   * longer grace, shorter hunts — the run stays tense but winnable. */
  applyAssist(): void {
    this.hearing = {
      click: this.hearing.click * 0.6,
      footstep: {
        stone: HEARING.footstep.stone * 0.6,
        wood: HEARING.footstep.wood * 0.6,
        water: HEARING.footstep.water * 0.6,
      },
      huntEnter: this.hearing.huntEnter * 0.6,
      huntDropSec: 5,
      catchDist: this.hearing.catchDist,
      gracePeriodSec: 10,
    };
    this.speeds = { wander: 0.5, investigate: 0.8, hunt: 0.95 };
  }

  spawn(l: Level): void {
    if (l.creatureSpawn) {
      this.x = l.creatureSpawn.col + 0.5;
      this.y = l.creatureSpawn.row + 0.5;
    }
    if (l.meta.creature) this.speeds = l.meta.creature;
    this.state = 'wander';
    this.path = [];
    this.pathIdx = 0;
    this.target = null;
    this.huntTimer = 0;
    this.age = 0;
  }

  private setState(s: CreatureState, ev: CreatureEvents): void {
    if (this.state === s) return;
    this.state = s;
    ev.onStateChange(s);
    if (s === 'hunt') ev.onGrowl(this.x, this.y);
  }

  /** Current path-distance from the creature to the player, via the field. */
  distanceTo(field: BfsField): number {
    return fieldDist(field, Math.floor(this.x), Math.floor(this.y));
  }

  /** A click was made at the player's position. */
  hearClick(l: Level, field: BfsField, px: number, py: number, ev: CreatureEvents): void {
    const d = this.distanceTo(field);
    if (d < 0 || d > this.hearing.click) return;
    const sigma = 0.12 * d;
    this.target = { x: px + gauss(this.rng) * sigma, y: py + gauss(this.rng) * sigma };
    this.repathNow(l, ev);
    if (d <= this.hearing.huntEnter && this.age > this.hearing.gracePeriodSec) {
      this.setState('hunt', ev);
      this.huntTimer = this.hearing.huntDropSec;
    } else if (this.state === 'wander') {
      this.setState('investigate', ev);
    } else if (this.state === 'hunt') {
      this.huntTimer = this.hearing.huntDropSec;
    }
  }

  /** A footstep on `floor` at the player's position. */
  hearFootstep(l: Level, field: BfsField, floor: FloorMaterial, px: number, py: number, ev: CreatureEvents): void {
    const d = this.distanceTo(field);
    if (d < 0 || d > this.hearing.footstep[floor]) return;
    this.target = { x: px, y: py };
    this.repathNow(l, ev);
    if (d <= this.hearing.huntEnter && this.age > this.hearing.gracePeriodSec) {
      this.setState('hunt', ev);
      this.huntTimer = this.hearing.huntDropSec;
    } else if (this.state === 'wander') {
      this.setState('investigate', ev);
    } else if (this.state === 'hunt') {
      this.huntTimer = this.hearing.huntDropSec;
    }
  }

  private repathNow(l: Level, ev: CreatureEvents): void {
    void ev;
    if (!this.target) return;
    const from = { col: Math.floor(this.x), row: Math.floor(this.y) };
    const to = { col: Math.floor(this.target.x), row: Math.floor(this.target.y) };
    const p = astar(l, from, to) ?? astar(l, from, this.nearestWalkable(l, to));
    this.path = p ?? [];
    this.pathIdx = 0;
  }

  private nearestWalkable(l: Level, c: CellPos): CellPos {
    let best = c;
    let bestD = Infinity;
    for (let r = 0; r < l.height; r++) {
      for (let col = 0; col < l.width; col++) {
        const i = r * l.width + col;
        if (l.walls[i] !== null) continue;
        const d = Math.abs(col - c.col) + Math.abs(r - c.row);
        if (d < bestD) { bestD = d; best = { col, row: r }; }
      }
    }
    return best;
  }

  private pickWanderTarget(l: Level, playerPos: { x: number; y: number }): void {
    // During the grace period, bias wandering away from the player.
    const cells: CellPos[] = [];
    for (let r = 0; r < l.height; r++) {
      for (let c = 0; c < l.width; c++) {
        if (l.walls[r * l.width + c] !== null) continue;
        cells.push({ col: c, row: r });
      }
    }
    if (cells.length === 0) return;
    let pool = cells;
    if (this.age < this.hearing.gracePeriodSec) {
      const away = cells.filter((c) =>
        Math.hypot(c.col + 0.5 - playerPos.x, c.row + 0.5 - playerPos.y) > 4);
      if (away.length > 0) pool = away;
    }
    const t = pool[Math.floor(this.rng() * pool.length)];
    this.target = { x: t.col + 0.5, y: t.row + 0.5 };
    const p = astar(l, { col: Math.floor(this.x), row: Math.floor(this.y) }, t);
    this.path = p ?? [];
    this.pathIdx = 0;
  }

  update(l: Level, dt: number, px: number, py: number, ev: CreatureEvents): void {
    this.age += dt;
    this.repathCooldown = Math.max(0, this.repathCooldown - dt);

    if (this.state === 'hunt') {
      this.huntTimer -= dt;
      if (this.huntTimer <= 0) this.setState('investigate', ev);
      // Keep chasing the latest heard position.
      if (this.target && this.repathCooldown <= 0) {
        this.repathCooldown = 0.5;
        this.repathNow(l, ev);
      }
    }

    if (this.state === 'wander' && (!this.target || this.pathIdx >= this.path.length)) {
      this.pickWanderTarget(l, { x: px, y: py });
    }

    // Follow the current path at the state's speed.
    const speed = this.state === 'hunt' ? this.speeds.hunt
      : this.state === 'investigate' ? this.speeds.investigate
      : this.speeds.wander;
    let remaining = speed * dt;
    while (remaining > 0 && this.pathIdx < this.path.length) {
      const wp = pos(this.path[this.pathIdx]);
      const dx = wp.x - this.x;
      const dy = wp.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) { this.pathIdx++; continue; }
      const step = Math.min(remaining, d);
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      remaining -= step;
      if (step >= d - 1e-9) this.pathIdx++;
    }

    // Reached the end of the chase/investigation path with nothing found →
    // back to wandering instead of standing still ("stuck" bug).
    if ((this.state === 'hunt' || this.state === 'investigate') && this.pathIdx >= this.path.length) {
      this.target = null;
      this.setState('wander', ev);
    }

    // Catch check.
    if (this.state !== 'caught' && Math.hypot(this.x - px, this.y - py) < this.hearing.catchDist) {
      this.setState('caught', ev);
      ev.onCatch();
    }
  }
}
