import type { Engine } from '../audio/engine';

/**
 * speechSynthesis wrapper — best effort, never blocking.
 *
 * - Prefers an English localService voice (works offline); waits up to 1.5 s
 *   for voiceschanged.
 * - Every utterance gets a timeout of 0.5 s + 80 ms/char; onend/onerror or the
 *   timeout (whichever first) un-ducks and advances the queue.
 * - Stall watchdog cancels wedged speech.
 * - If speech is unavailable, falls back to captions + a two-tone earcon.
 */
export class Narrator {
  private queue: string[] = [];
  private speaking = false;
  private voice: SpeechSynthesisVoice | null = null;
  private voiceReady: Promise<void>;
  speechAvailable = true;
  /** When muted, lines are shown as captions with no robot speech. */
  muted = false;
  /** For the debug overlay: which voice (or fallback) is in use. */
  voiceLabel = 'unresolved';
  private engine: Engine | null = null;
  private captionEl: HTMLElement | null = null;
  private earcon: (() => void) | null = null;
  private timer = 0;
  private captionTimer = 0;
  private idleResolve: (() => void) | null = null;
  private stopRequested = false;
  private firstUtterance = true;
  /** Bumped on clear() — a cancelled utterance's late onend/onerror must not
   *  kill the NEXT line's watchdog or un-duck mid-speech. */
  private utteranceGen = 0;

  constructor() {
    try { this.muted = localStorage.getItem('echo.voiceMuted') === '1'; } catch { /* noop */ }
    this.voiceReady = this.resolveVoice();
  }

  setMuted(v: boolean): void {
    this.muted = v;
    try { localStorage.setItem('echo.voiceMuted', v ? '1' : '0'); } catch { /* noop */ }
    if (v) this.clear();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Whether narration is currently playing or queued. */
  get active(): boolean {
    return this.speaking || this.queue.length > 0;
  }

  private resolveVoice(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined') {
        this.speechAvailable = false;
        this.voiceLabel = 'fallback (no speechSynthesis)';
        resolve();
        return;
      }
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
        // Prefer natural/neural voices if present, then localService (offline),
        // then any English voice.
        const score = (v: SpeechSynthesisVoice) => {
          const n = v.name.toLowerCase();
          return (/natural|neural|siri|samantha|aria|jenny|guy|google/.test(n) ? 4 : 0)
            + (v.localService ? 2 : 0);
        };
        en.sort((a, b) => score(b) - score(a));
        this.voice = en[0] ?? voices[0] ?? null;
        this.voiceLabel = this.voice
          ? `${this.voice.name} (${this.voice.lang}${this.voice.localService ? ', local' : ', remote'})`
          : 'fallback (no voices)';
        if (!this.voice) this.speechAvailable = false;
        resolve();
      };
      if (speechSynthesis.getVoices().length > 0) {
        pick();
        return;
      }
      const t = setTimeout(pick, 1500);
      speechSynthesis.onvoiceschanged = () => {
        clearTimeout(t);
        pick();
      };
    });
  }

  wire(engine: Engine, captionEl: HTMLElement, earcon: () => void): void {
    this.engine = engine;
    this.captionEl = captionEl;
    this.earcon = earcon;
  }

  /** Speak a short utterance inside the boot tap to unlock iOS speech. */
  unlock(): void {
    if (!this.speechAvailable || typeof speechSynthesis === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance('Echo.');
      u.volume = 0.01;
      speechSynthesis.speak(u);
    } catch {
      this.speechAvailable = false;
      this.voiceLabel = 'fallback (speak threw)';
    }
  }

  /** Queue lines; spoken in order, never overlapping. */
  say(...lines: string[]): void {
    this.queue.push(...lines);
    void this.pump();
  }

  /** Say something immediately, clearing anything queued first. */
  interrupt(line: string): void {
    // A full clear — clearQueueOnly alone left `speaking` stuck true when the
    // interrupted line was on the caption-fallback path (its timer is the only
    // thing that resets speaking), so all later lines silently never played.
    this.clear();
    this.say(line);
  }

  /** Wait until the queue is empty (or speech is unavailable). */
  async idle(): Promise<void> {
    await this.voiceReady;
    if (!this.speechAvailable) return;
    if (!this.speaking && this.queue.length === 0) return;
    return new Promise((r) => { this.idleResolve = r; });
  }

  clear(): void {
    this.clearQueueOnly();
    this.stopRequested = true;
    this.utteranceGen++; // in-flight utterance callbacks become no-ops
    if (typeof speechSynthesis !== 'undefined') {
      try { speechSynthesis.cancel(); } catch { /* noop */ }
    }
    this.engine?.duck(false);
    this.speaking = false;
    this.hideCaption();
    this.notifyIdle();
  }

  private clearQueueOnly(): void {
    this.queue = [];
    window.clearTimeout(this.timer);
  }

  private notifyIdle(): void {
    const r = this.idleResolve;
    this.idleResolve = null;
    r?.();
  }

  private async pump(): Promise<void> {
    if (this.speaking) return;
    this.stopRequested = false;
    const line = this.queue.shift();
    if (line === undefined) {
      this.engine?.duck(false);
      this.notifyIdle();
      return;
    }
    await this.voiceReady;
    // Another pump() may have started a line while we awaited voiceReady.
    if (this.speaking) {
      this.queue.unshift(line);
      return;
    }
    if (this.muted || !this.speechAvailable || typeof speechSynthesis === 'undefined') {
      // Caption fallback (also used when voice is muted); show briefly.
      this.showCaption(line);
      if (!this.muted) this.earcon?.();
      this.speaking = true;
      this.timer = window.setTimeout(() => {
        this.speaking = false;
        if (this.queue.length === 0) this.hideCaption();
        void this.pump();
      }, Math.min(2200, 600 + line.length * 25));
      return;
    }
    this.showCaption(line);
    this.speaking = true;
    this.engine?.duck(true);
    const u = new SpeechSynthesisUtterance(line);
    if (this.voice) u.voice = this.voice;
    u.rate = 1.25;
    u.lang = this.voice?.lang ?? 'en-US';
    const timeoutMs = 500 + 80 * line.length;
    const gen = this.utteranceGen;
    let done = false;
    let started = false;
    const finish = () => {
      if (done || gen !== this.utteranceGen) return;
      done = true;
      window.clearTimeout(this.timer);
      this.engine?.duck(false);
      this.speaking = false;
      if (this.queue.length === 0) this.hideCaption();
      u.onend = u.onerror = u.onstart = null;
      void this.pump();
    };
    u.onstart = () => { started = true; };
    u.onend = finish;
    u.onerror = finish;
    this.timer = window.setTimeout(() => {
      // Stall watchdog: still "speaking" past the deadline → cancel and move on.
      if (this.stopRequested) { finish(); return; }
      try { speechSynthesis.cancel(); } catch { /* noop */ }
      finish();
    }, timeoutMs);
    try {
      speechSynthesis.speak(u);
      // First utterance that never starts → speech is broken on this device.
      window.setTimeout(() => {
        if (done || started) return;
        if (this.firstUtterance) {
          this.speechAvailable = false;
          this.voiceLabel = 'fallback (no onstart)';
          try { speechSynthesis.cancel(); } catch { /* noop */ }
        }
        if (!speechSynthesis.speaking && !speechSynthesis.pending) finish();
      }, 2000);
      this.firstUtterance = false;
    } catch {
      finish();
    }
  }

  private showCaption(line: string): void {
    window.clearTimeout(this.captionTimer);
    if (this.captionEl) {
      this.captionEl.textContent = line;
      this.captionEl.style.opacity = '1';
    }
  }

  private hideCaption(): void {
    window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => {
      if (this.captionEl) this.captionEl.style.opacity = '0';
    }, 300);
  }
}
