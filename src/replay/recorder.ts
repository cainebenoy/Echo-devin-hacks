import type { CreatureState } from '../game/creature';

export interface PosSample { t: number; x: number; y: number; heading: number; }
export interface CreatureSample { t: number; x: number; y: number; state: CreatureState; }
export interface RunEvent {
  t: number;
  type: 'click' | 'bump' | 'hint' | 'creatureState';
  /** For clicks: this click's echo hit points. */
  hits?: { x: number; y: number }[];
  /** For creatureState: the new state. */
  state?: CreatureState;
}
export type Outcome = 'win' | 'caught';

export interface Recording {
  levelId: string;
  levelName: string;
  positions: PosSample[];
  creature: CreatureSample[];
  events: RunEvent[];
  outcome: Outcome | null;
  duration: number;
  clicks: number;
  bumps: number;
  closestApproach: number; // metres; Infinity when no creature
  /** True when a remote human hunter drove the creature at any point. */
  hunted?: boolean;
}

const SAMPLE_HZ = 10;

export class Recorder {
  data: Recording;
  private nextSample = 0;

  constructor(levelId: string, levelName: string) {
    this.data = {
      levelId,
      levelName,
      positions: [],
      creature: [],
      events: [],
      outcome: null,
      duration: 0,
      clicks: 0,
      bumps: 0,
      closestApproach: Infinity,
    };
    this.nextSample = 0;
  }

  /** Called every frame with the run clock (seconds). */
  tick(t: number, x: number, y: number, heading: number, cx?: number, cy?: number, cstate?: CreatureState): void {
    this.data.duration = t;
    if (cx !== undefined && cy !== undefined && cstate) {
      const d = Math.hypot(cx - x, cy - y);
      if (d < this.data.closestApproach) this.data.closestApproach = d;
    }
    if (t < this.nextSample) return;
    this.nextSample = t + 1 / SAMPLE_HZ;
    this.data.positions.push({ t, x, y, heading });
    if (cx !== undefined && cy !== undefined && cstate) {
      this.data.creature.push({ t, x: cx, y: cy, state: cstate });
    }
  }

  click(t: number, hits: { x: number; y: number }[]): void {
    this.data.clicks++;
    this.data.events.push({ t, type: 'click', hits });
  }

  bump(t: number): void {
    this.data.bumps++;
    this.data.events.push({ t, type: 'bump' });
  }

  hint(t: number): void {
    this.data.events.push({ t, type: 'hint' });
  }

  creatureState(t: number, state: CreatureState): void {
    this.data.events.push({ t, type: 'creatureState', state });
  }

  finish(outcome: Outcome): Recording {
    this.data.outcome = outcome;
    return this.data;
  }
}
