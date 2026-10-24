/** Menu and pause narration lines (level lines live in each level's meta). */
export const MENU = {
  intro: (n: number, name: string) =>
    `Echo. Tap to play level ${n}, ${name}. Swipe left or right to choose a level.`,
  levelName: (n: number, name: string) => `Level ${n}, ${name}.`,
  locked: 'Locked.',
  pause: 'Paused. Tap to resume. Swipe down to restart. Swipe up to return to the menu.',
  objectiveRepeat: (line: string) => line,
  noSpeechNotice: 'Voice narration unavailable on this device.',
  sensorsFallback: 'Motion sensors unavailable. Drag one finger left or right to turn.',
  pebbleIntro: 'Flick up to throw a pebble. It can draw the creature away. You have three.',
  winSummary: (durationSec: number, clicks: number) =>
    `You escaped in ${speakDuration(durationSec)}, using ${speakCount(clicks, 'click', 'clicks')}. Tap to continue, swipe down to retry.`,
  loseSummary: (durationSec: number, clicks: number) =>
    `It found you after ${speakDuration(durationSec)} and ${speakCount(clicks, 'click', 'clicks')}. Tap to try again, swipe up for the menu.`,
};

function speakDuration(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} ${r === 1 ? 'second' : 'seconds'}`;
  if (r === 0) return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  return `${m} ${m === 1 ? 'minute' : 'minutes'} ${r} ${r === 1 ? 'second' : 'seconds'}`;
}

function speakCount(n: number, one: string, many: string): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const w = n <= 20 ? words[n] : String(n);
  return `${w} ${n === 1 ? one : many}`;
}
