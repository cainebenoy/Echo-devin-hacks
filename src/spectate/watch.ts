import { getLevel } from '../levels';
import { renderMap } from '../replay/render';
import type { Level } from '../world/level';
import { parseLevel } from '../world/level';
import { decodeCustom, customDef, customHash } from '../custom/codec';
import type { Recording } from '../replay/recorder';
import type { CreatureState } from '../game/creature';
import { ResultsScreen } from '../replay/results';
import { SpectateNet, SpectateSub, type SpectateEvent, type SpectateFrame } from './net';
import { boardKey, type BoardRun } from './leaderboard';
import { BoardUI, recordRun } from './boardui';

/**
 * /watch — audience view, or /watch?role=hunter — a second player drives the
 * creature through a fogged map (they see walls, water, the creature and
 * hearing ripples — never the player). V toggles the fog on the projector.
 */
export function startWatchPage(root: HTMLElement): void {
  root.innerHTML = '';
  document.body.className = 'watch';
  const params = new URLSearchParams(location.search);
  const myId = `h${Math.random().toString(36).slice(2, 10)}`;

  if (!SpectateNet.available()) {
    root.innerHTML = `<div class="screen"><div class="watch-form">
      <h1>ECHO — spectator</h1>
      <p>Spectator mode is not configured on this build.</p>
    </div></div>`;
    return;
  }

  const form = document.createElement('div');
  form.className = 'screen';
  form.innerHTML = `<div class="watch-form">
    <h1>ECHO</h1>
    <p>Enter the 4-digit room code shown on the phone.</p>
    <input id="watch-code" inputmode="numeric" maxlength="4" pattern="[0-9]*" autocomplete="off" />
    <button id="watch-join">Watch</button>
    <button id="watch-hunt">Hunt the player</button>
    <p id="watch-err" class="err"></p>
  </div>`;
  root.appendChild(form);

  const stage = document.createElement('div');
  stage.className = 'screen hidden watch-stage';
  stage.innerHTML = `
    <div class="watch-hud">
      <span id="watch-level"></span>
      <span id="watch-timer">0:00</span>
      <span id="watch-clicks">0 clicks</span>
      <span id="watch-role"></span>
      <span class="hint">C creature · V fog · L board · Shift+L clear</span>
    </div>
    <canvas id="watch-canvas"></canvas>`;
  root.appendChild(stage);

  const results = new ResultsScreen(root);
  const sub = new SpectateSub();
  const boardUi = new BoardUI(root);

  let canvas: HTMLCanvasElement;
  let level: Level | null = null;
  let live: SpectateFrame | null = null;
  let clickFx: { x: number; y: number; hits: { x: number; y: number }[]; at: number }[] = [];
  let throwFx: { from: { x: number; y: number }; landing: { x: number; y: number }; at: number }[] = [];
  let ripples: { x: number; y: number; kind: 'click' | 'step'; at: number }[] = [];
  let lastBoardKey: string | null = null;
  let path: { x: number; y: number }[] = [];
  let creaturePath: { x: number; y: number }[] = [];
  let showCreature = true;
  let hunterMode = params.get('role') === 'hunter';
  let hunterAcked = false;
  let fogView = hunterMode; // projectors can toggle it with V
  let runStart = 0;
  let raf = 0;
  let ended = false;
  let lastTargetSent = 0;

  const hudLevel = () => stage.querySelector('#watch-level')!;
  const hudTimer = () => stage.querySelector('#watch-timer')!;
  const hudClicks = () => stage.querySelector('#watch-clicks')!;
  const hudRole = () => stage.querySelector('#watch-role')!;

  function levelFromCustom(data: string | undefined): Level | null {
    if (!data) return null;
    const p = decodeCustom(data);
    if (!p) return null;
    try { return parseLevel(customDef(p)); } catch { return null; }
  }

  sub.onFrame = (f) => {
    live = f;
    if (!level || level.meta.id !== f.levelId) {
      level = f.levelId === 'custom' ? level : getLevel(f.levelId);
      path = [];
      creaturePath = [];
      clickFx = [];
      ripples = [];
      ended = false;
    }
    if (level && !ended) {
      path.push({ x: f.x, y: f.y });
      if (f.cx !== undefined && f.cy !== undefined) {
        creaturePath.push({ x: f.cx, y: f.cy });
      }
      hudLevel().textContent = f.levelName;
      hudClicks().textContent = `${f.clicks} click${f.clicks === 1 ? '' : 's'}`;
      const s = Math.floor(f.t);
      hudTimer().textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (hunterMode && hunterAcked) {
        hudRole().textContent = f.cstate ? 'hunting — tap the map' : 'no creature on this level';
      }
    }
  };

  sub.onEvent = (e: SpectateEvent) => {
    if (e.type === 'start') {
      level = levelFromCustom(e.custom) ?? (e.levelId ? getLevel(e.levelId) : level);
      path = []; creaturePath = []; clickFx = []; ripples = [];
      runStart = performance.now();
      ended = false;
      results.hide();
      boardUi.hide(); // a new run clears any lingering leaderboard flash
      form.classList.add('hidden');
      stage.classList.remove('hidden');
      hudLevel().textContent = e.levelName ?? '';
      hudRole().textContent = hunterMode ? 'hunting — tap the map' : 'watching';
    } else if (e.type === 'click' && e.x !== undefined && e.y !== undefined) {
      clickFx.push({ x: e.x, y: e.y, hits: e.hits ?? [], at: performance.now() });
      if (clickFx.length > 12) clickFx.shift();
    } else if (e.type === 'throw' && e.fx !== undefined && e.lx !== undefined) {
      throwFx.push({
        from: { x: e.fx, y: e.fy ?? 0 },
        landing: { x: e.lx, y: e.ly ?? 0 },
        at: performance.now(),
      });
      if (throwFx.length > 12) throwFx.shift();
    } else if (e.type === 'end') {
      ended = true;
      const rec = e.recording as Recording | undefined;
      if (rec && level && !hunterMode) {
        stage.classList.add('hidden');
        results.show(rec, level, false);
      }
      if (rec) {
        // Every finished run feeds the projector leaderboard — the
        // operator names it; the blindfolded player never types.
        const key = boardKey({
          levelId: rec.levelId,
          customHash: rec.customHash,
          assist: rec.assist,
        });
        lastBoardKey = key;
        const run: BoardRun = {
          levelId: rec.levelId,
          customHash: rec.customHash,
          outcome: rec.outcome ?? 'caught',
          duration: rec.duration,
          clicks: rec.clicks,
          pebbles: rec.pebbles ?? 0,
          assist: !!rec.assist,
          hunted: !!rec.hunted,
        };
        recordRun(boardUi, key, run);
      }
    }
  };

  // Sounds the creature heard → ripples on the fog view.
  sub.onHear = (h) => {
    ripples.push({ x: h.x, y: h.y, kind: h.kind, at: performance.now() });
    if (ripples.length > 30) ripples.shift();
  };
  // A drawn room broadcast to the room — preview its map even before play.
  sub.onLevelCustom = (data) => {
    const l = levelFromCustom(data);
    if (l) { level = l; live = null; }
  };
  sub.onHunterAck = (a) => {
    if (a.to !== myId) return;
    hunterAcked = a.ok;
    if (!a.ok) {
      hunterMode = false;
      fogView = false;
      hudRole().textContent = 'watching';
      const err = form.querySelector<HTMLElement>('#watch-err');
      if (err) err.textContent = 'A hunter is already connected.';
    } else {
      hudRole().textContent = 'hunting — tap the map';
    }
  };

  async function join(asHunter: boolean): Promise<void> {
    const input = form.querySelector<HTMLInputElement>('#watch-code')!;
    const err = form.querySelector<HTMLElement>('#watch-err')!;
    const code = input.value.trim();
    if (!/^\d{4}$/.test(code)) {
      err.textContent = 'Enter the 4-digit code.';
      return;
    }
    err.textContent = 'Connecting…';
    const ok = await sub.join(code);
    if (!ok) {
      err.textContent = 'Could not reach the spectator service.';
      return;
    }
    hunterMode = asHunter;
    fogView = asHunter;
    if (asHunter) {
      sub.send('hunter', { t: 'claim', id: myId });
      err.textContent = 'Claiming the creature…';
    } else {
      err.textContent = 'Waiting for the player…';
    }
  }

  form.querySelector('#watch-join')!.addEventListener('click', () => void join(false));
  form.querySelector('#watch-hunt')!.addEventListener('click', () => void join(true));
  form.querySelector('#watch-code')!.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void join(hunterMode);
  });
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    // A focused input eats keys — except one inside a hidden screen: the
    // join form stays mounted (and focused) after it hides.
    if (t?.closest?.('input') && !t.closest('.hidden')) return;
    if (e.key === 'c' || e.key === 'C') showCreature = !showCreature;
    if (e.key === 'v' || e.key === 'V') fogView = !fogView;
    // Fall back to the watched level's board — for drawn rooms that means
    // deriving the hash from the map, matching where runs were saved.
    const key = lastBoardKey ?? (level
      ? boardKey({
        levelId: level.meta.id,
        customHash: level.meta.id === 'custom' ? customHash(level.map) : undefined,
      })
      : null);
    if ((e.key === 'l' || e.key === 'L') && e.shiftKey) boardUi.clearCurrent(key);
    else if (e.key === 'l' || e.key === 'L') boardUi.toggle(key);
  });
  window.addEventListener('beforeunload', () => {
    if (hunterAcked) sub.send('hunter', { t: 'release', id: myId });
  });

  // Hunter input: tap/click a cell → target for the creature (max 10/s).
  function onCanvasTap(e: PointerEvent): void {
    if (!hunterMode || !hunterAcked || !level || !live) return;
    const now = performance.now();
    if (now - lastTargetSent < 100) return;
    lastTargetSent = now;
    const rect = canvas.getBoundingClientRect();
    const W = canvas.width;
    const H = canvas.height;
    const pad = 12;
    const scale = Math.min((W - pad * 2) / level.width, (H - pad * 2) / level.height);
    const ox = (W - level.width * scale) / 2;
    const oy = (H - level.height * scale) / 2;
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    const col = Math.floor((px - ox) / scale);
    const row = Math.floor((py - oy) / scale);
    if (col < 0 || row < 0 || col >= level.width || row >= level.height) return;
    sub.send('hunter', { t: 'target', id: myId, col, row });
  }

  function loop(): void {
    canvas = stage.querySelector('#watch-canvas')!;
    canvas.onpointerdown = onCanvasTap;
    if (canvas.width !== stage.clientWidth * devicePixelRatio) {
      canvas.width = stage.clientWidth * devicePixelRatio;
      canvas.height = stage.clientHeight * devicePixelRatio;
      canvas.style.width = `${stage.clientWidth}px`;
      canvas.style.height = `${stage.clientHeight}px`;
    }
    if (level && live) {
      const now = performance.now();
      clickFx = clickFx.filter((c) => now - c.at < 2500);
      throwFx = throwFx.filter((t) => now - t.at < 3000);
      const liveRipples = ripples.filter((r) => now - r.at < 3000);
      ripples = liveRipples;
      const fog = fogView;
      renderMap(canvas, level, {
        player: fog ? null : { x: live.x, y: live.y, heading: live.heading },
        path: fog ? [] : path,
        clicks: fog ? [] : clickFx.map((c) => ({ x: c.x, y: c.y, hits: c.hits, age: (now - c.at) / 1000 })),
        // The hunter's fog shows only the hearing ripple — never the arc,
        // which would reveal the throw as a decoy.
        throws: fog ? [] : throwFx.map((t) => ({
          from: t.from, landing: t.landing, age: (now - t.at) / 1000,
        })),
        creature: live.cx !== undefined && live.cy !== undefined
          ? { x: live.cx, y: live.cy, state: (live.cstate ?? 'wander') as CreatureState }
          : null,
        creaturePath: fog ? [] : creaturePath,
        ripples: liveRipples.map((r) => ({ x: r.x, y: r.y, age: (now - r.at) / 1000, kind: r.kind })),
        showCreature,
      });
    } else if (level) {
      renderMap(canvas, level, {});
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  void runStart;
  void raf;
}
