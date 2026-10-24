// src/world/level.ts
var idx = (l2, col, row) => row * l2.width + col;
function inBounds(l2, col, row) {
  return col >= 0 && row >= 0 && col < l2.width && row < l2.height;
}
function wallAt(l2, col, row) {
  if (!inBounds(l2, col, row)) return null;
  return l2.walls[idx(l2, col, row)];
}
function parseLevel(def) {
  const rows = def.map.replace(/\r/g, "").split("\n").filter((r) => r.length > 0);
  if (rows.length === 0) throw new Error(`${def.meta.id}: empty map`);
  const width = rows[0].length;
  const walls2 = [];
  const floors = [];
  let playerStart = null;
  let pCount = 0;
  let creatureSpawn = null;
  const exits = [];
  for (let row = 0; row < rows.length; row++) {
    const r = rows[row];
    if (r.length !== width) {
      throw new Error(`${def.meta.id}: row ${row} has length ${r.length}, expected ${width}`);
    }
    for (let col = 0; col < width; col++) {
      const ch = r[col];
      let wall = null;
      let floor = def.meta.floor;
      switch (ch) {
        case "#":
          wall = "stone";
          break;
        case "W":
          wall = "wood";
          break;
        case "S":
          wall = "sacks";
          break;
        case ".":
          break;
        case "~":
          floor = "water";
          break;
        case "P":
          playerStart = { col, row };
          pCount++;
          break;
        case "E":
          exits.push({ col, row });
          break;
        case "C":
          creatureSpawn = { col, row };
          break;
        default:
          throw new Error(`${def.meta.id}: unknown char '${ch}' at ${col},${row}`);
      }
      walls2.push(wall);
      floors.push(floor);
    }
  }
  if (pCount !== 1 || !playerStart) throw new Error(`${def.meta.id}: expected exactly one 'P', got ${pCount}`);
  if (exits.length === 0) throw new Error(`${def.meta.id}: no exit 'E'`);
  return {
    meta: def.meta,
    width,
    height: rows.length,
    walls: walls2,
    floors,
    playerStart,
    exits,
    creatureSpawn
  };
}

// src/levels/wake.ts
var wake = {
  meta: {
    id: "wake",
    name: "Wake",
    order: 1,
    floor: "stone",
    playerHeading: 270,
    rt60: 1.2,
    clicksEnabled: false,
    beacon: true,
    beaconGain: 0.9,
    narration: {
      intro: [
        "You wake up somewhere completely dark.",
        "Hear that? Wind, coming from outside.",
        "Turn your phone slowly until the wind is straight ahead of you.",
        "Then hold two fingers on the screen to walk towards it."
      ],
      win: "You found your way out. Next, there won't be any wind to follow."
    },
    hints: [
      "Turn your whole body, holding the phone in front of you, until the wind is centred.",
      "Hold two fingers down to walk. Lift them to stop."
    ]
  },
  map: `#########
#.......#
#.......#
#...P...E
#.......#
#########`
};

// src/levels/walls.ts
var walls = {
  meta: {
    id: "walls",
    name: "Walls",
    order: 2,
    floor: "stone",
    playerHeading: 180,
    rt60: 1.4,
    clicksEnabled: true,
    beacon: false,
    beaconGain: 0,
    narration: {
      intro: [
        "No wind this time. You'll have to listen to the room itself.",
        "Tap the screen once to click.",
        "The echo tells you what's around you. Close walls answer quickly and loudly. Far walls answer later and softer.",
        "Somewhere, there's a gap in the wall. A gap gives no echo at all. Find it."
      ],
      win: "That's echolocation. Some blind people use exactly this to move through the world."
    },
    hints: [
      "There's a wall right in front of you. Hear how fast it answers? Now turn around and click again.",
      "Turn a little at a time and click. When one direction goes quiet, that's the gap."
    ]
  },
  map: `####EE####
#........#
#........#
#........#
#....P...#
#........#
##########`
};

// src/levels/corridor.ts
var corridor = {
  meta: {
    id: "corridor",
    name: "Corridor",
    order: 3,
    floor: "stone",
    playerHeading: 90,
    rt60: 1.6,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.35,
    narration: {
      intro: [
        "A long corridor. Follow the openings.",
        "Listen to the walls change. Stone rings sharp and bright. Wood sounds dull and soft.",
        "The wind is faint, but it's there."
      ],
      win: "Good. Your ears are learning."
    }
  },
  map: `################
#P............##
#.............##
############..##
###########W..W#
###########W..W#
###########W..W#
###########W..W#
E.............##
#.............##
################`
};

// src/levels/godown.ts
var godown = {
  meta: {
    id: "godown",
    name: "Godown",
    order: 4,
    floor: "stone",
    playerHeading: 180,
    rt60: 1.3,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.25,
    narration: {
      intro: [
        "An old spice warehouse in Mattancherry.",
        "Sacks soak up sound. Water splashes. Not every opening leads somewhere."
      ],
      win: "One more. Somewhere in the dark, you won't be alone."
    }
  },
  map: `##################
#P...#......S....#
#....#..SS..S....#
#....#..SS.......#
#........~~~..#..#
#####....~~~..#..#
#...S....~~~..####
#...S..#.........#
#......#..WWW....#
#......#..WWW....E
#..SS..#.........#
##################`
};

// src/levels/hold.ts
var hold = {
  meta: {
    id: "hold",
    name: "The Hold",
    order: 5,
    floor: "wood",
    playerHeading: 90,
    rt60: 0.9,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.2,
    creature: { wander: 0.6, investigate: 1, hunt: 1.35 },
    narration: {
      intro: [
        "The hold of an old ship, docked at Fort Kochi.",
        "Something is down here with you. It can't see either. It hunts by sound.",
        "Every click helps you. Every click helps it.",
        "Find the hatch."
      ],
      win: "You escaped the hold.",
      lose: "It found you."
    }
  },
  map: `WWWWWWWWWWWWWWWWWWWW
W..........W.......W
W.P........W...C...W
W.....SS...........W
W.....SS...WWWW....W
W..............W...W
WWWW...WWWW....W...W
W......W.......W...W
W..~~..W...SS......W
W..~~......SS......E
WWWWWWWWWWWWWWWWWWWW`
};

// src/levels/sandbox.ts
var sandbox = {
  meta: {
    id: "sandbox",
    name: "Sandbox",
    order: 99,
    floor: "stone",
    playerHeading: 90,
    rt60: 1.4,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.5,
    narration: {
      intro: ["Sandbox."],
      win: "Done."
    }
  },
  map: `###############
#......W......#
#......W......#
#.P....W......#
#......W......#
#.............#
#......W......#
#......W......#
#......W......#
#.............#
#.............#
#..SS..W......#
#..SS..W......E
#......W......#
###############`
};

// src/levels/index.ts
var LEVEL_DEFS = [wake, walls, corridor, godown, hold, sandbox];

// src/world/grid.ts
function castRay(l2, x, y, angle, maxDist) {
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  if (dx === 0 && dy === 0) return null;
  let col = Math.floor(x);
  let row = Math.floor(y);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? col + 1 - x : x - col) / Math.abs(dx) : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? row + 1 - y : y - row) / Math.abs(dy) : Infinity;
  const startWall = inBounds(l2, col, row) ? wallAt(l2, col, row) : null;
  if (startWall) {
    return { dist: 0, material: startWall, normal: { x: -dx, y: -dy }, x, y };
  }
  let t2 = 0;
  for (let i = 0; i < 1024; i++) {
    let nx = 0, ny = 0;
    if (tMaxX < tMaxY) {
      t2 = tMaxX;
      tMaxX += tDeltaX;
      col += stepX;
      nx = -stepX;
    } else {
      t2 = tMaxY;
      tMaxY += tDeltaY;
      row += stepY;
      ny = -stepY;
    }
    if (t2 > maxDist) return null;
    if (!inBounds(l2, col, row)) return null;
    const wall = wallAt(l2, col, row);
    if (wall) {
      return {
        dist: t2,
        material: wall,
        normal: { x: nx, y: ny },
        x: x + dx * t2,
        y: y + dy * t2
      };
    }
  }
  return null;
}

// src/audio/echo.ts
var wrapAngle = (a) => {
  a = a % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};
function computeEcho(level, px2, py2, heading, t2) {
  const N = Math.max(8, Math.round(t2.rays));
  const B = Math.max(4, Math.round(t2.bins));
  const binWidth = 2 * Math.PI / B;
  const acc = Array.from({ length: B }, () => ({
    energySum: 0,
    hits: 0,
    weightedDist: 0,
    matEnergy: /* @__PURE__ */ new Map(),
    hitX: 0,
    hitY: 0,
    hitW: 0
  }));
  for (let i = 0; i < N; i++) {
    const theta = heading + 2 * Math.PI * i / N;
    const rel = wrapAngle(theta - heading);
    const bin = Math.min(B - 1, Math.round(rel / binWidth) % B);
    const hit = castRay(level, px2, py2, theta, t2.maxDist);
    if (!hit) continue;
    const d = Math.max(hit.dist, 0.5);
    const dx = Math.sin(theta);
    const dy = -Math.cos(theta);
    const cosPhi = Math.abs(dx * hit.normal.x + dy * hit.normal.y);
    const e = t2.materialReflectivity[hit.material] * cosPhi / (d * d);
    const a = acc[bin];
    a.energySum += e;
    a.hits++;
    a.weightedDist += e * hit.dist;
    a.matEnergy.set(hit.material, (a.matEnergy.get(hit.material) ?? 0) + e);
    a.hitX += hit.x * e;
    a.hitY += hit.y * e;
    a.hitW += e;
  }
  const raysPerBin = N / B;
  const bins = [];
  const hitPoints = [];
  for (let b = 0; b < B; b++) {
    const a = acc[b];
    if (a.hits === 0) continue;
    const eBin = a.energySum / raysPerBin;
    const dBin = a.weightedDist / a.energySum;
    let mBin = "stone";
    let mE = -1;
    for (const [m, e] of a.matEnergy) {
      if (e > mE) {
        mE = e;
        mBin = m;
      }
    }
    const coverage = a.hits / raysPerBin;
    let amp = Math.min(1, t2.echoGain * Math.sqrt(eBin) * coverage);
    if (dBin < t2.nearWallDist) amp = Math.min(1, amp * t2.nearWallBoost);
    const delay = 2 * dBin / 343 * t2.echoTimeScale;
    const cutoff = Math.min(t2.materialCutoff[mBin], 16e3 / (1 + dBin / 4));
    const rel = wrapAngle(b * binWidth);
    const hit = { x: a.hitX / a.hitW, y: a.hitY / a.hitW };
    bins.push({ rel, energy: eBin, dist: dBin, material: mBin, amp, delay, cutoff, hit });
    hitPoints.push(hit);
  }
  return { bins, hitPoints };
}

// src/world/materials.ts
var WALL_PROPS = {
  stone: { reflectivity: 0.95, cutoff: 9e3, color: "#8d99ae" },
  wood: { reflectivity: 0.65, cutoff: 3500, color: "#9c6644" },
  sacks: { reflectivity: 0.25, cutoff: 1500, color: "#b08968" }
};

// src/audio/tuning.ts
function defaultTuning() {
  return {
    rays: 180,
    bins: 24,
    echoTimeScale: 5,
    echoGain: 1.15,
    clickGain: 0.35,
    reverbAmount: 0.08,
    maxDist: 20,
    nearWallBoost: 1.4,
    nearWallDist: 1.5,
    clickCooldownMs: 350,
    walkSpeed: 1.1,
    waterSpeedMul: 0.6,
    materialReflectivity: {
      stone: WALL_PROPS.stone.reflectivity,
      wood: WALL_PROPS.wood.reflectivity,
      sacks: WALL_PROPS.sacks.reflectivity
    },
    materialCutoff: {
      stone: WALL_PROPS.stone.cutoff,
      wood: WALL_PROPS.wood.cutoff,
      sacks: WALL_PROPS.sacks.cutoff
    }
  };
}

// scripts/echotest.ts
var l = parseLevel(LEVEL_DEFS.find((d) => d.meta.id === "walls"));
var px = l.playerStart.col + 0.5;
var py = l.playerStart.row + 0.5;
var t = defaultTuning();
var TAU = Math.PI * 2;
var norm = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
var ang = TAU / t.bins;
console.log(`player (${px},${py}) exits ${l.exits.map((e) => `(${e.col},${e.row})`).join(" ")}`);
for (const hd of [0, 45, 90, 180]) {
  const h = hd * Math.PI / 180;
  const rays = Array.from({ length: t.rays }, (_, i) => {
    const theta = h + TAU * i / t.rays;
    return { theta, hit: castRay(l, px, py, theta, t.maxDist) };
  });
  const e = computeEcho(l, px, py, h, t);
  console.log(`
--- heading ${hd}deg: ${e.bins.length} voices ---`);
  const cov = /* @__PURE__ */ new Map();
  for (const r of rays) {
    const rel = (norm(r.theta - h) + TAU) % TAU;
    const b = Math.round(rel / ang) % t.bins;
    const c = cov.get(b) ?? { hits: 0, total: 0 };
    c.total++;
    if (r.hit) c.hits++;
    cov.set(b, c);
  }
  for (let i = 0; i < t.bins; i++) {
    const c = i * ang * 180 / Math.PI;
    const cd = c > 180 ? c - 360 : c;
    if (Math.abs(cd) > 60) continue;
    const cv = cov.get(i) ?? { hits: 0, total: 0 };
    const bin = e.bins.find((b) => Math.round((b.rel % TAU + TAU) % TAU / ang) % t.bins === i);
    console.log(`bin${i} rel ${cd.toFixed(0)}deg cov ${cv.hits}/${cv.total}` + (bin ? `  -> d=${bin.dist.toFixed(1)} ${bin.material} E=${bin.energy.toFixed(3)} amp=${bin.amp.toFixed(2)} delay=${(bin.delay * 1e3).toFixed(0)}ms` : "  -> SILENT"));
  }
}
