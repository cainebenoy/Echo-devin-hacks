import type { LevelDef } from '../world/level';

export const hold: LevelDef = {
  meta: {
    id: 'hold',
    name: 'The Hold',
    order: 5,
    floor: 'wood',
    playerHeading: 90,
    rt60: 0.9,
    clicksEnabled: true,
    beacon: true,
    beaconGain: 0.2,
    creature: { wander: 0.6, investigate: 0.9, hunt: 1.35 },
    narration: {
      intro: [
        'The hold of an old ship, docked at Fort Kochi.',
        "Something is down here with you. It can't see either. It hunts by sound.",
        'Every click helps you. Every click helps it.',
        'Your heartbeat tells you how close it is. Its growls tell you which way.',
        "If it charges, keep walking and don't click — it can't hear your steps while it runs.",
        'Find the hatch.',
      ],
      win: 'You escaped the hold.',
      lose: 'It found you.',
    },
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
WWWWWWWWWWWWWWWWWWWW`,
};
