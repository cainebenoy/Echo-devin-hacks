import { WALL_PROPS } from '../world/materials';
import { wallAt, type Level } from '../world/level';
import type { CreatureState } from '../game/creature';

export interface RenderState {
  /** Player position + heading (rad) or null to hide. */
  player?: { x: number; y: number; heading: number } | null;
  /** Path polyline so far. */
  path?: { x: number; y: number }[];
  /** Live/previous clicks: position, hit points, age for ring animation. */
  clicks?: { x: number; y: number; hits: { x: number; y: number }[]; age: number }[];
  creature?: { x: number; y: number; state: CreatureState } | null;
  creaturePath?: { x: number; y: number }[];
  closestMarker?: { x: number; y: number } | null;
  showCreature?: boolean;
  /** Last click ray endpoints (debug overlay). */
  rays?: { x: number; y: number }[] | null;
  /** Creature's current target (debug overlay). */
  creatureTarget?: { x: number; y: number } | null;
  /** Hunter fog view: where the creature heard something (fades ~3 s). */
  ripples?: { x: number; y: number; age: number; kind: 'click' | 'step' }[];
  /** Pebble throws: dashed amber arc + landing ring (fades ~3 s). */
  throws?: { from: { x: number; y: number }; landing: { x: number; y: number }; age: number }[];
}

const STATE_COLORS: Record<CreatureState, string> = {
  wander: '#e07a5f',
  investigate: '#f2a154',
  hunt: '#e63946',
  caught: '#e63946',
};

/** Fit a top-down map of `level` into the canvas and draw `state`. */
export function renderMap(canvas: HTMLCanvasElement, level: Level, state: RenderState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#050507';
  ctx.fillRect(0, 0, W, H);
  const pad = 12;
  const scale = Math.min((W - pad * 2) / level.width, (H - pad * 2) / level.height);
  const ox = (W - level.width * scale) / 2;
  const oy = (H - level.height * scale) / 2;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;

  // Walkable floor + walls by material.
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const w = wallAt(level, c, r);
      const i = r * level.width + c;
      if (w) {
        ctx.fillStyle = WALL_PROPS[w].color;
        ctx.fillRect(X(c), Y(r), scale + 0.5, scale + 0.5);
      } else {
        ctx.fillStyle = level.floors[i] === 'water' ? '#16324a' : '#101018';
        ctx.fillRect(X(c), Y(r), scale + 0.5, scale + 0.5);
      }
    }
  }
  // Exits.
  ctx.fillStyle = '#57cc99';
  for (const e of level.exits) {
    ctx.fillRect(X(e.col), Y(e.row), scale, scale);
  }

  // Creature path (under everything else dynamic).
  if (state.creaturePath && state.creaturePath.length > 1 && state.showCreature !== false) {
    ctx.strokeStyle = 'rgba(230,57,70,0.55)';
    ctx.lineWidth = Math.max(1, scale * 0.12);
    ctx.beginPath();
    ctx.moveTo(X(state.creaturePath[0].x), Y(state.creaturePath[0].y));
    for (const p of state.creaturePath) ctx.lineTo(X(p.x), Y(p.y));
    ctx.stroke();
  }

  // Player path.
  if (state.path && state.path.length > 1) {
    ctx.strokeStyle = '#f4f1de';
    ctx.lineWidth = Math.max(1.5, scale * 0.15);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(X(state.path[0].x), Y(state.path[0].y));
    for (const p of state.path) ctx.lineTo(X(p.x), Y(p.y));
    ctx.stroke();
  }

  // Click rings + echo hit lines.
  if (state.clicks) {
    for (const c of state.clicks) {
      const cx = X(c.x);
      const cy = Y(c.y);
      const fade = Math.max(0, 1 - c.age / 2.2);
      ctx.strokeStyle = `rgba(114,201,255,${0.8 * fade})`;
      ctx.lineWidth = 1.5;
      const r = Math.min(scale * 8, scale * (0.6 + c.age * 6));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(114,201,255,${0.45 * fade})`;
      for (const h of c.hits) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(X(h.x), Y(h.y));
        ctx.stroke();
        ctx.fillStyle = `rgba(114,201,255,${0.9 * fade})`;
        ctx.beginPath();
        ctx.arc(X(h.x), Y(h.y), Math.max(1.5, scale * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Hunter ripples — heard sounds fading over ~3 s.
  if (state.ripples) {
    for (const rp of state.ripples) {
      const a = Math.max(0, 1 - rp.age / 3);
      const rad = scale * (0.5 + rp.age * 1.2) * (rp.kind === 'click' ? 1 : 0.55);
      ctx.strokeStyle = `rgba(242,161,84,${0.7 * a})`;
      ctx.lineWidth = rp.kind === 'click' ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(X(rp.x), Y(rp.y), rad, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Pebble throws — a dashed amber arc hand→landing, ring at the point.
  if (state.throws) {
    for (const t of state.throws) {
      const a = Math.max(0, 1 - t.age / 3);
      const x0 = X(t.from.x);
      const y0 = Y(t.from.y);
      const x1 = X(t.landing.x);
      const y1 = Y(t.landing.y);
      // Arc bulges perpendicular to the throw line so it reads as flight.
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const cxp = (x0 + x1) / 2 - (dy / len) * len * 0.25;
      const cyp = (y0 + y1) / 2 + (dx / len) * len * 0.25;
      ctx.strokeStyle = `rgba(255,180,84,${0.8 * a})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cxp, cyp, x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(255,180,84,${0.9 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x1, y1, Math.max(4, scale * 0.35), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Debug rays.
  if (state.rays && state.player) {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    for (const r of state.rays) {
      ctx.beginPath();
      ctx.moveTo(X(state.player.x), Y(state.player.y));
      ctx.lineTo(X(r.x), Y(r.y));
      ctx.stroke();
    }
  }
  if (state.creatureTarget) {
    ctx.strokeStyle = 'rgba(230,57,70,0.7)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(X(state.creatureTarget.x) - 6, Y(state.creatureTarget.y) - 6, 12, 12);
    ctx.setLineDash([]);
  }

  // Closest-approach marker.
  if (state.closestMarker) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(state.closestMarker.x), Y(state.closestMarker.y), Math.max(6, scale * 0.45), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(state.closestMarker.x) - 8, Y(state.closestMarker.y));
    ctx.lineTo(X(state.closestMarker.x) + 8, Y(state.closestMarker.y));
    ctx.moveTo(X(state.closestMarker.x), Y(state.closestMarker.y) - 8);
    ctx.lineTo(X(state.closestMarker.x), Y(state.closestMarker.y) + 8);
    ctx.stroke();
  }

  // Creature.
  if (state.creature && state.showCreature !== false) {
    const col = STATE_COLORS[state.creature.state];
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(X(state.creature.x), Y(state.creature.y), Math.max(3, scale * 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(state.creature.x), Y(state.creature.y), Math.max(5, scale * 0.5), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Player dot + heading cone.
  if (state.player) {
    const p = state.player;
    const px = X(p.x);
    const py = Y(p.y);
    const h = p.heading;
    ctx.fillStyle = 'rgba(244,241,222,0.25)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, scale * 1.6, h - Math.PI / 2 - 0.5, h - Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, scale * 0.28), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Heading tick.
    ctx.strokeStyle = '#f4f1de';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(h) * scale * 0.7, py - Math.cos(h) * scale * 0.7);
    ctx.stroke();
  }
}
