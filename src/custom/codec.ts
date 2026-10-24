import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { parseLevel, type Level, type LevelDef } from '../world/level';
import { bfsField, fieldDist } from '../world/path';
import { MENU } from '../narration/script';

/**
 * Custom ("Draw a room") levels: the editor stores/encodes ONLY the map,
 * name and beacon toggle. All other meta is generated deterministically so
 * a room link stays small and needs no extra form fields.
 */

export interface CustomPayload {
  name: string;
  beacon: boolean;
  map: string;
}

const WORDS_A = [
  'salty', 'quiet', 'brass', 'dusty', 'hollow', 'amber', 'low', 'misty',
  'narrow', 'old',
];
const WORDS_B = [
  'harbour', 'godown', 'jetty', 'cellar', 'hold', 'wharf', 'alley',
  'bunker', 'depot', 'dock',
];

export function randomRoomName(rng: () => number = Math.random): string {
  const a = WORDS_A[Math.floor(rng() * WORDS_A.length)];
  const b = WORDS_B[Math.floor(rng() * WORDS_B.length)];
  return `Custom room — ${a} ${b}`;
}

// ── base64url ────────────────────────────────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64urlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
      + (b === undefined ? '' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)])
      + (c === undefined ? '' : B64[c & 63]);
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = new Uint8Array(Math.floor((t.length * 3) / 4) + 3);
  let j = 0;
  for (let i = 0; i < t.length; i += 4) {
    const c = (k: number) => (i + k < t.length ? B64.indexOf(t[i + k]) : 0);
    const n = (c(0) << 18) | (c(1) << 12) | (c(2) << 6) | c(3);
    bytes[j++] = (n >> 16) & 255;
    if (i + 2 < t.length) bytes[j++] = (n >> 8) & 255;
    if (i + 3 < t.length) bytes[j++] = n & 255;
  }
  return bytes.subarray(0, j);
}

// ── encode/decode ────────────────────────────────────────────────────────
export function encodeCustom(p: CustomPayload): string {
  const json = JSON.stringify({ v: 1, name: p.name, beacon: p.beacon ? 1 : 0, map: p.map });
  return b64urlEncode(deflateSync(strToU8(json), { level: 9 }));
}

/** Never throws — malformed data returns null. */
export function decodeCustom(data: string): CustomPayload | null {
  try {
    const raw = strFromU8(inflateSync(b64urlDecode(data)));
    const o = JSON.parse(raw) as { v?: number; name?: unknown; beacon?: unknown; map?: unknown };
    if (typeof o.map !== 'string' || o.map.length === 0 || o.map.length > 20000) return null;
    if (!/^[#WS.~PEC\n]+$/.test(o.map)) return null;
    return {
      name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 60) : 'Custom room',
      beacon: o.beacon === 1 || o.beacon === true,
      map: o.map,
    };
  } catch {
    return null;
  }
}

// ── generated meta ───────────────────────────────────────────────────────
/** Calm-mode creature speeds for drawn rooms — the creator isn't balancing. */
export const CUSTOM_CREATURE = { wander: 0.5, investigate: 0.8, hunt: 0.95 };

/**
 * Small stable FNV-1a hash of a drawn map. Two namings of the same room
 * share one leaderboard board (`custom:<hash>` keys it).
 */
export function customHash(map: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < map.length; i++) {
    h ^= map.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Deterministic meta from the map alone: rt60 scales with room size and the
 * player starts facing AWAY from the nearest exit so they have to search.
 */
export function customDef(p: CustomPayload): LevelDef {
  // Parse leniently for the metric: count walkable cells without requiring P/E.
  const rows = p.map.split('\n').filter((r) => r.length > 0);
  let walkable = 0;
  for (const r of rows) {
    for (const ch of r) if (ch !== '#' && ch !== 'W' && ch !== 'S') walkable++;
  }
  const rt60 = Math.min(1.8, Math.max(0.8, 0.6 + walkable / 150));

  // Heading away from nearest exit — needs a parse; may throw if no P/E, in
  // which case the caller (validation) reports the problem first.
  const l = parseLevel({ meta: bareMeta(p), map: p.map });
  let heading = 0;
  if (l.exits.length > 0) {
    const px = l.playerStart.col + 0.5;
    const py = l.playerStart.row + 0.5;
    let best = l.exits[0];
    let bestD = Infinity;
    for (const e of l.exits) {
      const d = Math.hypot(e.col + 0.5 - px, e.row + 0.5 - py);
      if (d < bestD) { bestD = d; best = e; }
    }
    const away = Math.atan2(px - (best.col + 0.5), (best.row + 0.5) - py);
    heading = Math.round(((away * 180) / Math.PI + 360) % 360);
  }

  const base = bareMeta(p);
  return {
    meta: {
      ...base,
      rt60,
      playerHeading: heading,
      creature: l.creatureSpawn ? CUSTOM_CREATURE : undefined,
      narration: {
        ...base.narration,
        // Rooms with a creature teach the pebble too.
        intro: l.creatureSpawn
          ? [...base.narration.intro, MENU.pebbleIntro]
          : base.narration.intro,
      },
    },
    map: p.map,
  };
}

function bareMeta(p: CustomPayload) {
  return {
    id: 'custom',
    name: p.name,
    order: 90,
    floor: 'stone' as const,
    playerHeading: 0,
    rt60: 1,
    clicksEnabled: true,
    beacon: p.beacon,
    beaconGain: 0.3,
    narration: {
      intro: ['A room drawn just for you. Find the way out.'],
      win: 'You escaped their room.',
      lose: 'It found you.',
    },
  };
}

// ── validation ───────────────────────────────────────────────────────────
export type CustomStatus =
  | 'ready'
  | 'no-start'
  | 'no-exit'
  | 'exit-unreachable'
  | 'creature-unreachable'
  | 'invalid';

export const STATUS_TEXT: Record<CustomStatus, string> = {
  ready: 'Ready',
  'no-start': 'Place a start',
  'no-exit': 'Place an exit',
  'exit-unreachable': "Exit can't be reached",
  'creature-unreachable': "Creature can't reach the player",
  invalid: 'Invalid room',
};

export function validateCustomMap(map: string): { status: CustomStatus; level: Level | null } {
  const rows = map.split('\n').filter((r) => r.length > 0);
  const flat = rows.join('');
  if (!/^[#WS.~PEC]*$/.test(flat) || rows.length === 0) {
    return { status: 'invalid', level: null };
  }
  if (!flat.includes('P')) return { status: 'no-start', level: null };
  if (!flat.includes('E')) return { status: 'no-exit', level: null };
  let level: Level;
  try {
    level = parseLevel({ meta: bareMeta({ name: 'x', beacon: true, map }), map });
  } catch {
    return { status: 'invalid', level: null };
  }
  const field = bfsField(level, level.playerStart.col, level.playerStart.row);
  const anyExit = level.exits.some((e) => fieldDist(field, e.col, e.row) >= 0);
  if (!anyExit) return { status: 'exit-unreachable', level };
  if (level.creatureSpawn) {
    const d = fieldDist(field, level.creatureSpawn.col, level.creatureSpawn.row);
    if (d < 0) return { status: 'creature-unreachable', level };
  }
  return { status: 'ready', level };
}
