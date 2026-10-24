/**
 * Projector leaderboard — localStorage on the laptop running /watch (or
 * playing locally). No database. Boards are keyed per level; drawn rooms
 * key by map hash; calm runs get their own boards and never mix.
 */
export interface BoardRun {
  levelId: string;
  /** Map hash for drawn rooms — boards key on `custom:<hash>`. */
  customHash?: string;
  outcome: 'win' | 'caught';
  /** Seconds. */
  duration: number;
  clicks: number;
  pebbles: number;
  assist: boolean;
  hunted: boolean;
}

export interface BoardEntry {
  name: string;
  outcome: 'win' | 'caught';
  duration: number;
  clicks: number;
  pebbles: number;
  hunted: boolean;
  /** Epoch ms — final stable tiebreak. */
  at: number;
}

export const BOARD_TOP = 20;   // kept per board
export const BOARD_SHOW = 5;   // rendered per board
export const NAME_MAX = 16;

const PREFIX = 'echo.board.';

export function boardKey(run: { levelId: string; customHash?: string; assist?: boolean }): string {
  const base = run.levelId === 'custom' && run.customHash
    ? `custom:${run.customHash}`
    : run.levelId;
  return run.assist ? `${base}:calm` : base;
}

/** Control chars stripped, whitespace collapsed, trimmed, ≤ 16 chars — empty → "Anonymous". */
export function sanitizeName(raw: string): string {
  const t = raw.replace(/[\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return t || 'Anonymous';
}

/** Ranking: escaped before caught → shorter duration → fewer clicks. */
export function rankEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => {
    if ((a.outcome === 'win') !== (b.outcome === 'win')) return a.outcome === 'win' ? -1 : 1;
    if (a.duration !== b.duration) return a.duration - b.duration;
    if (a.clicks !== b.clicks) return a.clicks - b.clicks;
    return a.at - b.at;
  });
}

export interface StoreLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function store(s?: StoreLike): StoreLike | null {
  if (s) return s;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadBoard(key: string, s?: StoreLike): BoardEntry[] {
  const st = store(s);
  if (!st) return [];
  try {
    const raw = st.getItem(PREFIX + key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BoardEntry[];
    if (!Array.isArray(arr)) return [];
    return rankEntries(arr.filter((e) => e && typeof e.name === 'string'));
  } catch {
    return [];
  }
}

/**
 * Save a run under `name` (already sanitized). Returns the capped board,
 * the entry's rank (0-based), and whether it is a new #1.
 */
export function saveRun(
  key: string,
  run: BoardRun,
  name: string,
  s?: StoreLike,
): { entries: BoardEntry[]; rank: number; record: boolean } {
  const prev = loadBoard(key, s);
  // `at` is the entry's identity for rename/remove — bump on collisions
  // (two saves can land in the same millisecond).
  let at = Date.now();
  if (prev.some((e) => e.at === at)) at = Math.max(...prev.map((e) => e.at)) + 1;
  const entry: BoardEntry = {
    name,
    outcome: run.outcome,
    duration: run.duration,
    clicks: run.clicks,
    pebbles: run.pebbles,
    hunted: run.hunted,
    at,
  };
  const all = rankEntries([...prev, entry]);
  const rank = all.indexOf(entry);
  const capped = all.slice(0, BOARD_TOP);
  const st = store(s);
  if (st) {
    try { st.setItem(PREFIX + key, JSON.stringify(capped)); } catch { /* full/blocked */ }
  }
  return { entries: capped, rank, record: rank === 0 };
}

export function clearBoard(key: string, s?: StoreLike): void {
  try { store(s)?.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/** Rename the entry saved at `at` (epoch ms — the entry's identity). */
export function renameEntry(key: string, at: number, name: string, s?: StoreLike): void {
  const st = store(s);
  if (!st) return;
  const entries = loadBoard(key, s).map((e) => (e.at === at ? { ...e, name } : e));
  try { st.setItem(PREFIX + key, JSON.stringify(entries)); } catch { /* full/blocked */ }
}

/** Remove the entry saved at `at`. */
export function removeEntry(key: string, at: number, s?: StoreLike): void {
  const st = store(s);
  if (!st) return;
  const entries = loadBoard(key, s).filter((e) => e.at !== at);
  try { st.setItem(PREFIX + key, JSON.stringify(entries)); } catch { /* full/blocked */ }
}
