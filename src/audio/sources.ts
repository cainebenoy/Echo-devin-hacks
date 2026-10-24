import { apparentPosition, bfsField, type BfsField } from '../world/path';
import type { Level } from '../world/level';
import type { Engine } from './engine';

/**
 * A looping positional sound (beacon, creature breathing, drips) whose
 * apparent position/gain/timbre are driven each frame from the sound
 * propagation model — it comes around corners, not through walls.
 */
export class PositionalLoop {
  private src: AudioBufferSourceNode;
  private filter: BiquadFilterNode;
  private gain: GainNode;
  private panner: PannerNode;
  private stereo: StereoPannerNode;
  private ctx: AudioContext;
  baseGain: number;
  /** Set true once started; double-start would throw. */
  started = false;

  constructor(engine: Engine, buffer: AudioBuffer, baseGain: number, bus?: GainNode, private minGain = 0) {
    this.ctx = engine.ctx;
    this.baseGain = baseGain;
    this.src = this.ctx.createBufferSource();
    this.src.buffer = buffer;
    this.src.loop = true;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 12000;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.panner = this.ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1;
    this.panner.rolloffFactor = 0;
    this.stereo = this.ctx.createStereoPanner();
    this.src.connect(this.filter).connect(this.gain).connect(this.panner)
      .connect(this.stereo).connect(bus ?? engine.sfxBus);
  }

  start(when = 0): void {
    if (this.started) return;
    this.started = true;
    this.src.start(this.ctx.currentTime + when);
  }

  stop(): void {
    try { this.src.stop(); } catch { /* not started */ }
    try { this.src.disconnect(); } catch { /* noop */ }
  }

  /**
   * rel = apparent world angle minus player heading (rad).
   * Smooth position, gain and filter changes (τ = 0.08 s).
   * `aim` (0–1) rewards facing the apparent source: an occluded sound opens
   * up instead of staying a dull thud, so "turned the right way" is clearly
   * brighter, not just a touch louder.
   */
  update(rel: number, distance: number, occluded: boolean, extraGain = 1, aim = 0): void {
    const t = this.ctx.currentTime;
    const px = Math.sin(rel);
    const pz = -Math.cos(rel);
    this.panner.positionX.setTargetAtTime(px, t, 0.08);
    this.panner.positionZ.setTargetAtTime(pz, t, 0.08);
    // Exaggerated stereo balance — HRTF alone reads as mush on speakers.
    const pan = Math.max(-0.85, Math.min(0.85, Math.sin(rel) * 1.4));
    this.stereo.pan.setTargetAtTime(pan, t, 0.08);
    // 1/d rolloff with an optional audibility floor — the beacon must stay
    // faintly audible across a long level; breathing (proximity cue) does not.
    const g = Math.max(this.minGain, (this.baseGain * extraGain) / Math.max(1, distance));
    this.gain.gain.setTargetAtTime(g, t, 0.08);
    const freq = occluded ? 1500 + 3500 * aim : 12000;
    this.filter.frequency.setTargetAtTime(freq, t, 0.08);
  }

  setGain(v: number): void {
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }
}

export interface SourceUpdate {
  rel: number;
  distance: number;
  occluded: boolean;
}

/**
 * Resolve where a source at (sx,sy) is heard from for a player at (px,py)
 * facing `heading`. Returns null when the source is unreachable.
 */
export function propagate(
  level: Level,
  field: BfsField,
  px: number,
  py: number,
  heading: number,
  sx: number,
  sy: number,
): SourceUpdate | null {
  const app = apparentPosition(level, field, px, py, sx, sy);
  if (!app) return null;
  const worldAngle = Math.atan2(app.x - px, -(app.y - py));
  let rel = worldAngle - heading;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  return { rel, distance: app.distance, occluded: app.occluded };
}

export { bfsField };
