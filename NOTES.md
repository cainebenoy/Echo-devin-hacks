# NOTES — deviations from ECHO_SPEC.md

Everything in the spec is implemented. Where a literal reading was technically
impossible or self-contradictory, the closest equivalent was chosen:

## Audio

- **Beacon LFO rate:** the spec asks for a 0.15 Hz LFO *and* a seamless 6 s loop.
  0.15 Hz completes only 0.9 cycles in 6 s, which cannot loop seamlessly. The
  LFO runs at 1/6 Hz (exactly one cycle per loop) plus a 150 ms equal-power
  crossfade at the seam. Nearest equivalent to "0.15 Hz, seamless".
- **Breathing irregularity:** the spec asks for a 3.2 s cycle with slight
  irregularity. A looped buffer must repeat, so the breathing buffer is 6.4 s
  containing two 3.2 s cycles with ±8 % timing differences.
- **Narration duck ramp:** implemented with `setTargetAtTime` τ = 0.05 s
  (≈150 ms settle), matching the spec's 150 ms ramp.

## Input / platform

- **Portrait lock is best-effort:** `screen.orientation.lock()` is unsupported
  on iOS Safari and only works in fullscreen/installed contexts elsewhere.
  The PWA manifest sets `orientation: portrait`, `lock('portrait')` is called
  in a try/catch, and the heading math (rotation-matrix back-of-phone vector)
  is screen-rotation independent, so nothing depends on the lock succeeding.
- **Pause-menu gesture addition:** the spec requires the walk-in-place step
  detection to be "toggleable in the pause menu" but defines only tap /
  swipe-down / swipe-up for that menu. **Swipe-left** toggles step detection
  and the narrator confirms "Walk in place: on/off".
- **Fallback-turn narration** is only spoken on touch devices; on desktop the
  same drag-turn fallback exists but A/D keys already cover turning.

## Deployment / services

- **Vercel deploy** requires account authentication (`npx vercel`). `vercel.json`
  with the `/watch` rewrite is included; run `npx vercel --prod` after logging
  in to publish (HTTPS is required for iOS motion sensors).
- **Spectator mode** needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at
  build time (see `.env.example`). Without them the game is fully functional
  and the boot screen shows no room code, per spec.

## Design choices within spec latitude

- **Sandbox layout** was specified only by description (15×15 stone room,
  internal wood wall, sack pile, 1-cell and 2-cell doorways). Implemented as a
  wood wall spanning the midline with a 1-cell doorway at row 5 and a 2-cell
  doorway at rows 9–10, sacks at rows 11–12.
- **Echo binning** assigns each ray to its nearest bin centre (`round`), the
  standard interpretation of "bin by relative angle into B bins".
- **Heartbeat** is rescheduled per tick from the run clock; rate lerps
  70 → 150 bpm as creature path distance goes 7 → 1 m.
- **`npm audit`** reports vulnerabilities in dev-only transitive deps
  (workbox/babel chain); none ship to production code.

## Manual testing still required

Section 14's checklist needs real devices (iPhone Safari, Android Chrome,
wired earphones). Automated coverage: level validation, DDA/LOS/collision,
BFS/A*/propagation, echo math (delays, openings, materials, near-wall boost),
creature hearing/hunt/catch thresholds, gesture state machine, and the
torch-heading yaw function (flat/tilted/upright poses, 360° sweep).

### Echo tuning defaults (after desktop playtest)

Spec defaults `echoTimeScale=3, echoGain=0.9, clickGain=0.5, reverbAmount=0.12`
made echoes smear into the dry click (1.5 m wall → 26 ms delay, amp 0.56) and
read as "clicking" rather than directional returns. Playtested defaults are
now `echoTimeScale=5, echoGain=1.15, clickGain=0.45, reverbAmount=0.08` — all
within the spec's tunable ranges (1–6 for the time scale; sliders still allow
the original values).

### Coverage-weighted echo amplitude (playability deviation)

Spec computes per-bin amplitude from mean ray energy alone; a bin whose rays
only partially hit (the shoulder of an opening) then sounds almost as loud as
a full wall, so a 2-cell gap read as a barely-audible ~15° notch. Amp is now
additionally multiplied by `hits / raysPerBin`: partial bins dim in
proportion, gaps read as a ~30° silent notch. Verified on Walls — the
gap-facing bins are silent or ≤0.02 amp while full-coverage flanks stay loud.

### Open-air cue + level picker (playability deviations)

Pure silence as the cue for an opening proved unreadable in playtesting — the
other 23 bins still echo and mask a single missing bin. Each contiguous arc
of empty bins now also emits one soft airy whoosh (`openAir` buffer) panned
to the opening's direction, so sweeping produces "tick-tick-whoosh" instead of
"silence vs slightly less sound". In visual/testing mode the menu also shows
a clickable level picker with all levels unlocked so testing doesn't require
replaying from Level 1.

### Beacon audibility floor

Spec's positional-source gain `base / max(1, distance)` made the beacon
nearly inaudible at long path distances (Godown/Hold ~0.01–0.03 at 15–18 m),
removing the only wayfinding cue. PositionalLoop now takes an optional
audibility floor; the beacon uses `baseGain * 0.15`, keeping it faintly
present everywhere. Breathing intentionally has no floor — it must fade with
distance to telegraph creature proximity.
