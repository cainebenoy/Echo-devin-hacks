import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Narrator } from '../src/narration/narrator';
import type { Engine } from '../src/audio/engine';

// Node environment — narrator uses window.setTimeout/clearTimeout, so stub a
// minimal window (after fake timers are installed so the fakes get captured).
function stubWindow(): void {
  (globalThis as { window?: unknown }).window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

function fakeCaption(): HTMLElement {
  return { textContent: '', style: { opacity: '' } } as unknown as HTMLElement;
}
const fakeEngine = { duck: vi.fn() } as unknown as Engine;
const ready = (n: Narrator) => (n as unknown as { voiceReady: Promise<void> }).voiceReady;
/** pump() awaits voiceReady before captioning — flush the microtask queue. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('narrator caption mode (no speechSynthesis)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubWindow();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('interrupt() during a caption line does not wedge the queue', async () => {
    const n = new Narrator();
    await ready(n);
    expect(n.speechAvailable).toBe(false);
    const caption = fakeCaption();
    n.wire(fakeEngine, caption, () => {});

    n.say('first line');
    await flush();
    expect(caption.textContent).toBe('first line');
    // Before the caption timer ends the line, interrupt — the old code left
    // speaking=true forever, so 'second line' never appeared.
    n.interrupt('second line');
    await flush();
    expect(caption.textContent).toBe('second line');
    // Queue drains — the narrator does not stay "speaking" forever.
    await vi.advanceTimersByTimeAsync(5000);
    expect(n.active).toBe(false);
  });

  it('clear() then say() keeps captions flowing', async () => {
    const n = new Narrator();
    await ready(n);
    const caption = fakeCaption();
    n.wire(fakeEngine, caption, () => {});
    n.say('one', 'two');
    await vi.advanceTimersByTimeAsync(3000);
    expect(caption.textContent).toBe('two');
    n.clear();
    n.say('three');
    await flush();
    expect(caption.textContent).toBe('three');
  });
});
