/**
 * Desktop input — development and the backup demo.
 * Space click, W/S walk, A/D or pointer-lock mouse turn, Q pebble, H hint,
 * Esc pause, backquote toggles the debug map, T toggles the tuning panel.
 */
export interface KeyboardHandlers {
  onClick(): void;
  onHint(): void;
  onPause(): void;
  onDebugToggle(): void;
  onTuningToggle?(): void;
  onSkipSpeech?(): void;
  onToggleVoice?(): void;
  onThrow?(): void;
  /** ArrowLeft/Right — menu level cycling (turning still uses the key set). */
  onArrow?(dir: -1 | 1): void;
}

export class KeyboardInput {
  walkDir = 0;     // +1 forward, −1 back
  turnDir = 0;     // +1 right, −1 left
  turnDelta = 0;   // accumulated mouse-turn degrees since last frame
  private keys = new Set<string>();
  private handlers: KeyboardHandlers;
  private bound: (() => void)[] = [];

  constructor(handlers: KeyboardHandlers) {
    this.handlers = handlers;
  }

  attach(el: HTMLElement): void {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.sync();
      if (e.code === 'Space') { this.handlers.onClick(); e.preventDefault(); }
      else if (e.code === 'KeyH') this.handlers.onHint();
      else if (e.code === 'Escape') this.handlers.onPause();
      else if (e.code === 'Backquote') this.handlers.onDebugToggle();
      else if (e.code === 'KeyT') this.handlers.onTuningToggle?.();
      else if (e.code === 'Enter') this.handlers.onSkipSpeech?.();
      else if (e.code === 'KeyM') this.handlers.onToggleVoice?.();
      else if (e.code === 'KeyQ') this.handlers.onThrow?.();
      else if (e.code === 'ArrowLeft') this.handlers.onArrow?.(-1);
      else if (e.code === 'ArrowRight') this.handlers.onArrow?.(1);
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.sync();
    };
    // A window blur or hidden tab never delivers the keyup — without this,
    // a held W would keep the player walking forever after alt-tab.
    const clearKeys = () => {
      this.keys.clear();
      this.sync();
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement === el) {
        this.turnDelta += e.movementX * 0.15;
      }
    };
    const click = () => {
      // Pointer lock only makes sense while a run is live — locking on the
      // menu/results screens hides the cursor and swallows button clicks.
      // Chrome rejects re-locks for ~1 s after Esc — swallow that rejection.
      if (this.lockWanted && document.pointerLockElement !== el) {
        const p = el.requestPointerLock?.() as Promise<void> | undefined;
        p?.catch?.(() => { /* relock cooldown — next click retries */ });
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    window.addEventListener('mousemove', move);
    el.addEventListener('click', click);
    this.bound.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
      window.removeEventListener('mousemove', move);
      el.removeEventListener('click', click);
    });
  }

  private lockWanted = false;

  /** Turn pointer lock on (playing) or off (menus/results/pause). */
  setPointerLock(want: boolean): void {
    this.lockWanted = want;
    if (!want && document.pointerLockElement) document.exitPointerLock();
  }

  private sync(): void {
    const f = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const b = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const l = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const r = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    this.walkDir = (f ? 1 : 0) - (b ? 1 : 0);
    this.turnDir = (r ? 1 : 0) - (l ? 1 : 0);
  }

  consumeTurnDelta(): number {
    const d = this.turnDelta;
    this.turnDelta = 0;
    return d;
  }

  detach(): void {
    for (const f of this.bound) f();
    this.bound = [];
  }
}
