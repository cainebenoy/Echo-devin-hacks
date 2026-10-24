# Change log

## 2026-10-24T21:53:05+05:30 — Correct Devin Hack Kochi event guidance

- Changed: corrected the current event name and AI tool guidance in `.github/pull_request_template.md`, `AGENTS.md`, `AI_USAGE.md`, `CHANGELOG.md`, `README.md`, `RULES.md`, `SUBMISSION.md`.
- Why: the organizer shared an older event template; Devin Hack Kochi has no
  major AI usage constraints and the template must not require a particular AI provider.
- Scope: preserved project implementation and historical assistance records.
- Removed obsolete template logistics, participation limits, and credit promises; current organizer instructions remain authoritative.
- Validation: reviewed documentation diffs, checked whitespace with `git diff --check`, and checked local Markdown links for new breakage.
- Limitations: maintainer review is pending; application tests were not run for this documentation-only correction.

## 2026-10-24T21:20:00+05:30 — Template migration + screenshots

- Changed: imported full project into the DevDay template repository; added
  `scripts/screenshots.ts` (renders real level maps + echo hits to PNG) and
  `screenshots/`; filled README/SUBMISSION/AI_USAGE placeholders.
- Why: hackathon requires code, run scripts, and supporting screenshots in the
  provided template repo.
- Validation: `node scripts/.screenshots.mjs` produced all PNGs; visual check
  of `hold-run.png` (walls, path, click rings, echo lines, creature).
- Limitations: screenshots are static renders, not device captures.

## 2026-10-24T21:05:00+05:30 — Initial build: Echo complete

- Changed: full implementation of ECHO_SPEC.md — three batches (engine, game,
  reveal/polish) in one pass. All of `src/`, `tests/`, PWA config, docs.
- Why: build the game to spec.
- Validation: `npm test` 54/54 pass; `tsc` clean; `vite build` + SW generation
  clean; `vite preview` serves 200s.
- Limitations: Vercel deploy and on-device checklist (spec §14) pending;
  deviations logged in NOTES.md.

## 2026-10-24T21:35:00+05:30 — Narrator queue race fix

- Changed: `src/narration/narrator.ts` — re-check `speaking` after awaiting
  voice resolution; a second queued line could overlap the in-flight one.
- Why: spec requires narration to never overlap itself.
- Validation: `tsc --noEmit` clean; `vitest run` 54/54 pass.
- Limitations: none identified.

## 2026-10-24T21:40:00+05:30 — Visual testing mode

- Changed: `src/main.ts`, `src/debug/overlay.ts`, `src/style.css` — live
  top-down map during play plus status line and desktop key hints. On by
  default on non-touch devices; `?visual=1`/`?visual=0` overrides anywhere.
  Menu shows a map preview of the selected level; Space starts a level from
  the menu.
- Why: desktop testing is impossible on a black screen; the real demo still
  keeps the phone dark.
- Validation: `tsc --noEmit` clean; `vitest run` 54/54 pass; `vite build` clean.
- Limitations: visual mode is a test aid, not part of the shipped play UX.

## 2026-10-24T21:45:00+05:30 — Desktop testability + audio fixes

- Changed: `src/game/loop.ts` — sensor heading gated to touch devices (laptop
  orientation sensors no longer override A/D); footstep gain reduced; HUD now
  shows a plain-English "heard" readout (material + distance + direction of
  nearest echo) plus level/time/clicks/bumps/creature state.
  `src/audio/synth.ts` — stone/wood footsteps reworked to dull low thuds
  instead of click-like 1.8 kHz bursts.
  `src/main.ts` — Space starts the selected level from the menu; ` toggles
  only the tuning panel while visual mode owns the map.
- Why: first desktop test showed Space/A/D unresponsive (sensor override +
  clicks disabled in Wake by design), footsteps sounding like clicks, and a
  black map outside of play.
- Validation: `tsc --noEmit` clean; `vitest run` 54/54 pass; `vite build` clean.
- Limitations: none identified in these checks.

## 2026-10-24T21:55:00+05:30 — UI/UX polish pass (sonar theme)

- Changed: `src/style.css` rewritten with a design-token palette (near-black
  blue, cyan echo accents, amber/red danger); boot screen gets pulsing sonar
  rings; HUD stats become labeled chips with a highlighted "heard" readout;
  results/watch/tuning surfaces restyled; player/creature glow in the map
  renderer; favicon added.
- Why: hackathon demo needs a legible, polished sighted view; the play screen
  itself remains black by design.
- Validation: `tsc --noEmit` clean; `vitest run` 54/54; `vite build` clean.
- Limitations: visual review of the deployed build still pending.

## 2026-10-24T22:05:00+05:30 — Echo readability + gesture edge cases

- Changed: `src/audio/tuning.ts` — echoTimeScale 3→5, echoGain 0.9→1.15,
  clickGain 0.5→0.45, reverbAmount 0.12→0.08 so echoes are audible and
  temporally distinct from the dry click (verified via a scripted echo dump
  on Walls: gap bin stays silent, flanks return).
  `src/input/gestures.ts` — swipes require a sub-450 ms flick, so a released
  drag-turn no longer triggers pause-menu swipes; `#tuning-panel` excluded
  from game gestures.
- Why: playtest found "clicking in the direction of the hole still produces
  sound" — dry click masked the quiet/fast echoes — and accidental swipes.
- Validation: scripted echo dump at 4 headings; `tsc` clean; 54/54 tests;
  clean build.
- Limitations: echo gain values are playtested on desktop speakers, not yet
  tuned on earphones.

## 2026-10-24T22:20:00+05:30 — Gap notch made readable

- Changed: `src/audio/echo.ts` — echo amplitude multiplied by bin ray
  coverage so partially-filled bins sound proportionally dimmer;
  `src/audio/tuning.ts` — clickGain 0.45→0.35 so the dry click cannot mask
  the silence of an opening. Documented deviation in NOTES.md.
- Why: playtest showed the 2-cell gap still produced audible echo; coverage
  weighting widens the perceived notch without changing ray physics.
- Validation: scripted echo dump — gap bin silent, shoulder bins ≤0.02 amp;
  `tsc` clean; 54/54 tests; clean build.
- Limitations: shoulder-bin dimming also softens wall edges; acceptable
  trade-off, tunable.

## 2026-10-24T22:35:00+05:30 — Open-air cue for gaps + level picker

- Changed: `src/audio/synth.ts`, `src/audio/echo.ts` — each contiguous arc of
  empty bins emits a panned airy whoosh so openings give a positive cue;
  `src/game/loop.ts` — HUD "heard" chip says `OPENING ahead (airy whoosh)`
  when facing a gap and hints `gap left/right` otherwise; `src/main.ts`,
  `src/style.css` — clickable level-picker bar in visual mode with all levels
  unlocked for testing.
- Why: "absence of sound" masked by 23 echoing bins wasn't learnable; manual
  testing had to replay from Level 1 on every refresh.
- Validation: `tsc` clean; 54/54 tests; `vite build` clean.
- Limitations: open-air cue is an addition to the spec's pure-silence rule,
  documented in NOTES.md.

## 2026-10-24T22:45:00+05:30 — Skip/mute narration + better voice choice

- Changed: `src/narration/narrator.ts`, `src/game/loop.ts`, `src/input/keyboard.ts`,
  `src/main.ts` — any click/walk/Enter immediately cuts off queued narration;
  desktop defaults to captions-only (`M` toggles voice, persisted); natural/
  neural voices ranked ahead of generic system voices; speech rate 1.0→1.25.
- Why: speechSynthesis voice is slow and robotic, blocking testing.
- Validation: `tsc` clean; 54/54 tests; `vite build` clean.
- Limitations: none identified.

## 2026-10-24T22:55:00+05:30 — Forward-focused echoes + chime for openings

- Changed: `src/audio/synth.ts`, `src/audio/echo.ts`, `src/game/loop.ts` —
  replaced the noise-whoosh opening cue with a warm 3-note chime; attenuated
  peripheral/rear echo bins so the forward return dominates; pitch-shifted
  forward echoes by distance (close = higher, far = lower); loud centred
  chime when facing the gap (±25°), soft panned hint when off-angle.
- Why: 24 simultaneous echoes + noise whoosh all blurred together; players
  couldn't tell wall from gap.
- Validation: `tsc` clean; 54/54 tests; `vite build` clean.
- Limitations: forward-focus + chime are playability additions to the spec's
  equal-bin model, documented in NOTES.md.

## 2026-10-24T23:05:00+05:30 — Level audit + beacon audibility floor

- Changed: `src/audio/sources.ts`, `src/game/loop.ts` — optional min-gain
  floor on PositionalLoop; beacon floors at 15% of base gain so the
  wayfinding cue survives long levels.
- Why: scripted level audit showed every map is completable (paths
  collision-free), but the beacon dropped to ~0.01–0.03 at distance —
  effectively silent in Corridor/Godown/Hold.
- Validation: audit script output (all paths exist, 0 blocked waypoints);
  `tsc` clean; 54/54 tests; clean build.
- Limitations: floor keeps gain flat beyond ~12m; directionality is still
  encoded by the panner.

## 2026-10-24T23:20:00+05:30 — Creature stuck fix, proximity cues, Calm mode

- Changed: `src/game/creature.ts` — reaching the end of a hunt/investigate
  path with nothing found now returns to wander instead of standing frozen;
  hearing profile is per-instance so assist can scale it. `src/game/loop.ts` —
  heartbeat gain scales with closeness and vibrates under 3 m; HUD shows
  creature state + path distance; `assist` dep floors beacon higher and
  applies the creature assist profile. `src/main.ts` — `?assist=1` / stored
  `echo.assist` + a "Calm" toggle button in the level picker.
- Why: creature looked stuck after reaching a heard spot; players had no
  proximity feedback; late levels were too punishing.
- Validation: `tsc` clean; 54/54 tests; `vite build` clean.
- Limitations: creature chase smoothness not verified on-device yet.
