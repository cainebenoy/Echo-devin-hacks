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

/** Compare two entries: < 0 if `a` ranks ahead of `b`. */
export function compareEntries(a: BoardEntry, b: BoardEntry): number {
  if ((a.outcome === 'win') !== (b.outcome === 'win')) return a.outcome === 'win' ? -1 : 1;
  if (a.duration !== b.duration) {
    // Escapes rank fastest-first; caught runs rank LONGEST-first —
    // surviving longer is the achievement, dying fast is not.
    return a.outcome === 'win' ? a.duration - b.duration : b.duration - a.duration;
  }
  if (a.clicks !== b.clicks) return a.clicks - b.clicks;
  return a.at - b.at;
}

/** Ranking: escaped before caught → fastest escape / longest survival → fewer clicks. */
export function rankEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort(compareEntries);
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
 * Save a run under `name` (already sanitized).
 * If a player with the same name (case-insensitive) is already on this board,
 * their entry is updated ONLY when the new run ranks better (escaped > caught,
 * shorter duration, fewer clicks); otherwise their previous best is kept and
 * no duplicate row is added.
 */
export function saveRun(
  key: string,
  run: BoardRun,
  name: string,
  s?: StoreLike,
): { entries: BoardEntry[]; rank: number; record: boolean; improved: boolean } {
  const prev = loadBoard(key, s);
  // `at` is the entry's identity for rename/remove — bump on collisions
  // (two saves can land in the same millisecond).
  let at = Date.now();
  if (prev.some((e) => e.at === at)) at = Math.max(...prev.map((e) => e.at)) + 1;
  const candidate: BoardEntry = {
    name,
    outcome: run.outcome,
    duration: run.duration,
    clicks: run.clicks,
    pebbles: run.pebbles,
    hunted: run.hunted,
    at,
  };
  const norm = name.toLowerCase();
  // 'anonymous' is not a player — every unnamed run gets its own row.
  const existingIdx = norm === 'anonymous'
    ? -1
    : prev.findIndex((e) => e.name.toLowerCase() === norm);
  let merged: BoardEntry[];
  let activeEntry: BoardEntry;
  let improved = true;
  if (existingIdx >= 0) {
    const existing = prev[existingIdx];
    if (compareEntries(candidate, existing) < 0) {
      // New run is better — rewrite the existing player's score.
      merged = prev.map((e, i) => (i === existingIdx ? candidate : e));
      activeEntry = candidate;
    } else {
      // Previous score was better (or tied) — keep it, don't duplicate.
      merged = prev;
      activeEntry = existing;
      improved = false;
    }
  } else {
    merged = [...prev, candidate];
    activeEntry = candidate;
  }
  const all = rankEntries(merged);
  const rank = all.indexOf(activeEntry);
  const capped = all.slice(0, BOARD_TOP);
  const st = store(s);
  if (st) {
    try { st.setItem(PREFIX + key, JSON.stringify(capped)); } catch { /* full/blocked */ }
  }
  return { entries: capped, rank, record: improved && rank === 0, improved };
}

export function clearBoard(key: string, s?: StoreLike): void {
  try { store(s)?.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/**
 * Rename the entry saved at `at` (epoch ms — the entry's identity).
 * If another row already has `name` (case-insensitive), the two rows merge
 * keeping whichever score ranks higher.
 */
export function renameEntry(key: string, at: number, name: string, s?: StoreLike): void {
  const st = store(s);
  if (!st) return;
  const raw = loadBoard(key, s).map((e) => (e.at === at ? { ...e, name } : e));
  const seen = new Map<string, BoardEntry>();
  for (const e of rankEntries(raw)) {
    const k = e.name.toLowerCase();
    // 'anonymous' rows never merge — each is a different unnamed player.
    if (k !== 'anonymous' && !seen.has(k)) seen.set(k, e); // rankEntries puts best first
    else if (k === 'anonymous') seen.set(`anon:${e.at}`, e);
  }
  const deduped = rankEntries([...seen.values()]);
  try { st.setItem(PREFIX + key, JSON.stringify(deduped)); } catch { /* full/blocked */ }
}

/** Remove the entry saved at `at`. */
export function removeEntry(key: string, at: number, s?: StoreLike): void {
  const st = store(s);
  if (!st) return;
  const entries = loadBoard(key, s).filter((e) => e.at !== at);
  try { st.setItem(PREFIX + key, JSON.stringify(entries)); } catch { /* full/blocked */ }
}
