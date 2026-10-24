import QRCode from 'qrcode';
import {
  decodeCustom, encodeCustom, validateCustomMap,
  STATUS_TEXT, randomRoomName,
} from '../custom/codec';
import { SpectateNet, SpectateSub } from '../spectate/net';

/**
 * /draw — one judge draws a room, another walks it blindfolded.
 * The grid is a plain string[][] of map chars; the outer boundary is always
 * stone (only 'E' may be painted there). Everything else is generated:
 * rt60, spawn heading, narration and creature profile come from the map.
 */

type Tool = '.' | '#' | 'W' | 'S' | '~' | 'P' | 'E' | 'C';
const TOOLS: { ch: Tool; label: string; color: string }[] = [
  { ch: '.', label: 'Floor', color: '#101018' },
  { ch: '#', label: 'Stone', color: '#8d99ae' },
  { ch: 'W', label: 'Wood', color: '#9c6644' },
  { ch: 'S', label: 'Sacks', color: '#b08968' },
  { ch: '~', label: 'Water', color: '#16324a' },
  { ch: 'P', label: 'Start', color: '#f4f1de' },
  { ch: 'E', label: 'Exit', color: '#57cc99' },
  { ch: 'C', label: 'Creature', color: '#e63946' },
];

const MIN_W = 10, MAX_W = 24, MIN_H = 8, MAX_H = 16;
const RECENT_KEY = 'echo.rooms';
const MAX_URL = 2000;

interface RecentRoom { name: string; data: string; at: number }

export function startDrawPage(root: HTMLElement): void {
  root.innerHTML = '';
  document.body.className = 'draw';

  let width = 16;
  let height = 12;
  let cells: string[][] = blankGrid(width, height);
  let tool: Tool = '#';
  let beacon = true;
  let painting = false;
  const undoStack: string[][][] = [];

  function blankGrid(w: number, h: number): string[][] {
    const g: string[][] = [];
    for (let r = 0; r < h; r++) {
      const row: string[] = [];
      for (let c = 0; c < w; c++) {
        row.push(r === 0 || r === h - 1 || c === 0 || c === w - 1 ? '#' : '.');
      }
      g.push(row);
    }
    return g;
  }

  const mapString = () => cells.map((r) => r.join('')).join('\n');

  // ── DOM ──────────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="draw-wrap">
      <h1>Draw a room</h1>
      <p class="draw-sub">Paint a room — someone else walks it blindfolded. The border is always stone; exits go on the edge.</p>
      <div class="draw-top">
        <input id="d-name" maxlength="48" value="" aria-label="room name" />
        <label>W <input id="d-w" type="number" min="${MIN_W}" max="${MAX_W}" value="${width}"></label>
        <label>H <input id="d-h" type="number" min="${MIN_H}" max="${MAX_H}" value="${height}"></label>
        <button id="d-beacon">Beacon: on</button>
      </div>
      <div class="palette" id="d-palette"></div>
      <canvas id="d-canvas"></canvas>
      <div id="d-status" class="draw-status"></div>
      <div class="draw-actions">
        <button id="d-undo">Undo</button>
        <button id="d-clear">Clear</button>
        <button id="d-play" class="primary">Play here</button>
      </div>
      <div class="draw-share">
        <div class="share-row">
          <input id="d-link" readonly aria-label="share link" />
          <button id="d-copy">Copy link</button>
        </div>
        <canvas id="d-qr" width="180" height="180"></canvas>
        <div class="share-row" id="d-sendrow">
          <input id="d-code" inputmode="numeric" maxlength="4" placeholder="room code" aria-label="room code" />
          <button id="d-send">Send to phone</button>
          <span id="d-sendmsg" class="err"></span>
        </div>
      </div>
      <div class="draw-recent" id="d-recentwrap"><h3>Recent rooms</h3><div id="d-recent"></div></div>
      <p class="draw-back"><a href="/">← back to the game</a></p>
    </div>`;

  const canvas = root.querySelector<HTMLCanvasElement>('#d-canvas')!;
  const statusEl = root.querySelector<HTMLElement>('#d-status')!;
  const nameEl = root.querySelector<HTMLInputElement>('#d-name')!;
  const wEl = root.querySelector<HTMLInputElement>('#d-w')!;
  const hEl = root.querySelector<HTMLInputElement>('#d-h')!;
  const beaconBtn = root.querySelector<HTMLButtonElement>('#d-beacon')!;
  const undoBtn = root.querySelector<HTMLButtonElement>('#d-undo')!;
  const clearBtn = root.querySelector<HTMLButtonElement>('#d-clear')!;
  const playBtn = root.querySelector<HTMLButtonElement>('#d-play')!;
  const linkEl = root.querySelector<HTMLInputElement>('#d-link')!;
  const copyBtn = root.querySelector<HTMLButtonElement>('#d-copy')!;
  const qrCanvas = root.querySelector<HTMLCanvasElement>('#d-qr')!;
  const sendRow = root.querySelector<HTMLElement>('#d-sendrow')!;
  const codeEl = root.querySelector<HTMLInputElement>('#d-code')!;
  const sendBtn = root.querySelector<HTMLButtonElement>('#d-send')!;
  const sendMsg = root.querySelector<HTMLElement>('#d-sendmsg')!;
  const recentEl = root.querySelector<HTMLElement>('#d-recent')!;

  nameEl.value = randomRoomName();
  if (!SpectateNet.available()) sendRow.classList.add('hidden');

  // Palette buttons.
  const paletteEl = root.querySelector<HTMLElement>('#d-palette')!;
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.dataset.tool = t.ch;
    b.style.setProperty('--sw', t.color);
    b.className = t.ch === tool ? 'sel' : '';
    b.onclick = () => {
      tool = t.ch;
      paletteEl.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x.dataset.tool === t.ch));
    };
    paletteEl.appendChild(b);
  }

  // ── painting ─────────────────────────────────────────────────────────
  const isBorder = (c: number, r: number) => c === 0 || r === 0 || c === width - 1 || r === height - 1;

  function paint(c: number, r: number): void {
    if (c < 0 || r < 0 || c >= width || r >= height) return;
    if (isBorder(c, r)) {
      // The boundary is always stone; only E may replace it, and erasing an
      // exit restores stone.
      if (tool === 'E' || tool === '.') {
        const next = tool === 'E' ? 'E' : '#';
        if (cells[r][c] === next) return;
        cells[r][c] = next;
      } else {
        return;
      }
    } else {
      if (cells[r][c] === tool) return;
      if (tool === 'P' || tool === 'C') {
        // Single-instance: placing again moves the marker.
        for (const row of cells) {
          for (let i = 0; i < row.length; i++) if (row[i] === tool) row[i] = '.';
        }
      }
      cells[r][c] = tool;
    }
    refresh();
  }

  function cellFromEvent(e: PointerEvent): { c: number; r: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      c: Math.floor(((e.clientX - rect.left) / rect.width) * width),
      r: Math.floor(((e.clientY - rect.top) / rect.height) * height),
    };
  }

  const snapshot = () => undoStack.push(cells.map((r) => [...r]));

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    snapshot();
    painting = true;
    const { c, r } = cellFromEvent(e);
    paint(c, r);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const { c, r } = cellFromEvent(e);
    paint(c, r);
  });
  window.addEventListener('pointerup', () => { painting = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── controls ─────────────────────────────────────────────────────────
  function resize(): void {
    const w = Math.min(MAX_W, Math.max(MIN_W, Number(wEl.value) || MIN_W));
    const h = Math.min(MAX_H, Math.max(MIN_H, Number(hEl.value) || MIN_H));
    if (w === width && h === height) return;
    snapshot();
    const next = blankGrid(w, h);
    for (let r = 1; r < h - 1; r++) {
      for (let c = 1; c < w - 1; c++) {
        next[r][c] = r < height - 1 && c < width - 1 ? (cells[r]?.[c] ?? '.') : '.';
      }
    }
    width = w;
    height = h;
    cells = next;
    refresh();
  }
  wEl.addEventListener('change', resize);
  hEl.addEventListener('change', resize);

  beaconBtn.onclick = () => {
    beacon = !beacon;
    beaconBtn.textContent = `Beacon: ${beacon ? 'on' : 'off'}`;
    refresh();
  };

  undoBtn.onclick = () => {
    const prev = undoStack.pop();
    if (prev) { cells = prev; refresh(); }
  };
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undoBtn.click();
    }
  });

  clearBtn.onclick = () => { snapshot(); cells = blankGrid(width, height); refresh(); };

  playBtn.onclick = () => {
    saveRecent();
    location.href = `/?custom=${encodeCustom(currentPayload())}`;
  };

  copyBtn.onclick = () => {
    linkEl.select();
    void navigator.clipboard?.writeText(linkEl.value).catch(() => { /* clipboard denied */ });
  };

  sendBtn.onclick = async () => {
    const code = codeEl.value.trim();
    if (!/^\d{4}$/.test(code)) { sendMsg.textContent = 'Enter the 4-digit code on the phone.'; return; }
    sendMsg.textContent = 'Connecting…';
    const sub = new SpectateSub();
    const ok = await sub.join(code);
    if (!ok) { sendMsg.textContent = 'Could not reach that room.'; return; }
    sub.send('levelCustom', { data: encodeCustom(currentPayload()) });
    sendMsg.textContent = 'Sent — the phone will offer it at the menu.';
    setTimeout(() => sub.leave(), 800);
  };

  // ── recents ──────────────────────────────────────────────────────────
  function recents(): RecentRoom[] {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentRoom[]; }
    catch { return []; }
  }
  function saveRecent(): void {
    const data = encodeCustom(currentPayload());
    const list = recents().filter((r) => r.data !== data);
    list.unshift({ name: nameEl.value.trim() || 'Custom room', data, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
    renderRecents();
  }
  function renderRecents(): void {
    const list = recents();
    recentEl.innerHTML = '';
    for (const r of list) {
      const b = document.createElement('button');
      b.textContent = r.name;
      b.onclick = () => {
        const p = decodeCustom(r.data);
        if (!p) return;
        loadMap(p.map);
        nameEl.value = p.name;
        beacon = p.beacon;
        beaconBtn.textContent = `Beacon: ${beacon ? 'on' : 'off'}`;
        refresh();
      };
      recentEl.appendChild(b);
    }
  }
  function loadMap(map: string): void {
    const rows = map.split('\n').filter((r) => r.length > 0);
    height = Math.min(MAX_H, Math.max(MIN_H, rows.length));
    width = Math.min(MAX_W, Math.max(MIN_W, rows[0].length));
    wEl.value = String(width);
    hEl.value = String(height);
    const g = blankGrid(width, height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const ch = rows[r]?.[c];
        g[r][c] = ch && '#WS.~PEC'.includes(ch) ? ch : (r === 0 || r === height - 1 || c === 0 || c === width - 1 ? '#' : '.');
      }
    }
    cells = g;
  }

  // ── refresh: validate, draw, update share links ──────────────────────
  const currentPayload = () => ({ name: nameEl.value.trim() || 'Custom room', beacon, map: mapString() });

  let qrTimer = 0;
  function refresh(): void {
    draw();
    const v = validateCustomMap(mapString());
    statusEl.textContent = STATUS_TEXT[v.status];
    statusEl.className = `draw-status ${v.status === 'ready' ? 'ok' : 'bad'}`;
    const ok = v.status === 'ready';
    playBtn.disabled = !ok;
    sendBtn.disabled = !ok;
    clearTimeout(qrTimer);
    qrTimer = window.setTimeout(() => {
      const url = `${location.origin}/?custom=${encodeCustom(currentPayload())}`;
      linkEl.value = url.length > MAX_URL ? '(room too large to share)' : url;
      void QRCode.toCanvas(qrCanvas, url.slice(0, MAX_URL), {
        width: 180, margin: 1,
        color: { dark: '#67e8f9', light: '#05070d' },
      }).catch(() => { /* QR render failure is cosmetic */ });
    }, 250);
  }

  function draw(): void {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || canvas.parentElement!.clientWidth;
    const cssH = Math.min(cssW * (height / width), window.innerHeight * 0.55);
    canvas.width = Math.floor(cssW * devicePixelRatio);
    canvas.height = Math.floor(cssH * devicePixelRatio);
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = canvas.width / width;
    const sy = canvas.height / height;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const ch = cells[r][c];
        const t = TOOLS.find((x) => x.ch === ch);
        ctx.fillStyle = t ? t.color : '#101018';
        ctx.fillRect(c * s, r * sy, s + 0.5, sy + 0.5);
        ctx.strokeStyle = 'rgba(103,232,249,0.08)';
        ctx.strokeRect(c * s, r * sy, s, sy);
        if (ch === 'P' || ch === 'E' || ch === 'C') {
          ctx.fillStyle = '#05070d';
          ctx.font = `bold ${Math.floor(s * 0.55)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ch, c * s + s / 2, r * sy + sy / 2);
        }
      }
    }
  }

  window.addEventListener('resize', draw);
  renderRecents();
  refresh();
}
