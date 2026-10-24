import type { LevelDef } from '../world/level';

export const walls: LevelDef = {
  meta: {
    id: 'walls',
    name: 'Walls',
    order: 2,
    floor: 'stone',
    playerHeading: 180,
    rt60: 1.4,
    clicksEnabled: true,
    beacon: false,
    beaconGain: 0,
    narration: {
      intro: [
        "No wind this time. You'll have to listen to the room itself.",
        'Tap the screen once to click.',
        "The echo tells you what's around you. Close walls answer quickly and loudly. Far walls answer later and softer.",
        "Somewhere, there's a gap in the wall. A wall answers with a knock. A gap answers with a soft chime. Find the chime.",
      ],
      win: "That's echolocation. Some blind people use exactly this to move through the world.",
    },
    hints: [
      "There's a wall right in front of you. Hear how fast it answers? Now turn around and click again.",
      'Turn a little at a time and click. A knock means wall — the chime means the gap.',
    ],
  },
  map: `####EEE###
#........#
#........#
#........#
#....P...#
#........#
##########`,
};
