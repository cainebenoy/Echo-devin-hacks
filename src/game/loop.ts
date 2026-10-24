import { computeEcho, playEcho, type EchoResult } from '../audio/echo';
import type { Engine } from '../audio/engine';
import { PositionalLoop, propagate } from '../audio/sources';
import type { SoundSet } from '../audio/synth';
import type { Tuning } from '../audio/tuning';
import { bfsField, fieldDist, type BfsField } from '../world/path';
import { encodeCustom, customHash } from '../custom/codec';
import {
  PEBBLE_COOLDOWN_MS, PebblePouch, pebbleLanding, type PebbleThrow,
} from './pebble';
import type { Level } from '../world/level';
import type { FloorMaterial } from '../world/materials';
import type { GestureEvent } from '../input/gestures';
import type { OrientationTracker } from '../input/orientation';
import type { KeyboardInput } from '../input/keyboard';
import type { StepDetector } from '../input/steps';
import type { Narrator } from '../narration/narrator';
import type { SpectateNet } from '../spectate/net';
import type { DebugOverlay } from '../debug/overlay';
import type { RenderState } from '../replay/render';
import { Creature } from './creature';
import type { HunterLink } from './hunter';
import { Player } from './player';
import { Recorder, type Outcome, type Recording } from '../replay/recorder';
import { MENU } from '../narration/script';

export interface SessionDeps {
  engine: Engine;
  sounds: SoundSet;
  tuning: Tuning;
  narrator: Narrator;
  orientation: OrientationTracker;
  keyboard: KeyboardInput;
  steps: StepDetector;
  net: SpectateNet;
  overlay: DebugOverlay;
  isTouch: boolean;
  /** Calm/assist mode: slower duller creature + louder beacon. */
  assist: boolean;
  /** Shared hunter-mode authority state (claim/target/fallback). */
  hunter: HunterLink;
  onEnd(outcome: Outcome, rec: Recording): void;
}

const DEG = Math.PI / 180;
const PUBLISH_HZ = 15;

export class GameSession {
  level!: Level;
  player = new Player();
  creature: Creature | null = null;
  paused = false;
  private deps: SessionDeps;
  private raf = 0;
  private last = 0;
  private runT = 0;
  private lastClickAt = -Infinity;
  private lastEcho: EchoResult | null = null;
  private beacon: PositionalLoop | null = null;
  private breathing: PositionalLoop | null = null;
  private lastCreatureState: 'wander' | 'investigate' | 'hunt' | 'caught' | null = null;
  private recorder!: Recorder;
  private hintIdx = 0;
  private sensorsFallback = false;
  private fallbackChecked = false;
  private walkGesture = false;
  private stepBudget = 0;
  private nextBeat = 0;
  private nextGrowl = 0;
  private nextDrip = 4;
  private nextPublish = 0;
  private ended = false;
  private dragTurnDeg = 0;
  private pouch = new PebblePouch();
  private lastThrowAt = -Infinity;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  start(level: Level): void {
    this.level = level;
    this.ended = false;
    this.paused = false;
    this.runT = 0;
    this.hintIdx = 0;
    this.lastEcho = null;
    this.sensorsFallback = false;
    this.fallbackChecked = false;
    this.pouch.reset();
    this.lastThrowAt = -Infinity;
    this.player.spawn(level);
    this.deps.engine.setReverb(level.meta.rt60);
    this.recorder = new Recorder(level.meta.id, level.meta.name);

    this.deps.orientation.resetBaseline(level.meta.playerHeading);

    if (level.meta.creature && level.creatureSpawn) {
      this.creature = new Creature();
      this.creature.spawn(level);
      if (this.deps.assist) this.creature.applyAssist();
      this.breathing = new PositionalLoop(this.deps.engine, this.deps.sounds.breathing, 0.8);
      this.breathing.start();
      this.nextDrip = 3 + Math.random() * 4;
    } else {
      this.creature = null;
    }

    if (level.meta.beacon && level.exits.length > 0) {
      this.beacon = new PositionalLoop(
        this.deps.engine, this.deps.sounds.beacon, level.meta.beaconGain, this.deps.engine.ambienceBus,
        // Audibility floor: the beacon is the wayfinding cue, so it stays
        // faintly present even across the longest level.
        level.meta.beaconGain * (this.deps.assist ? 0.25 : 0.15),
      );
      this.beacon.start();
    }

    this.deps.net.event({
      type: 'start', levelId: level.meta.id, levelName: level.meta.name,
      // Drawn rooms carry their encoded form so /watch can rebuild the map.
      custom: level.meta.id === 'custom'
        ? encodeCustom({ name: level.meta.name, beacon: level.meta.beacon, map: level.map })
        : undefined,
    });
    const intro = [...level.meta.narration.intro];
    if (intro.length > 1 && level.meta.creature && this.deps.hunter.claimed) {
      intro[1] = "Something is down here with you. This time, it's a person.";
    }
    this.deps.narrator.say(...intro);

    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    // Marks ended so a pebble still in flight on a discarded session can't
    // land — it would broadcast a phantom ripple/arc on the next run.
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.beacon?.stop();
    this.breathing?.stop();
    this.beacon = this.breathing = null;
  }

  // ── input routed by the app ──────────────────────────────────────────

  handleGesture(e: GestureEvent): void {
    if (this.ended || this.paused) return;
    switch (e.type) {
      case 'tap': this.click(); break;
      case 'walkStart': this.walkGesture = true; break;
      case 'walkEnd': this.walkGesture = false; break;
      case 'longPress': this.hint(); break;
      case 'flick': this.throwPebble(); break;
      case 'drag':
        if (this.sensorsFallback) this.dragTurnDeg += e.dx * 0.4;
        break;
      default: break;
    }
  }

  click(): void {
    if (this.ended || this.paused) return;
    // Any action cuts off queued narration — never wait for speech.
    if (this.deps.narrator.active) this.deps.narrator.clear();
    if (!this.level.meta.clicksEnabled) return;
    const now = performance.now();
    if (now - this.lastClickAt < this.deps.tuning.clickCooldownMs) return;
    this.lastClickAt = now;
    const t = this.deps.tuning;
    const echo = computeEcho(this.level, this.player.x, this.player.y, this.player.heading, t);
    this.lastEcho = echo;
    playEcho(this.deps.engine, this.deps.sounds.click, this.deps.sounds.openAir, echo, t);
    this.recorder.click(this.runT, echo.hitPoints);
    const field = this.currentField();
    if (field && this.creature) {
      const heard = this.creature.hearClick(this.level, field, this.player.x, this.player.y, this.creatureEvents());
      if (heard) this.deps.net.hear({ x: heard.x, y: heard.y, kind: 'click' });
    }
    this.deps.net.event({
      type: 'click', x: this.player.x, y: this.player.y, hits: echo.hitPoints,
    });
  }

  /**
   * Throw a pebble along the current heading — creature levels only. The
   * landing is heard by the creature exactly like a click at that point
   * (same `hearClick`, same hunter ripple), so it pulls attention away
   * from where the player actually is.
   */
  throwPebble(): void {
    if (this.ended || this.paused || !this.creature) return;
    const now = performance.now();
    if (now - this.lastThrowAt < PEBBLE_COOLDOWN_MS) return;
    this.lastThrowAt = now;
    if (this.deps.narrator.active) this.deps.narrator.clear();
    if (!this.pouch.take()) {
      this.playCentred(this.deps.sounds.pebbleEmpty, 0.5);
      return;
    }
    const from = { x: this.player.x, y: this.player.y };
    const th = pebbleLanding(this.level, from.x, from.y, this.player.heading);
    // A wall at your feet has no flight — skip the whoosh entirely.
    if (th.dist > 0.3) this.playWhoosh(th);
    window.setTimeout(() => this.landPebble(th, from), th.flightSec * 1000);
  }

  /** Flight sound — pans toward the landing's apparent direction, fades. */
  private playWhoosh(th: PebbleThrow): void {
    const ctx = this.deps.engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.deps.sounds.whoosh;
    // Stretch the 0.45 s buffer to roughly cover the flight.
    src.playbackRate.value = Math.min(1.4, Math.max(0.5, 0.45 / Math.max(0.2, th.flightSec)));
    let rel = 0;
    const field = this.currentField();
    if (field) {
      const p = propagate(this.level, field,
        this.player.x, this.player.y, this.player.heading, th.x, th.y);
      if (p) rel = p.rel;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.setTargetAtTime(0.02, ctx.currentTime + Math.max(0.05, th.flightSec - 0.1), 0.12);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(0, ctx.currentTime);
    pan.pan.setTargetAtTime(
      Math.max(-0.85, Math.min(0.85, Math.sin(rel) * 1.4)),
      ctx.currentTime + th.flightSec * 0.4,
      th.flightSec * 0.4,
    );
    src.connect(g).connect(pan).connect(this.deps.engine.sfxBus);
    this.deps.engine.track(src);
    src.start();
  }

  /** Landing: material clatter at the point, creature hears a click there. */
  private landPebble(th: PebbleThrow, from: { x: number; y: number }): void {
    if (this.ended) return;
    const s = this.deps.sounds;
    const buf = th.wall === 'stone' ? s.clatterStone
      : th.wall === 'wood' ? s.clatterWood
      : th.wall === 'sacks' ? s.clatterSacks
      : th.floor === 'water' ? s.pebbleSplash
      : th.floor === 'wood' ? s.skitterWood
      : s.skitterStone;
    this.playPositional(buf, th.x, th.y, 0.8);
    // A landing IS a click as far as the creature (and the hunter's
    // ripple) can tell — the whole point of the pebble. The hearing field
    // must be rooted at the LANDING: distance is measured creature→landing,
    // not creature→player.
    let heard: { x: number; y: number } | null = null;
    if (this.creature) {
      const landField = bfsField(this.level, Math.floor(th.x), Math.floor(th.y));
      heard = this.creature.hearClick(this.level, landField, th.x, th.y, this.creatureEvents());
      if (heard) this.deps.net.hear({ x: heard.x, y: heard.y, kind: 'click' });
    }
    this.recorder.throw(this.runT, from, { x: th.x, y: th.y }, heard !== null);
    this.deps.net.event({ type: 'throw', fx: from.x, fy: from.y, lx: th.x, ly: th.y });
    // Count earcon — the pitch drops as the pouch empties (3→2→1→0).
    this.playCentred(this.deps.sounds.pebbleCount, 0.4, 0.7 + 0.15 * this.pouch.left);
  }

  hint(): void {
    if (this.ended || this.paused) return;
    this.recorder.hint(this.runT);
    const hints = this.level.meta.hints;
    if (hints && this.hintIdx < hints.length) {
      this.deps.narrator.say(hints[this.hintIdx++]);
    } else {
      const intro = this.level.meta.narration.intro;
      let line = MENU.objectiveRepeat(intro[intro.length - 1] ?? '');
      if (this.creature) {
        line += ` ${this.pouch.left} ${this.pouch.left === 1 ? 'pebble' : 'pebbles'} left.`;
      }
      this.deps.narrator.say(line);
    }
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.walkGesture = false; // don't keep walking after resume
    else this.last = performance.now();
  }

  private currentField(): BfsField | null {
    if (!this.level) return null;
    return bfsField(this.level, Math.floor(this.player.x), Math.floor(this.player.y));
  }

  private creatureEvents() {
    return {
      onStateChange: (s: 'wander' | 'investigate' | 'hunt' | 'caught') => {
        this.recorder.creatureState(this.runT, s);
        const prev = this.lastCreatureState;
        this.lastCreatureState = s;
        if (!this.creature) return;
        // "It heard something" — a low curious grunt, distinct from the hunt roar.
        if (s === 'investigate' && prev === 'wander') {
          this.playPositional(this.deps.sounds.growl, this.creature.x, this.creature.y, 0.35, 0.7);
        }
        // "It gave up" — a soft exhale tells you the escape window is open.
        if (prev === 'hunt' && (s === 'investigate' || s === 'wander')) {
          this.playPositional(this.deps.sounds.breathing, this.creature.x, this.creature.y, 0.5);
        }
      },
      onGrowl: (x: number, y: number) => {
        this.playPositional(this.deps.sounds.growl, x, y, 1);
      },
      onCatch: () => {
        this.endRun('caught');
      },
    };
  }

  /** One-shot positional sound through the propagation model. */
  private playPositional(buf: AudioBuffer, wx: number, wy: number, baseGain: number, rate = 1): void {
    const field = this.currentField();
    if (!field) return;
    const p = propagate(this.level, field, this.player.x, this.player.y, this.player.heading, wx, wy);
    if (!p) return;
    const ctx = this.deps.engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.occluded ? 1500 : 12000;
    const g = ctx.createGain();
    g.gain.value = baseGain / Math.max(1, p.distance);
    const pan = this.deps.engine.pannerAt(p.rel);
    src.connect(lp).connect(g).connect(pan)
      .connect(this.deps.engine.stereoAt(p.rel)).connect(this.deps.engine.sfxBus);
    this.deps.engine.track(src);
    src.start();
  }

  private playCentred(buf: AudioBuffer, gain: number, rate = 1): void {
    const ctx = this.deps.engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const pan = this.deps.engine.centred();
    src.connect(g).connect(pan).connect(this.deps.engine.sfxBus);
    this.deps.engine.track(src);
    src.start();
  }

  // ── frame ────────────────────────────────────────────────────────────

  private frame(now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.paused || this.ended) return;
    this.runT += dt;

    // Fallback turning kicks in if no orientation data 2 s after start.
    if (!this.fallbackChecked && this.runT > 2) {
      this.fallbackChecked = true;
      if (this.deps.orientation.heading === null || this.deps.orientation.sinceLastSample(now) === Infinity) {
        this.sensorsFallback = true;
        if (this.deps.isTouch) this.deps.narrator.say(MENU.sensorsFallback);
      }
    }
    if (!this.fallbackChecked && this.deps.orientation.heading !== null) {
      this.fallbackChecked = true;
    }

    // Heading: sensors, else keyboard/drag.
    let turnDelta = this.deps.keyboard.turnDir * 120 * DEG * dt
      + this.deps.keyboard.consumeTurnDelta() * DEG
      + this.dragTurnDeg * DEG;
    this.dragTurnDeg = 0;
    const oh = this.deps.orientation.heading;
    // Sensor heading only owns the player on touch devices — a laptop with an
    // orientation sensor must not override A/D turning.
    if (oh !== null && !this.sensorsFallback && this.deps.isTouch) {
      this.player.heading = oh * DEG;
      turnDelta = 0;
    }

    // Walk input: two-finger hold, keys, or walk-in-place budget.
    let moveDir = this.walkGesture ? 1 : this.deps.keyboard.walkDir;
    if (moveDir === 0 && this.stepBudget > 0) moveDir = 1;
    if (moveDir !== 0 && this.deps.narrator.active) this.deps.narrator.clear();
    const px0 = this.player.x;
    const py0 = this.player.y;

    const won = this.player.update(
      this.level, dt, moveDir, turnDelta,
      this.deps.tuning.walkSpeed, this.deps.tuning.waterSpeedMul,
      {
        onFootstep: (f) => this.footstep(f),
        onBump: (d) => this.bump(d),
      },
    );

    if (this.stepBudget > 0) {
      this.stepBudget -= Math.hypot(this.player.x - px0, this.player.y - py0);
      if (this.stepBudget < 0) this.stepBudget = 0;
    }

    const field = this.currentField();

    // Creature: human hunter drives when connected; AI otherwise, resuming
    // silently after 5 s of hunter silence.
    if (this.creature && field) {
      const ev = this.creatureEvents();
      if (this.deps.hunter.active(now)) {
        this.recorder.data.hunted = true;
        const tgt = this.deps.hunter.target;
        const close = tgt !== null && fieldDist(field, tgt.col, tgt.row) <= 7;
        this.creature.driveTo(this.level, tgt, dt, close, this.player.x, this.player.y, ev);
      } else {
        if (this.creature.puppet) this.creature.releasePuppet(ev);
        this.creature.update(this.level, dt, this.player.x, this.player.y, ev);
      }
      // Breathing follows it around corners.
      const p = propagate(this.level, field,
        this.player.x, this.player.y, this.player.heading,
        this.creature.x, this.creature.y);
      if (p) this.breathing?.update(p.rel, p.distance, p.occluded);
      // Heartbeat when path distance < huntEnter, rate + volume scale with
      // closeness; a vibration pulse under 3 m warns without audio.
      const d = this.creature.distanceTo(field);
      const enter = this.creature.hearing.huntEnter;
      if (d >= 0 && d < enter) {
        const bpm = 70 + ((enter - d) / Math.max(1, enter - 1)) * (150 - 70);
        const gain = 0.45 + 0.55 * (1 - d / enter);
        if (this.runT >= this.nextBeat) {
          this.nextBeat = this.runT + 60 / bpm;
          this.playCentred(this.deps.sounds.heartbeat, gain);
          if (d < 3 && this.deps.isTouch) navigator.vibrate?.(40);
        }
      }
      // Directional growl ticks — heartbeat says HOW CLOSE, these say WHICH
      // WAY: positional growls from its real position while it tracks you.
      const st = this.creature.state;
      const growlEvery = st === 'hunt' ? 1.4 : st === 'investigate' ? 3 : 0;
      if (growlEvery > 0 && this.runT >= this.nextGrowl) {
        this.nextGrowl = this.runT + growlEvery;
        this.playPositional(this.deps.sounds.growl,
          this.creature.x, this.creature.y, st === 'hunt' ? 0.55 : 0.35);
      }
      // Ambient drips in the hold.
      if (this.runT >= this.nextDrip) {
        this.nextDrip = this.runT + 4 + Math.random() * 6;
        const dx = this.player.x + (Math.random() * 8 - 4);
        const dy = this.player.y + (Math.random() * 8 - 4);
        this.playPositional(this.deps.sounds.drip, dx, dy, 0.5);
      }
    }

    // Beacon.
    if (this.beacon && field && this.level.exits.length > 0) {
      const e = this.level.exits[0];
      const p = propagate(this.level, field,
        this.player.x, this.player.y, this.player.heading,
        e.col + 0.5, e.row + 0.5);
      // Aiming reward: the wind swells smoothly and — crucially when the
      // sound is arriving around a corner — brightens as you face it. Turn
      // until it's centered AND clearest, then walk. Kills the front/back
      // ambiguity pure panning can't solve.
      if (p) {
        const aim = Math.pow(Math.max(0, Math.cos(p.rel)), 2);
        this.beacon.update(p.rel, p.distance, p.occluded, 1 + 0.9 * aim, aim);
      }
    }

    this.recorder.tick(this.runT, this.player.x, this.player.y, this.player.heading,
      this.creature?.x, this.creature?.y, this.creature?.state);

    // Spectator publish at 15 Hz.
    if (this.runT >= this.nextPublish) {
      this.nextPublish = this.runT + 1 / PUBLISH_HZ;
      this.deps.net.frame({
        t: this.runT,
        x: this.player.x,
        y: this.player.y,
        heading: this.player.heading,
        levelId: this.level.meta.id,
        levelName: this.level.meta.name,
        clicks: this.recorder.data.clicks,
        cx: this.creature?.x,
        cy: this.creature?.y,
        cstate: this.creature?.state,
      });
    }

    this.renderDebug();

    if (won) this.endRun('win');
  }

  private footstep(f: FloorMaterial): void {
    const t = this.deps.sounds;
    const buf = f === 'water'
      ? t.footstepWater[Math.floor(Math.random() * t.footstepWater.length)]
      : f === 'wood'
        ? t.footstepWood[Math.floor(Math.random() * t.footstepWood.length)]
        : t.footstepStone;
    this.playCentred(buf, 0.3 + Math.random() * 0.12);
    const field = this.currentField();
    if (field && this.creature) {
      const heard = this.creature.hearFootstep(this.level, field, f, this.player.x, this.player.y, this.creatureEvents());
      if (heard) this.deps.net.hear({ x: heard.x, y: heard.y, kind: 'step' });
    }
  }

  private bump(hitDir: { x: number; y: number }): void {
    const ctx = this.deps.engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.deps.sounds.bump;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    // Pan toward the wall we hit.
    const worldAngle = Math.atan2(hitDir.x, -hitDir.y);
    const pan = this.deps.engine.pannerAt(worldAngle - this.player.heading);
    src.connect(g).connect(pan).connect(this.deps.engine.sfxBus);
    this.deps.engine.track(src);
    src.start();
    navigator.vibrate?.(35);
    this.recorder.bump(this.runT);
    this.deps.net.event({ type: 'bump' });
  }

  queueStep(): void {
    this.stepBudget += 0.65;
  }

  private renderDebug(): void {
    const state: RenderState = {
      player: { x: this.player.x, y: this.player.y, heading: this.player.heading },
      rays: this.lastEcho?.bins.map((b) => b.hit) ?? null,
      clicks: this.lastEcho ? [{
        x: this.player.x, y: this.player.y, hits: this.lastEcho.hitPoints, age: 0.4,
      }] : [],
      creature: this.creature ? { x: this.creature.x, y: this.creature.y, state: this.creature.state } : null,
      creatureTarget: null,
      showCreature: true,
    };
    // Plain-English description of the last echo — what the player heard.
    let heard = '—';
    if (this.lastEcho) {
      const signed = (r: number) => (r > Math.PI ? r - 2 * Math.PI : r);
      const openAhead = this.lastEcho.openings.find((o) => Math.abs(signed(o.rel)) <= Math.max(0.44, o.span / 2));
      if (openAhead) {
        heard = 'OPENING AHEAD — chime! walk forward (W)';
      } else if (this.lastEcho.bins.length === 0) {
        heard = 'silence (opening)';
      } else {
        const nearest = this.lastEcho.bins.reduce((a, b) => (b.dist < a.dist ? b : a));
        const deg = signed(nearest.rel);
        const dir = Math.abs(deg) < 0.4 ? 'ahead'
          : deg > 0 ? (deg < 2.2 ? 'right' : 'behind')
          : (deg > -2.2 ? 'left' : 'behind');
        const openNote = this.lastEcho.openings.length > 0
          ? ` · gap ${signed(this.lastEcho.openings[0].rel) > 0 ? 'right' : 'left'}`
          : '';
        heard = `${nearest.material} ${nearest.dist.toFixed(1)}m ${dir}${openNote}`;
      }
    }
    this.deps.overlay.render(this.level, state, this.deps.engine, {
      heard,
      ...(this.creature
        ? { creature: `${this.creature.state} ${(f => f && this.creature ? this.creature.distanceTo(f).toFixed(1) + 'm' : '—')(this.currentField())}` }
        : {}),
      heading: `${Math.round(this.player.heading / DEG)}°`,
    });
  }

  private endRun(outcome: Outcome): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    const rec = this.recorder.finish(outcome);
    // Leaderboard fields — boards split calm runs and key drawn rooms by map.
    rec.assist = this.deps.assist;
    if (this.level.meta.id === 'custom') rec.customHash = customHash(this.level.map);
    this.beacon?.stop();
    this.breathing?.stop();
    if (outcome === 'win') {
      this.playCentred(this.deps.sounds.winSting, 0.9);
      this.deps.narrator.say(this.level.meta.narration.win);
    } else {
      this.playCentred(this.deps.sounds.loseSting, 1);
      if (this.level.meta.narration.lose) this.deps.narrator.say(this.level.meta.narration.lose);
    }
    this.deps.net.event({ type: 'end', outcome, recording: rec });
    this.deps.onEnd(outcome, rec);
  }
}
