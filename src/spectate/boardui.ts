import {
  BOARD_SHOW, clearBoard, loadBoard, removeEntry, renameEntry, saveRun, sanitizeName,
  type BoardRun, type StoreLike,
} from './leaderboard';

/**
 * Projector leaderboard UI — the panel (L toggles it), the "Name this
 * player" overlay, and the NEW RECORD banner + sting. Plain DOM so the
 * same pieces work on /watch and over the local results screen.
 */
export class BoardUI {
  private panel: HTMLElement;
  private rows: HTMLElement;
  private keyLabel: HTMLElement;
  private banner: HTMLElement;
  private promptEl: HTMLElement | null = null;
  private hideTimer = 0;
  private bannerTimer = 0;
  private actx: AudioContext | null = null;
  /** The board key currently displayed (for L toggle / Shift+L clear). */
  currentKey: string | null = null;
  visible = false;
  /** Optional hook fired whenever the board hides (e.g. restart replay). */
  onHide: (() => void) | null = null;
  private pending: { key: string; run: BoardRun; onSaved?: (rank: number, record: boolean) => void; onDone?: () => void }[] = [];
  private promptOpen = false;

  get isPromptOpen(): boolean {
    return this.promptOpen;
  }

  constructor(parent: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'board';
    this.panel.className = 'hidden';
    this.panel.innerHTML = `
      <h2>LEADERBOARD <span id="board-key"></span> <button id="board-close" title="Close (L / Esc)">×</button></h2>
      <ol id="board-rows"></ol>
      <p class="board-hint">Auto-hides in 3s · click anywhere outside, L, or Esc to close · click a row to edit · Shift+L clear</p>`;
    parent.appendChild(this.panel);
    this.rows = this.panel.querySelector('#board-rows')!;
    this.keyLabel = this.panel.querySelector('#board-key')!;
    this.panel.querySelector('#board-close')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });
    // Clicking anywhere outside an open board dismisses it AND swallows the
    // pointer event in the capture phase so it never triggers results/gameplay
    // underneath (which previously caused a click to start the next round).
    window.addEventListener('pointerdown', (e) => {
      if (!this.visible || this.promptOpen) return;
      const t = e.target as Node | null;
      if (t && this.panel.contains(t)) return;
      e.stopPropagation();
      e.preventDefault();
      this.hide();
    }, true);
    // Escape also dismisses an open board (when no name prompt owns focus).
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible && !this.promptOpen) {
        e.stopPropagation();
        this.hide();
      }
    });
    this.banner = document.createElement('div');
    this.banner.id = 'record-banner';
    this.banner.className = 'hidden';
    this.banner.textContent = '★ NEW RECORD ★';
    parent.appendChild(this.banner);
    // Row edits — click a row to rename it, click its × to remove it. The
    // operator fixes mis-named or test entries without clearing the board.
    this.rows.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-at]') as HTMLElement | null;
      if (!li || !this.currentKey || this.promptOpen) return;
      const at = Number(li.dataset.at);
      const key = this.currentKey;
      if ((e.target as HTMLElement).closest('.del')) {
        const nm = li.querySelector('.nm')?.textContent ?? 'this entry';
        if (window.confirm(`Remove ${nm} from ${key}?`)) {
          removeEntry(key, at);
          this.show(key);
        }
        return;
      }
      this.askName((raw) => {
        if (raw === null) return;
        renameEntry(key, at, sanitizeName(raw));
        this.show(key);
      }, 'Rename player', key);
    });
  }

  /** Render + show a board; `highlight` marks the just-saved rank. */
  show(key: string, highlight = -1): void {
    this.currentKey = key;
    this.visible = true;
    window.clearTimeout(this.hideTimer);
    const entries = loadBoard(key).slice(0, BOARD_SHOW);
    this.keyLabel.textContent = key.replace('custom:', 'custom·');
    this.rows.innerHTML = entries.length === 0
      ? '<li class="board-empty">No scores yet — finish a run.</li>'
      : entries.map((e, i) => {
        const total = Math.round(e.duration); // rounding secs alone can show 0:60
        const mins = Math.floor(total / 60);
        const secs = total % 60;
        const chips = [
          e.hunted ? '<span class="chip hunted">hunted</span>' : '',
          e.pebbles > 0 ? `<span class="chip">${e.pebbles} pebble${e.pebbles === 1 ? '' : 's'}</span>` : '',
        ].join('');
        return `<li class="${i === highlight ? 'hl' : ''}" data-at="${e.at}" title="Click to rename">
          <span class="rk">${i + 1}</span>
          <span class="nm">${escapeHtml(e.name)}</span>
          <span class="oc ${e.outcome}">${e.outcome === 'win' ? '◈' : '✕'}</span>
          <span class="tm">${mins}:${String(secs).padStart(2, '0')}</span>
          <span class="ck">${e.clicks}c</span>
          ${chips}
          <span class="del" title="Remove entry">×</span>
        </li>`;
      }).join('');
    this.panel.classList.remove('hidden');
  }

  hide(): void {
    const was = this.visible;
    this.visible = false;
    window.clearTimeout(this.hideTimer);
    this.panel.classList.add('hidden');
    if (was) this.onHide?.();
  }

  toggle(key: string | null): void {
    if (this.visible) this.hide();
    else if (key) this.show(key);
  }

  /** After a save: show the board briefly (3.2 s) with the entry highlighted
   * and auto-hide so the replay underneath is unobstructed; on a new #1 fire
   * the sting + banner. Always schedules the auto-hide timer. */
  flash(key: string, rank: number, record: boolean, durationMs = 3200): void {
    this.show(key, rank);
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), durationMs);
    if (record) {
      this.banner.classList.remove('hidden');
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = window.setTimeout(() => this.banner.classList.add('hidden'), 3000);
      this.sting();
    }
  }

  /**
   * Confirm + clear a board (Shift+L). Takes the resolved key — without it
   * a clear pressed before any show() would silently do nothing.
   */
  clearCurrent(key: string | null = this.currentKey): void {
    if (!key) return;
    if (window.confirm(`Clear the leaderboard for ${key}?`)) {
      clearBoard(key);
      this.show(key); // show the emptied board as the confirmation
    }
  }

  /**
   * Feed a finished run — prompts queue behind an open one, so a run ending
   * while the operator is still naming the previous player is never
   * silently discarded (the old code just dropped it).
   */
  feed(
    key: string,
    run: BoardRun,
    onSaved?: (rank: number, record: boolean) => void,
    onDone?: () => void,
  ): void {
    this.pending.push({ key, run, onSaved, onDone });
    this.drainPrompts();
  }

  private drainPrompts(): void {
    if (this.promptOpen) return;
    const next = this.pending.shift();
    if (!next) return;
    this.promptOpen = true;
    this.askName((raw) => {
      this.promptOpen = false;
      if (raw !== null) {
        const { rank, record } = saveRun(next.key, next.run, sanitizeName(raw));
        this.flash(next.key, rank, record);
        next.onSaved?.(rank, record);
      }
      next.onDone?.();
      this.drainPrompts();
    }, 'Name this player', next.key);
  }

  /**
   * "Name this player" overlay — Enter saves (raw text, caller sanitizes),
   * Esc discards. cb(null) means the run is not recorded.
   * When `boardKey` has existing entries, shows clickable player chips so
   * returning players can be picked without retyping (their score updates if
   * the new run is better).
   */
  askName(cb: (name: string | null) => void, title = 'Name this player', boardKey?: string): void {
    this.closePrompt();
    const existing = boardKey ? loadBoard(boardKey) : [];
    const seen = new Set<string>();
    const players = existing.filter((e) => {
      const k = e.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);
    const chipsHtml = players.length === 0 ? '' : `
      <div class="np-prev">
        <span class="np-prev-label">Or pick existing player (updates if faster):</span>
        <div class="np-prev-list">
          ${players.map((e) => {
            const tot = Math.round(e.duration);
            const tm = `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}`;
            return `<button type="button" class="np-chip" data-name="${escapeHtml(e.name)}">${escapeHtml(e.name)} <em>${tm}</em></button>`;
          }).join('')}
        </div>
      </div>`;
    const el = document.createElement('div');
    el.id = 'name-prompt';
    el.innerHTML = `<div class="np-box">
      <p class="np-title">${title} <button class="np-close" title="Skip (Esc)">×</button></p>
      <input id="np-input" maxlength="16" placeholder="Anonymous" autocomplete="off" spellcheck="false" />
      ${chipsHtml}
      <div class="np-btns">
        <button class="np-save">Save</button>
        <button class="np-skip">Skip</button>
      </div>
      <p class="np-hint">Enter saves · Esc or click outside skips</p>
    </div>`;
    const input = el.querySelector<HTMLInputElement>('#np-input')!;
    const save = () => { const v = input.value; this.closePrompt(); cb(v); };
    const skip = () => { this.closePrompt(); cb(null); };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') save();
      else if (e.key === 'Escape') skip();
    });
    el.querySelectorAll<HTMLButtonElement>('.np-chip').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.value = btn.dataset.name ?? '';
        el.querySelectorAll('.np-chip').forEach((b) => b.classList.toggle('sel', b === btn));
        input.focus();
      });
      btn.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        input.value = btn.dataset.name ?? '';
        save();
      });
    });
    el.querySelector('.np-save')!.addEventListener('click', (e) => { e.stopPropagation(); save(); });
    el.querySelector('.np-skip')!.addEventListener('click', (e) => { e.stopPropagation(); skip(); });
    el.querySelector('.np-close')!.addEventListener('click', (e) => { e.stopPropagation(); skip(); });
    // Backdrop click — previously only Enter/Esc dismissed, so a mouse user
    // clicking outside left the modal blocking the page indefinitely.
    el.addEventListener('click', (e) => {
      if (e.target === el) skip();
    });
    this.promptEl = el;
    document.body.appendChild(el);
    input.focus();
  }

  /** Dismiss everything — panel, flash timer, and any open/queued prompts. */
  dismissAll(): void {
    this.hide();
    this.pending.length = 0;
    this.promptOpen = false;
    this.closePrompt();
  }

  private closePrompt(): void {
    this.promptEl?.remove();
    this.promptEl = null;
  }

  /** Record sting — detuned rising ping, built once lazily on the laptop. */
  private sting(): void {
    try {
      this.actx ??= new AudioContext();
      const ctx = this.actx;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      for (const [f, dt] of [[523.25, 0], [784, 0.09], [1046.5, 0.18]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + dt);
        g.gain.linearRampToValueAtTime(0.22, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.5);
        o.connect(g).connect(ctx.destination);
        o.start(t + dt);
        o.stop(t + dt + 0.55);
      }
    } catch { /* audio unavailable — banner still shows */ }
  }
}

/**
 * Feed a finished run into the leaderboard — queued prompt, then save +
 * flash. Used by /watch for phone runs and by the results screen for
 * local laptop runs. Esc discards the run.
 */
export function recordRun(
  ui: BoardUI,
  key: string,
  run: BoardRun,
  onSaved?: (rank: number, record: boolean) => void,
  onDone?: () => void,
): void {
  ui.feed(key, run, onSaved, onDone);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export type { BoardRun, StoreLike };
