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
  private pending: { key: string; run: BoardRun; onSaved?: (rank: number, record: boolean) => void }[] = [];
  private promptOpen = false;

  constructor(parent: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'board';
    this.panel.className = 'hidden';
    this.panel.innerHTML = `
      <h2>LEADERBOARD <span id="board-key"></span></h2>
      <ol id="board-rows"></ol>
      <p class="board-hint">L board · Shift+L clear · click a row to edit</p>`;
    parent.appendChild(this.panel);
    this.rows = this.panel.querySelector('#board-rows')!;
    this.keyLabel = this.panel.querySelector('#board-key')!;
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
      }, 'Rename player');
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
    this.visible = false;
    window.clearTimeout(this.hideTimer);
    this.panel.classList.add('hidden');
  }

  toggle(key: string | null): void {
    if (this.visible) this.hide();
    else if (key) this.show(key);
  }

  /** After a save: show the board 10 s with the entry highlighted; on a
   * new #1 fire the sting + banner. Returns to the previous visibility. */
  flash(key: string, rank: number, record: boolean): void {
    const wasVisible = this.visible;
    this.show(key, rank);
    if (!wasVisible) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = window.setTimeout(() => this.hide(), 10000);
    }
    if (record) {
      this.banner.classList.remove('hidden');
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = window.setTimeout(() => this.banner.classList.add('hidden'), 3000);
      this.sting();
    }
  }

  /** Confirm + clear the current board (Shift+L). */
  clearCurrent(): void {
    if (!this.currentKey) return;
    if (window.confirm(`Clear the leaderboard for ${this.currentKey}?`)) {
      clearBoard(this.currentKey);
      if (this.visible) this.show(this.currentKey);
    }
  }

  /**
   * Feed a finished run — prompts queue behind an open one, so a run ending
   * while the operator is still naming the previous player is never
   * silently discarded (the old code just dropped it).
   */
  feed(key: string, run: BoardRun, onSaved?: (rank: number, record: boolean) => void): void {
    this.pending.push({ key, run, onSaved });
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
      this.drainPrompts();
    });
  }

  /**
   * "Name this player" overlay — Enter saves (raw text, caller sanitizes),
   * Esc discards. cb(null) means the run is not recorded.
   */
  askName(cb: (name: string | null) => void, title = 'Name this player'): void {
    this.closePrompt();
    const el = document.createElement('div');
    el.id = 'name-prompt';
    el.innerHTML = `<div class="np-box">
      <p class="np-title">${title}</p>
      <input id="np-input" maxlength="16" autocomplete="off" spellcheck="false" />
      <p class="np-hint">Enter saves · Esc discards</p>
    </div>`;
    const input = el.querySelector<HTMLInputElement>('#np-input')!;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = input.value; this.closePrompt(); cb(v); }
      else if (e.key === 'Escape') { this.closePrompt(); cb(null); }
    });
    this.promptEl = el;
    document.body.appendChild(el);
    input.focus();
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
): void {
  ui.feed(key, run, onSaved);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export type { BoardRun, StoreLike };
