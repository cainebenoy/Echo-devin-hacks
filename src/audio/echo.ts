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
  /** Contiguous arcs of empty bins — directions where the click found no
   * return. Each emits one soft "open-air" cue so openings are heard, not
   * just inferred from silence. */
  openings: { rel: number; span: number }[];
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

  // Contiguous runs of empty bins → open arcs (wrap-around aware).
  const openings: { rel: number; span: number }[] = [];
  const empty = acc.map((a) => a.hits === 0);
  if (empty.some(Boolean) && !empty.every(Boolean)) {
    let start = 0;
    while (empty[start]) start++; // start on a covered bin, breaking the seam
    let i = 0;
    while (i < B) {
      const idx = (start + i) % B;
      if (!empty[idx]) { i++; continue; }
      let len = 0;
      while (i < B && empty[(start + i) % B]) { len++; i++; }
      const centreIdx = start + i - len / 2;
      openings.push({ rel: wrapAngle(centreIdx * binWidth), span: len * binWidth });
    }
  }
  return { bins, hitPoints, openings };
}

/**
 * Play the dry click plus one delayed, filtered, HRTF-panned voice per bin.
 */
export function playEcho(engine: Engine, clickBuffer: AudioBuffer, openAir: AudioBuffer, echo: EchoResult, t: Tuning): void {
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

  const signed = (r: number) => (r > Math.PI ? r - 2 * Math.PI : r);

  // Check whether an opening is within the forward cone (±25°).
  const openAhead = echo.openings.find((o) => Math.abs(signed(o.rel)) <= Math.max(0.44, o.span / 2));

  for (const bin of echo.bins) {
    const off = Math.abs(signed(bin.rel));
    // Focus the ear forward: straight-ahead echoes play full, peripheral/rear
    // bins drop to a quiet room-halo so they don't mask what's in front.
    const focus = off < 0.35 ? 1 : off < 0.9 ? 0.35 : 0.12;
    const src = ctx.createBufferSource();
    src.buffer = clickBuffer;
    // Pitch encodes distance for forward returns: close = sharper, far = lower.
    if (off < 0.5) {
      src.playbackRate.value = Math.max(0.65, Math.min(1.45, 1.4 - bin.dist * 0.1));
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = bin.cutoff;
    const g = ctx.createGain();
    g.gain.value = bin.amp * focus * (openAhead ? 0.35 : 1);
    const pan = engine.pannerAt(bin.rel);
    src.connect(lp).connect(g).connect(pan)
      .connect(engine.stereoAt(bin.rel)).connect(engine.sfxBus);
    const send = ctx.createGain();
    send.gain.value = t.reverbAmount * focus;
    src.connect(send).connect(engine.reverbSend);
    engine.track(src);
    src.start(now + bin.delay);
  }

  // Opening cue: loud centred chime when pointing at the gap, soft panned hint
  // when the gap is off to the side — so sweeping gives "tick … tick … CHIME".
  for (const op of echo.openings) {
    const off = Math.abs(signed(op.rel));
    const ahead = off <= Math.max(0.44, op.span / 2);
    const src = ctx.createBufferSource();
    src.buffer = openAir;
    src.playbackRate.value = ahead ? 1.0 : 0.78;
    const g = ctx.createGain();
    // Off-axis hint must be audible enough to steer a sweep toward the gap.
    g.gain.value = ahead ? 0.55 : 0.32;
    const pan = ahead ? engine.centred() : engine.pannerAt(op.rel);
    const node = src.connect(g).connect(pan) as AudioNode;
    if (!ahead) node.connect(engine.stereoAt(op.rel)).connect(engine.sfxBus);
    else node.connect(engine.sfxBus);
    engine.track(src);
    src.start(now + (ahead ? 0.09 : 0.05));
  }
}
