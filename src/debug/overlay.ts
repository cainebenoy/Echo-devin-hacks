import type { Level } from '../world/level';
import { renderMap, type RenderState } from '../replay/render';
import type { Engine } from '../audio/engine';

/**
 * Translucent top-down debug map with player, heading, last click's rays and
 * bins, creature + target, live audio stats. `?debug=1` or backquote.
 */
export class DebugOverlay {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private statsEl: HTMLElement;
  visible = false;
  /** Visual/testing mode: larger always-on map for desktop testing. */
  visual = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.className = 'hidden';
    this.el.innerHTML = `<canvas></canvas><div class="dbg-stats"></div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.statsEl = this.el.querySelector('.dbg-stats')!;
  }

  setVisual(v: boolean): void {
    this.visual = v;
    this.el.classList.toggle('visual', v);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  show(v: boolean): void {
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
  }

  render(level: Level | null, state: RenderState, engine: Engine | null, extra: Record<string, string>): void {
    if (!this.visible) return;
    const w = this.visual
      ? Math.min(window.innerWidth - 24, 720)
      : Math.min(window.innerWidth, 480);
    const h = this.visual
      ? Math.min(window.innerHeight * 0.72, 560)
      : Math.min(window.innerHeight * 0.5, 420);
    // Render at device pixels — CSS-size canvas on high-DPI screens blurs.
    const bw = Math.floor(w * devicePixelRatio);
    const bh = Math.floor(h * devicePixelRatio);
    if (this.canvas.width !== bw) {
      this.canvas.width = bw;
      this.canvas.height = bh;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    if (level) renderMap(this.canvas, level, state);
    // Visual mode shows only what the player needs (heard/creature/heading).
    // Engine internals stay in the non-visual debug overlay.
    const lat = engine?.latencyInfo ?? { baseLatency: 0, outputLatency: 0 };
    const stats: [string, string][] = this.visual
      ? Object.entries(extra)
      : [
        ['voices', String(engine?.voiceCount ?? 0)],
        ['latency', `${((lat.baseLatency + lat.outputLatency) * 1000).toFixed(0)}ms`],
        ...Object.entries(extra),
      ];
    if (this.visual) {
      this.statsEl.innerHTML = stats.map(([k, v]) =>
        `<div class="chip${k === 'heard' ? ' heard' : ''}"><span>${k}</span><b>${v}</b></div>`).join('');
    } else {
      this.statsEl.innerHTML = stats.map(([k, v]) => `${k} ${v}`).join('<br>');
    }
  }
}
