import { describe, expect, it } from 'vitest';
import {
  decodeCustom, encodeCustom, customDef, validateCustomMap,
  randomRoomName, CUSTOM_CREATURE, STATUS_TEXT,
} from '../src/custom/codec';
import { parseLevel } from '../src/world/level';

const smallMap = [
  '##########',
  '#P.......#',
  '#........#',
  '###E######',
  '##########',
].join('\n');

/** Largest allowed grid (24×16) filled with a high-entropy pattern. */
function bigMap(): string {
  const chars = ['.', '.', '.', '~', 'S', 'W'];
  const rows: string[] = [];
  for (let r = 0; r < 16; r++) {
    let row = '';
    for (let c = 0; c < 24; c++) {
      if (r === 0 || r === 15 || c === 0 || c === 23) row += '#';
      else row += chars[(r * 31 + c * 17) % chars.length];
    }
    rows.push(row);
  }
  // Guarantee P and E exist.
  rows[8] = rows[8].slice(0, 12) + 'P' + rows[8].slice(13);
  rows[1] = rows[1].slice(0, 20) + 'E' + rows[1].slice(21);
  return rows.join('\n');
}

describe('custom room codec', () => {
  it('round-trips name, beacon and map', () => {
    const p = { name: 'Custom room — salty hold', beacon: true, map: smallMap };
    const out = decodeCustom(encodeCustom(p));
    expect(out).not.toBeNull();
    expect(out!.name).toBe(p.name);
    expect(out!.beacon).toBe(true);
    expect(out!.map).toBe(p.map);
  });

  it('round-trips beacon=false', () => {
    const out = decodeCustom(encodeCustom({ name: 'x', beacon: false, map: smallMap }));
    expect(out!.beacon).toBe(false);
  });

  it('largest grid stays under 2000 URL characters', () => {
    const data = encodeCustom({ name: 'Custom room — big depot', beacon: true, map: bigMap() });
    const url = `https://echo.example/?custom=${data}`;
    expect(url.length).toBeLessThan(2000);
  });

  it('malformed data never throws — returns null', () => {
    expect(decodeCustom('')).toBeNull();
    expect(decodeCustom('!!!not-base64!!!')).toBeNull();
    expect(decodeCustom('AAAA')).toBeNull();          // valid b64, not deflate
    expect(decodeCustom('eyJ2IjoxLCJtYXAiOiI')).toBeNull(); // truncated
    const real = encodeCustom({ name: 'x', beacon: true, map: smallMap });
    expect(decodeCustom(real.slice(0, Math.floor(real.length / 2)))).toBeNull();
    // Bad chars inside an otherwise-valid container are rejected by the regex.
    const bad = encodeCustom({ name: 'x', beacon: true, map: '###\n#XQ#\n###' });
    expect(decodeCustom(bad)).toBeNull();
  });
});

describe('custom map validation', () => {
  it('ready on a solvable room', () => {
    const v = validateCustomMap(smallMap);
    expect(v.status).toBe('ready');
    expect(STATUS_TEXT.ready).toBe('Ready');
  });
  it('no-start / no-exit messages', () => {
    const noP = smallMap.replace('P', '.');
    expect(validateCustomMap(noP).status).toBe('no-start');
    const noE = smallMap.replace('E', '#');
    expect(validateCustomMap(noE).status).toBe('no-exit');
    expect(STATUS_TEXT['no-start']).toBe('Place a start');
    expect(STATUS_TEXT['no-exit']).toBe('Place an exit');
  });
  it('exit-unreachable when the exit is walled off', () => {
    const map = [
      '##########',
      '#P.......#',
      '#.########',
      '#.#E######',
      '##########',
    ].join('\n');
    expect(validateCustomMap(map).status).toBe('exit-unreachable');
  });
  it('creature-unreachable when C is walled off from P', () => {
    const map = [
      '##########',
      '#P......E#',
      '#.########',
      '#.#C######',
      '##########',
    ].join('\n');
    expect(validateCustomMap(map).status).toBe('creature-unreachable');
  });
  it('invalid on unknown characters', () => {
    expect(validateCustomMap('###\n#P?\n###').status).toBe('invalid');
  });
});

describe('generated meta', () => {
  it('rt60 = clamp(0.6 + walkable/150, 0.8, 1.8)', () => {
    // smallMap: interior 2 rows × 8 cols minus P/E → 14 walkable → 0.6+14/150 ≈ 0.69 → clamped to 0.8
    const def = customDef({ name: 'x', beacon: true, map: smallMap });
    const l = parseLevel(def);
    expect(l.meta.rt60).toBeCloseTo(0.8);
    // Big mostly-open room (24×16) pushes rt60 to the 1.8 ceiling.
    const open = [
      '####################E###',
      ...Array.from({ length: 14 }, (_, r) =>
        '#' + (r === 7 ? 'P' + '.'.repeat(21) : '.'.repeat(22)) + '#'),
      '########################',
    ].join('\n');
    const l2 = parseLevel(customDef({ name: 'x', beacon: true, map: open }));
    expect(l2.meta.rt60).toBeGreaterThan(0.8);
    expect(l2.meta.rt60).toBeLessThanOrEqual(1.8);
  });

  it('player starts facing away from the nearest exit', () => {
    // Exit at east edge → player should face west (270°).
    const map = [
      '##########',
      '#P......E#',
      '##########',
    ].join('\n');
    const l = parseLevel(customDef({ name: 'x', beacon: true, map }));
    expect(l.meta.playerHeading).toBe(270);
  });

  it('creature uses calm-mode speeds when C placed', () => {
    const map = [
      '##########',
      '#P.....C.#',
      '#.......E#',
      '##########',
    ].join('\n');
    const l = parseLevel(customDef({ name: 'x', beacon: true, map }));
    expect(l.meta.creature).toEqual(CUSTOM_CREATURE);
    expect(l.creatureSpawn).not.toBeNull();
  });

  it('fixed narration lines', () => {
    const l = parseLevel(customDef({ name: 'x', beacon: true, map: smallMap }));
    expect(l.meta.narration.intro[0]).toBe('A room drawn just for you. Find the way out.');
    expect(l.meta.narration.win).toBe('You escaped their room.');
    expect(l.meta.narration.lose).toBe('It found you.');
  });

  it('names are "Custom room — <word pair>"', () => {
    expect(randomRoomName(() => 0.5)).toMatch(/^Custom room — \w+ \w+$/);
  });
});
