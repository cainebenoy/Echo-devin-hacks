import { castRay } from '../world/grid';
import type { Level } from '../world/level';
import type { WallMaterial } from '../world/materials';
import type { Engine } from './engine';
import type { Tuning } from './tuning';

export interface EchoBin {
  /** Bin centre relative angle (rad, relative to heading). */
  rel: number;
  energy: number;
  /** Energy-weighted mean hit distance (metres). */
  dist: number;
  material: WallMaterial;
  /** Amplitude before scheduling. */
  amp: number;
  /** Scheduled delay in seconds. */
  delay: number;
  /** Low-pass cutoff Hz. */
  cutoff: number;
  /** Representative hit point for visualization (energy-weighted centroid). */
  hit: { x: number; y: number };
}

export interface EchoResult {
  bins: EchoBin[];
  /** All non-empty bins, for replay visualization. */
  hitPoints: { x: number; y: number }[];
}

const wrapAngle = (a: number) => {
  a = a % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

/**
 * Cast N rays, compute diffuse return energy, bin by relative angle.
 * Pure math — no audio nodes — so it is fully unit-testable.
 */
export function computeEcho(level: Level, px: number, py: number, heading: number, t: Tuning): EchoResult {
  const N = Math.max(8, Math.round(t.rays));
  const B = Math.max(4, Math.round(t.bins));
  const binWidth = (2 * Math.PI) / B;

  interface Acc {
    energySum: number;
    hits: number;
    weightedDist: number;
    matEnergy: Map<WallMaterial, number>;
    hitX: number;
    hitY: number;
    hitW: number;
  }
  const acc: Acc[] = Array.from({ length: B }, () => ({
    energySum: 0, hits: 0, weightedDist: 0,
    matEnergy: new Map(), hitX: 0, hitY: 0, hitW: 0,
  }));

  for (let i = 0; i < N; i++) {
    const theta = heading + (2 * Math.PI * i) / N;
    const rel = wrapAngle(theta - heading);
    const bin = Math.min(B - 1, Math.round(rel / binWidth) % B);
    const hit = castRay(level, px, py, theta, t.maxDist);
    if (!hit) continue; // miss = silence in that direction
    const d = Math.max(hit.dist, 0.5);
    // φ = angle between ray direction and face normal
    const dx = Math.sin(theta);
    const dy = -Math.cos(theta);
    const cosPhi = Math.abs(dx * hit.normal.x + dy * hit.normal.y);
    const e = (t.materialReflectivity[hit.material] * cosPhi) / (d * d);
    const a = acc[bin];
    a.energySum += e;
    a.hits++;
    a.weightedDist += e * hit.dist;
    a.matEnergy.set(hit.material, (a.matEnergy.get(hit.material) ?? 0) + e);
    a.hitX += hit.x * e;
    a.hitY += hit.y * e;
    a.hitW += e;
  }

  const raysPerBin = N / B;
  const bins: EchoBin[] = [];
  const hitPoints: { x: number; y: number }[] = [];
  for (let b = 0; b < B; b++) {
    const a = acc[b];
    if (a.hits === 0) continue;
    const eBin = a.energySum / raysPerBin;
    const dBin = a.weightedDist / a.energySum;
    let mBin: WallMaterial = 'stone';
    let mE = -1;
    for (const [m, e] of a.matEnergy) {
      if (e > mE) { mE = e; mBin = m; }
    }
    // Amplitude additionally scales with ray coverage: a bin only partially
    // filled by returns (doorway edge, gap shoulder) sounds proportionally
    // dimmer, which makes openings read as a wider silent notch.
    const coverage = a.hits / raysPerBin;
    let amp = Math.min(1, t.echoGain * Math.sqrt(eBin) * coverage);
    if (dBin < t.nearWallDist) amp = Math.min(1, amp * t.nearWallBoost);
    const delay = ((2 * dBin) / 343) * t.echoTimeScale;
    const cutoff = Math.min(t.materialCutoff[mBin], 16000 / (1 + dBin / 4));
    const rel = wrapAngle(b * binWidth);
    const hit = { x: a.hitX / a.hitW, y: a.hitY / a.hitW };
    bins.push({ rel, energy: eBin, dist: dBin, material: mBin, amp, delay, cutoff, hit });
    hitPoints.push(hit);
  }
  return { bins, hitPoints };
}

/**
 * Play the dry click plus one delayed, filtered, HRTF-panned voice per bin.
 */
export function playEcho(engine: Engine, clickBuffer: AudioBuffer, echo: EchoResult, t: Tuning): void {
  const ctx = engine.ctx;
  const now = ctx.currentTime;

  // Dry click, centred.
  {
    const src = ctx.createBufferSource();
    src.buffer = clickBuffer;
    const g = ctx.createGain();
    g.gain.value = t.clickGain;
    const pan = engine.centred();
    src.connect(g).connect(pan).connect(engine.sfxBus);
    const send = ctx.createGain();
    send.gain.value = t.reverbAmount;
    src.connect(send).connect(engine.reverbSend);
    engine.track(src);
    src.start(now);
  }

  for (const bin of echo.bins) {
    const src = ctx.createBufferSource();
    src.buffer = clickBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = bin.cutoff;
    const g = ctx.createGain();
    g.gain.value = bin.amp;
    const pan = engine.pannerAt(bin.rel);
    src.connect(lp).connect(g).connect(pan).connect(engine.sfxBus);
    const send = ctx.createGain();
    send.gain.value = t.reverbAmount;
    src.connect(send).connect(engine.reverbSend);
    engine.track(src);
    src.start(now + bin.delay);
  }
}
