// Playability audit: A* a path P->E for every level, check it's walkable
// with the real collision radius, and measure beacon apparent gain along it.
import { LEVEL_DEFS } from '../src/levels';
import { parseLevel } from '../src/world/level';
import { astar, bfsField } from '../src/world/path';
import { resolveCircle } from '../src/world/grid';
import { propagate } from '../src/audio/sources';
import { defaultTuning } from '../src/audio/tuning';

for (const def of LEVEL_DEFS) {
  const l = parseLevel(def);
  const path = astar(l, l.playerStart, l.exits[0]);
  const t = defaultTuning();
  const issues: string[] = [];
  if (!path) { console.log(`${l.meta.id}: NO PATH TO EXIT`); continue; }

  // Walk the path: is every waypoint collision-free at r=0.28?
  let blocked = 0;
  for (const c of path) {
    const r = resolveCircle(l, c.col + 0.5, c.row + 0.5, 0.28);
    if (r.hit) blocked++;
  }

  // Beacon audibility along the walk (toward the exit).
  let minG = 1, maxG = 0;
  const field = l.creatureSpawn ? null : null;
  const pfield = bfsField(l, l.playerStart.col, l.playerStart.row); // for propagation calc we need player->exit path each step; approximate with exit field
  const exitField = bfsField(l, l.exits[0].col, l.exits[0].row);
  for (const c of path) {
    const p = propagate(l, exitField, c.col + 0.5, c.row + 0.5, 0,
      l.exits[0].col + 0.5, l.exits[0].row + 0.5);
    if (p) {
      const g = l.meta.beaconGain / Math.max(1, p.distance);
      minG = Math.min(minG, g); maxG = Math.max(maxG, g);
    }
  }
  const dist = Math.hypot(l.exits[0].col - l.playerStart.col, l.exits[0].row - l.playerStart.row);
  if (blocked > 0) issues.push(`${blocked} blocked waypoints`);
  if (l.meta.beacon && maxG < 0.05) issues.push(`beacon too quiet (max ${maxG.toFixed(3)})`);
  console.log(`${l.meta.id.padEnd(8)} path=${path.length}cells blocked=${blocked} ` +
    `beaconGain=${l.meta.beacon} dist≈${dist.toFixed(0)}m apparent=${minG.toFixed(3)}..${maxG.toFixed(3)}` +
    (issues.length ? `  ⚠ ${issues.join('; ')}` : '  ok'));
}
