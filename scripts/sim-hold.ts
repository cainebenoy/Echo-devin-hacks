// Trace why the sim bot dies in The Hold: logs catch position/time +
// creature state transitions. Run: npx tsx scripts/sim-hold.ts
import { Creature, type CreatureEvents } from '../src/game/creature';
import { Player } from '../src/game/player';
import { astar, bfsField } from '../src/world/path';
import { parseLevel } from '../src/world/level';
import { hold } from '../src/levels/hold';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (let seed = 1; seed <= 8; seed++) {
  const l = parseLevel(hold);
  const p = new Player(); p.spawn(l);
  const c = new Creature(mulberry32(seed)); c.spawn(l);
  const exit = l.exits[0];
  let out = 'timeout'; let lastState = 'wander'; let transitions = '';
  const ev: CreatureEvents = {
    onStateChange: (s) => { transitions += `${lastState[0]}>${s[0]}@${(t).toFixed(1)} `; lastState = s; },
    onGrowl: () => {},
    onCatch: () => { out = 'caught'; },
  };
  const dt = 1 / 30; let t = 0; let nextClick = 3;
  while (t < 150 && out === 'timeout') {
    t += dt;
    const path = astar(l, { col: Math.floor(p.x), row: Math.floor(p.y) }, exit) ?? [];
    const wp = path.length > 1 ? path[1] : exit;
    const want = Math.atan2(wp.col + 0.5 - p.x, -(wp.row + 0.5 - p.y));
    let diff = want - p.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const maxTurn = (120 * Math.PI / 180) * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const won = p.update(l, dt, 1, turn, 1.1, 0.5, {
      onFootstep: (f) => {
        const fld = bfsField(l, Math.floor(p.x), Math.floor(p.y));
        c.hearFootstep(l, fld, f, p.x, p.y, ev);
      },
      onBump: () => {},
    });
    if (won) { out = 'win'; break; }
    if (t >= nextClick) {
      nextClick = t + 2.5;
      // The bot "hears" its own heartbeat: it only clicks when the creature
      // is beyond ~8 m — the strategy the narration teaches.
      const fld2 = bfsField(l, Math.floor(p.x), Math.floor(p.y));
      if (c.distanceTo(fld2) > 8) c.hearClick(l, fld2, p.x, p.y, ev);
    }
    c.update(l, dt, p.x, p.y, ev);
  }
  console.log(`seed ${seed}: ${out}  t=${t.toFixed(1)}  p=(${p.x.toFixed(1)},${p.y.toFixed(1)}) c=(${c.x.toFixed(1)},${c.y.toFixed(1)})`);
  if (transitions) console.log(`   ${transitions}`);
}
