import { describe, expect, it } from 'vitest';
import {
  BOARD_TOP, boardKey, loadBoard, rankEntries, removeEntry, renameEntry,
  sanitizeName, saveRun,
  type BoardEntry, type BoardRun, type StoreLike,
} from '../src/spectate/leaderboard';

function memStore(): StoreLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const run = (o: Partial<BoardRun> = {}): BoardRun => ({
  levelId: 'hold', outcome: 'win', duration: 60, clicks: 10,
  pebbles: 0, assist: false, hunted: false, ...o,
});

const entry = (o: Partial<BoardEntry>): BoardEntry => ({
  name: 'x', outcome: 'win', duration: 60, clicks: 10, pebbles: 0, hunted: false, at: 0, ...o,
});

describe('ranking', () => {
  it('escaped before caught, then shorter time, then fewer clicks', () => {
    const ranked = rankEntries([
      entry({ name: 'caught-fast', outcome: 'caught', duration: 20 }),
      entry({ name: 'win-slow', outcome: 'win', duration: 90 }),
      entry({ name: 'win-fast', outcome: 'win', duration: 30 }),
    ]);
    expect(ranked.map((e) => e.name)).toEqual(['win-fast', 'win-slow', 'caught-fast']);
  });

  it('ties on time fall to fewer clicks, then arrival order', () => {
    const ranked = rankEntries([
      entry({ name: 'more-clicks', duration: 60, clicks: 20, at: 1 }),
      entry({ name: 'fewer-clicks', duration: 60, clicks: 5, at: 2 }),
      entry({ name: 'same-all-late', duration: 60, clicks: 5, at: 3 }),
    ]);
    expect(ranked.map((e) => e.name)).toEqual(['fewer-clicks', 'same-all-late', 'more-clicks']);
  });
});

describe('board keys', () => {
  it('calm runs never mix with normal runs', () => {
    expect(boardKey({ levelId: 'hold' })).toBe('hold');
    expect(boardKey({ levelId: 'hold', assist: true })).toBe('hold:calm');
    const st = memStore();
    saveRun('hold', run(), 'norm', st);
    saveRun('hold:calm', run({ assist: true }), 'calm', st);
    expect(loadBoard('hold', st).map((e) => e.name)).toEqual(['norm']);
    expect(loadBoard('hold:calm', st).map((e) => e.name)).toEqual(['calm']);
  });

  it('custom rooms key by map hash, not the shared level id', () => {
    expect(boardKey({ levelId: 'custom', customHash: 'ab12' })).toBe('custom:ab12');
    expect(boardKey({ levelId: 'custom', customHash: 'cd34' })).toBe('custom:cd34');
    // Two different maps, same levelId → different boards.
    const st = memStore();
    saveRun('custom:ab12', run({ levelId: 'custom', customHash: 'ab12' }), 'a', st);
    expect(loadBoard('custom:cd34', st)).toHaveLength(0);
  });
});

describe('names', () => {
  it('trims, caps at 16 chars, empty becomes Anonymous', () => {
    expect(sanitizeName('  caine  ')).toBe('caine');
    expect(sanitizeName('a-name-that-is-way-too-long')).toBe('a-name-that-is-w');
    expect(sanitizeName('   ')).toBe('Anonymous');
    expect(sanitizeName('')).toBe('Anonymous');
    expect(sanitizeName('x'.repeat(16))).toBe('x'.repeat(16));
    // Internal whitespace and hyphens survive — only the ends are trimmed.
    expect(sanitizeName('Bob  Smith')).toBe('Bob Smith');
    expect(sanitizeName('Anne-Marie')).toBe('Anne-Marie');
  });
});

describe('storage', () => {
  it('keeps only the top 20 — a new best run pushes the tail off', () => {
    const st = memStore();
    for (let i = 0; i < BOARD_TOP + 5; i++) {
      saveRun('hold', run({ outcome: 'caught', duration: 100 + i }), `c${i}`, st);
    }
    expect(loadBoard('hold', st)).toHaveLength(BOARD_TOP);
    saveRun('hold', run({ outcome: 'win', duration: 5 }), 'champ', st);
    const board = loadBoard('hold', st);
    expect(board).toHaveLength(BOARD_TOP);
    expect(board[0].name).toBe('champ');
    expect(board.some((e) => e.name === `c${BOARD_TOP + 4}`)).toBe(false);
  });

  it('saveRun reports the rank and whether it is a new #1', () => {
    const st = memStore();
    const first = saveRun('hold', run({ duration: 60 }), 'a', st);
    expect(first.rank).toBe(0);
    expect(first.record).toBe(true);
    const slower = saveRun('hold', run({ duration: 90 }), 'b', st);
    expect(slower.rank).toBe(1);
    expect(slower.record).toBe(false);
  });

  it('renameEntry fixes a name without touching the score or rank', () => {
    const st = memStore();
    saveRun('hold', run({ duration: 60 }), 'a', st);
    saveRun('hold', run({ duration: 45 }), 'Anonymous', st);
    const board = loadBoard('hold', st);
    const target = board[0]; // the 45s run ranks first
    expect(target.name).toBe('Anonymous');
    renameEntry('hold', target.at, 'champ', st);
    const after = loadBoard('hold', st);
    expect(after[0].name).toBe('champ');
    expect(after[0].duration).toBe(45);
    expect(after).toHaveLength(2);
  });

  it('removeEntry deletes exactly one entry', () => {
    const st = memStore();
    saveRun('hold', run({ duration: 60 }), 'a', st);
    saveRun('hold', run({ duration: 45 }), 'b', st);
    const board = loadBoard('hold', st);
    removeEntry('hold', board[0].at, st);
    const after = loadBoard('hold', st);
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe('a');
  });
});
