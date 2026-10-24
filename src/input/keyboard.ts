/**
 * Desktop input — development and the backup demo.
 * Space click, W/S walk, A/D or pointer-lock mouse turn, H hint, Esc pause,
 * backquote toggles the debug map, T toggles the tuning panel.
 */
export interface KeyboardHandlers {
  onClick(): void;
  onHint(): void;
  onPause(): void;
  onDebugToggle(): void;
  onTuningToggle?(): void;
  onSkipSpeech?(): void;
  onToggleVoice?(): void;
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
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.sync();
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement === el) {
        this.turnDelta += e.movementX * 0.15;
      }
    };
    const click = () => {
      if (document.pointerLockElement !== el) el.requestPointerLock?.();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', move);
    el.addEventListener('click', click);
    this.bound.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', move);
      el.removeEventListener('click', click);
    });
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
