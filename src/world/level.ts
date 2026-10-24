import type { FloorMaterial, WallMaterial } from './materials';

export interface CellPos { col: number; row: number; }

export interface LevelMeta {
  id: string;
  name: string;
  order: number;
  floor: 'stone' | 'wood';
  playerHeading: number; // degrees, 0 = north
  rt60: number;
  clicksEnabled: boolean;
  beacon: boolean;
  beaconGain: number;
  creature?: { wander: number; investigate: number; hunt: number };
  narration: { intro: string[]; win: string; lose?: string };
  hints?: string[];
}

export interface LevelDef {
  meta: LevelMeta;
  map: string;
}

export interface Level {
  meta: LevelMeta;
  /** The source ASCII map — kept so drawn rooms can be re-broadcast. */
  map: string;
  width: number;
  height: number;
  /** Solid wall material per cell, or null when walkable/void. Row-major. */
  walls: (WallMaterial | null)[];
  /** Floor material per cell (only meaningful where walls[i] === null). */
  floors: FloorMaterial[];
  playerStart: CellPos;
  exits: CellPos[];
  creatureSpawn: CellPos | null;
}

const idx = (l: { width: number }, col: number, row: number) => row * l.width + col;

export function inBounds(l: { width: number; height: number }, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < l.width && row < l.height;
}

/** Solid for movement/echoes. Out of bounds is NOT solid — it is open void. */
export function wallAt(l: Level, col: number, row: number): WallMaterial | null {
  if (!inBounds(l, col, row)) return null;
  return l.walls[idx(l, col, row)];
}

export function isSolidCell(l: Level, col: number, row: number): boolean {
  return wallAt(l, col, row) !== null;
}

export function walkableCell(l: Level, col: number, row: number): boolean {
  return inBounds(l, col, row) && l.walls[idx(l, col, row)] === null;
}

export function floorAt(l: Level, col: number, row: number): FloorMaterial {
  if (!inBounds(l, col, row)) return l.meta.floor;
  return l.floors[idx(l, col, row)];
}

export function parseLevel(def: LevelDef): Level {
  const rows = def.map.replace(/\r/g, '').split('\n').filter((r) => r.length > 0);
  if (rows.length === 0) throw new Error(`${def.meta.id}: empty map`);
  const width = rows[0].length;
  const walls: (WallMaterial | null)[] = [];
  const floors: FloorMaterial[] = [];
  let playerStart: CellPos | null = null;
  let pCount = 0;
  let creatureSpawn: CellPos | null = null;
  const exits: CellPos[] = [];

  for (let row = 0; row < rows.length; row++) {
    const r = rows[row];
    if (r.length !== width) {
      throw new Error(`${def.meta.id}: row ${row} has length ${r.length}, expected ${width}`);
    }
    for (let col = 0; col < width; col++) {
      const ch = r[col];
      let wall: WallMaterial | null = null;
      let floor: FloorMaterial = def.meta.floor;
      switch (ch) {
        case '#': wall = 'stone'; break;
        case 'W': wall = 'wood'; break;
        case 'S': wall = 'sacks'; break;
        case '.': break;
        case '~': floor = 'water'; break;
        case 'P': playerStart = { col, row }; pCount++; break;
        case 'E': exits.push({ col, row }); break;
        case 'C': creatureSpawn = { col, row }; break;
        default: throw new Error(`${def.meta.id}: unknown char '${ch}' at ${col},${row}`);
      }
      walls.push(wall);
      floors.push(floor);
    }
  }

  if (pCount !== 1 || !playerStart) throw new Error(`${def.meta.id}: expected exactly one 'P', got ${pCount}`);
  if (exits.length === 0) throw new Error(`${def.meta.id}: no exit 'E'`);

  return {
    meta: def.meta,
    map: def.map,
    width,
    height: rows.length,
    walls,
    floors,
    playerStart,
    exits,
    creatureSpawn,
  };
}

export const cellIndex = idx;
