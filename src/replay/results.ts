import type { Level } from '../world/level';
import type { Recording } from './recorder';
import { renderMap } from './render';

/**
 * Visible results screen — the reveal. Shows stats and a scrub-able Canvas
 * replay with click rings and echo hit lines.
 */
export class ResultsScreen {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private statsEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private scrub: HTMLInputElement;
  private speedBtn: HTMLButtonElement;
  private retryBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private raf = 0;
  private playing = false;
  private playT = 0;
  private speed = 1;
  private rec: Recording | null = null;
  private level: Level | null = null;
  onRetry: (() => void) | null = null;
  onNext: (() => void) | null = null;
  onMenu: (() => void) | null = null;
  onBoard: (() => void) | null = null;
  private lastFrame = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'results';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `
      <div class="results-inner">
        <h1 id="res-outcome"></h1>
        <div class="stats" id="res-stats"></div>
        <canvas id="res-canvas"></canvas>
        <div class="controls">
          <button id="res-play">Play</button>
          <input id="res-scrub" type="range" min="0" max="1000" value="0" />
          <button id="res-speed">1×</button>
        </div>
        <div class="controls">
          <button id="res-retry">Retry</button>
          <button id="res-next">Next level</button>
          <button id="res-board">Leaderboard (L)</button>
          <button id="res-menu">Menu</button>
        </div>
      </div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector('#res-canvas')!;
    this.statsEl = this.el.querySelector('#res-stats')!;
    this.playBtn = this.el.querySelector('#res-play')!;
    this.scrub = this.el.querySelector('#res-scrub')!;
    this.speedBtn = this.el.querySelector('#res-speed')!;
    this.retryBtn = this.el.querySelector('#res-retry')!;
    this.nextBtn = this.el.querySelector('#res-next')!;
    const boardBtn = this.el.querySelector<HTMLButtonElement>('#res-board')!;
    const menuBtn = this.el.querySelector<HTMLButtonElement>('#res-menu')!;

    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.speedBtn.addEventListener('click', () => {
      this.speed = this.speed >= 4 ? 1 : this.speed * 2;
      this.speedBtn.textContent = `${this.speed}×`;
    });
    this.scrub.addEventListener('input', () => {
      if (this.rec) this.playT = (Number(this.scrub.value) / 1000) * this.rec.duration;
      this.draw();
    });
    this.retryBtn.addEventListener('click', () => this.onRetry?.());
    this.nextBtn.addEventListener('click', () => this.onNext?.());
    boardBtn.addEventListener('click', () => this.onBoard?.());
    menuBtn.addEventListener('click', () => this.onMenu?.());
  }

  show(rec: Recording, level: Level, canNext: boolean): void {
    this.rec = rec;
    this.level = level;
    this.el.classList.remove('hidden');
    const outcome = rec.outcome === 'win' ? 'You escaped' : 'It found you';
    const h1 = this.el.querySelector('#res-outcome')!;
    h1.textContent = outcome;
    h1.className = rec.outcome === 'win' ? 'win' : 'caught';
    this.nextBtn.className = 'primary';
    const mins = Math.floor(rec.duration / 60);
    const secs = Math.round(rec.duration % 60);
    const approach = rec.closestApproach === Infinity
      ? '—'
      : `${rec.closestApproach.toFixed(1)} m`;
    this.statsEl.innerHTML = [
      `<div><b>${mins}:${String(secs).padStart(2, '0')}</b><span>time</span></div>`,
      `<div><b>${rec.clicks}</b><span>clicks</span></div>`,
      `<div><b>${rec.bumps}</b><span>bumps</span></div>`,
      `<div><b>${approach}</b><span>closest</span></div>`,
      ...(rec.creature.length > 0
        ? [`<div><b>${rec.pebbles ?? 0}</b><span>pebbles used</span></div>`]
        : []),
      ...(rec.hunted ? [`<div><b>Hunted</b><span>by a person</span></div>`] : []),
    ].join('');
    this.nextBtn.style.display = canNext ? '' : 'none';
    this.playT = 0;
    this.playing = true;
    this.playBtn.textContent = 'Pause';
    this.resize();
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      const dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      if (this.playing && this.rec) {
        this.playT = Math.min(this.rec.duration, this.playT + dt * this.speed);
        if (this.playT >= this.rec.duration) {
          this.playing = false;
          this.playBtn.textContent = 'Play';
        }
        this.scrub.value = String(Math.round((this.playT / Math.max(0.001, this.rec.duration)) * 1000));
      }
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private resize(): void {
    const w = Math.min(window.innerWidth - 24, 560);
    const h = Math.min(window.innerHeight * 0.45, 420);
    this.canvas.width = Math.floor(w * devicePixelRatio);
    this.canvas.height = Math.floor(h * devicePixelRatio);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  togglePlay(): void {
    if (!this.rec) return;
    this.playing = !this.playing;
    if (this.playing && this.playT >= this.rec.duration) this.playT = 0;
    this.playBtn.textContent = this.playing ? 'Pause' : 'Play';
  }

  /** Pause the replay (e.g. while the player is typing their name). */
  pauseReplay(): void {
    this.playing = false;
    this.playBtn.textContent = 'Play';
  }

  /** Restart the replay from t = 0 (e.g. once the leaderboard hides). */
  restartReplay(): void {
    if (!this.rec) return;
    this.playT = 0;
    this.playing = true;
    this.lastFrame = performance.now();
    this.scrub.value = '0';
    this.playBtn.textContent = 'Pause';
  }

  retry(): void {
    this.onRetry?.();
  }

  private draw(): void {
    const rec = this.rec;
    const level = this.level;
    if (!rec || !level) return;
    const t = this.playT;
    const path = rec.positions.filter((p) => p.t <= t).map((p) => ({ x: p.x, y: p.y }));
    const p = rec.positions.filter((s) => s.t <= t).at(-1);
    const clicks = rec.events
      .filter((e) => e.type === 'click' && e.t <= t && e.t > t - 2.5)
      .map((e) => {
        const at = rec.positions.filter((s) => s.t <= e.t).at(-1);
        return { x: at?.x ?? 0, y: at?.y ?? 0, hits: e.hits ?? [], age: t - e.t };
      });
    const cpath = rec.creature.filter((c) => c.t <= t).map((c) => ({ x: c.x, y: c.y }));
    const c = rec.creature.filter((s) => s.t <= t).at(-1) ?? null;
    const throws = rec.events
      .filter((e) => e.type === 'throw' && e.t <= t && e.t > t - 3 && e.from && e.landing)
      .map((e) => ({ from: e.from!, landing: e.landing!, age: t - e.t }));
    renderMap(this.canvas, level, {
      player: p ? { x: p.x, y: p.y, heading: p.heading } : null,
      path,
      clicks,
      throws,
      creature: c ? { x: c.x, y: c.y, state: c.state } : null,
      creaturePath: cpath,
      closestMarker: null,
      showCreature: rec.creature.length > 0,
    });
  }

  hide(): void {
    this.el.classList.add('hidden');
    cancelAnimationFrame(this.raf);
    this.playing = false;
  }
}
