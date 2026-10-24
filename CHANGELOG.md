# Change log

## 2026-10-25T02:05:00+05:30 — Menu: drop backdrop panel, ping from the O

- Changed: `src/main.ts`, `src/style.css`.
- Why (user direction): the landing page read as a rectangle behind the
  content — removed `#menu`'s radial-gradient backdrop so the menu floats
  on the fog/grain darkness; and the sonar ping now originates inside the
  "O" of the wordmark (boot + menu), not a point at 42% screen height —
  the first echo comes out of the title itself.
- Details: the O glyph is wrapped in `.o` (`position:relative`,
  `letter-spacing:0` so the span box hugs the glyph and the ring centre
  lands on the counter); rings use a smaller 80px base with a dedicated
  `sonar-o` keyframe (scale 0.5→7) so they bloom from inside the letter
  and wash over the menu.
- Validation: `npx tsc --noEmit` clean; `vite build` + SW clean.
- Limitations: the O-centre approximation is the glyph-box centre —
  visually indistinguishable across the clamp(2.6–4.4rem) title sizes.

## 2026-10-25T01:45:00+05:30 — Leaderboard fixes + editable entries

- Changed: `src/spectate/leaderboard.ts`, `src/spectate/boardui.ts`,
  `src/spectate/watch.ts`, `src/main.ts`, `src/style.css`,
  `tests/leaderboard.test.ts`, `README.md`.
- Why — fixes (review + user report "the leaderboard has some issues"):
  1. The board flash could linger over live gameplay/menus — it now hides
     on `startLevel`/`enterMenu` (main) and on a new 'start' broadcast (watch).
  2. A run ending while the operator was still naming the previous player
     was silently discarded (the new prompt replaced the open one without
     its callback firing). Prompts now queue via `BoardUI.feed` — no run
     is ever dropped.
  3. `L` before the first finished run did nothing, and on drawn rooms it
     could never resolve `custom:<hash>` — the fallback now derives the
     board key from the watched level (hash computed from its map).
  4. `at` (entry identity for edits) could collide when two saves landed
     in the same millisecond — `saveRun` now bumps on collision.
- Why — feature: the operator can now edit entries — click a row to
  rename it (fixes mis-typed names and "Anonymous" saves), click the row's
  × to remove it (confirm dialog). Renaming never changes the score or
  rank. Implemented via `renameEntry`/`removeEntry` keyed on `at`.
- Validation: `npx tsc --noEmit` clean; `vitest` 104/104 pass (rename/
  remove tests added); `vite build` + SW clean.
- Limitations: edits are name-and-delete only — scores/durations can't be
  hand-edited (deliberate: no score forgery); row edits are blocked while
  a name prompt is open.

## 2026-10-25T01:10:00+05:30 — Batch E self-review: edge-case fixes

- Changed: `src/game/loop.ts`, `src/input/gestures.ts`,
  `src/spectate/leaderboard.ts`, `src/spectate/boardui.ts`,
  `tests/leaderboard.test.ts`.
- Why: post-implementation review of D3/D4 found real edge cases:
  1. `session.stop()` never marked the session ended, so a pebble still in
     flight when the player retried/menud would land on the discarded
     session — broadcasting a phantom ripple/arc on the next run and
     replaying a clatter on the wrong level. `stop()` now sets `ended`,
     which `landPebble` already checks.
  2. `sanitizeName` carried a control-char regex written with literal
     bytes (made the file binary to grep); rewritten with proper escapes
     and whitespace collapsing so "Bob Smith"/"Anne-Marie" survive intact.
  3. A wall-at-your-feet throw (dist ≈ 0) played the whoosh buffer at the
     1.4x rate clamp — an audible squeak for a pebble that never flew.
     Whoosh now skipped under 0.3 m.
  4. `#board`/`#name-prompt` weren't in the gesture isUi list — a tap on
     the leaderboard during the results screen could advance to the next
     level. Added to the selector.
  5. `pointerCancel` didn't reset the drag gate — a cancelled drag could
     leak turn-emitting `dragging` state into the next touch.
  6. Board time showed `0:60` for durations like 59.7 s (secs rounded
     without a minute carry); name input maxlength (24) disagreed with
     NAME_MAX (16).
- Validation: `npx tsc --noEmit` clean; `vitest` 102/102 pass (new
  whitespace/hyphen name assertions included); `vite build` + SW clean.
- Limitations: a pebble thrown then paused mid-flight still lands (the
  throw is physical — it can't un-throw); a run ranking below top-5 saves
  but shows no visible highlight row.

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

## 2026-10-24T23:55:00+05:30 — Directional audio cues for beacon + creature

- Changed: `src/audio/engine.ts` new `stereoAt()` StereoPanner helper
  exaggerating left/right from relative angle. `src/audio/sources.ts`
  `PositionalLoop` now chains stereo boost after the HRTF panner.
  `src/game/loop.ts` — one-shot positional sounds get stereo boost; beacon
  gains 1.8× when |rel| < ~34° (wind is fullest when aimed at the exit);
  periodic positional growl ticks during hunt (1.4 s) and investigate (3 s).
  `src/levels/hold.ts` — intro teaches heartbeat=closeness, growls=direction.
- Why: HRTF panning alone gave no usable direction on speakers and has a
  front/back cone of confusion; players couldn't tell where the exit or
  creature was. Heartbeat only encoded distance.
- Validation: `tsc` clean; 54/54 tests; `vite build` clean.
- Limitations: perceptual clarity unverified until on-earphone playtest.

## 2026-10-25T00:20:00+05:30 — Walls level forgiveness pass

- Changed: `src/levels/walls.ts` gap widened 2→3 cells centred on the
  player (~45° silent notch vs ~15°), intro/hints now teach "knock = wall,
  chime = gap". `src/audio/echo.ts` off-axis opening hint 0.16→0.32 gain so
  sweeping audibly steers toward the gap; echo bins and off-axis cue get
  the stereo boost; ahead-chime delayed to 90 ms to clear the click.
- Why: physics was correct but unforgiving — a 15° notch was easy to skip
  past while sweeping, the guide cue was inaudible, and walking through
  gave only 0.5 m margin before a bump.
- Validation: `tsc` clean; 54/54 tests; `vite build` clean; echotest dump
  shows ±15° bins near-silent (amp ≤0.02) when facing the gap.
- Limitations: none known; notch width tuned for tutorial forgiveness.

## 2026-10-25T01:30:00+05:30 — Batch D: Draw a Room + Hunter Mode

- Added `src/custom/codec.ts` — drawn-room codec (deflate→base64url in
  `?custom=`), deterministic meta generation (rt60 from size, spawn heading
  facing away from nearest exit, calm creature profile, fixed narration) and
  parser+BFS validation statuses.
- Added `src/draw/editor.ts` — `/draw` grid editor (16×12 default, 10–24 ×
  8–16), stone border with exit exceptions, 8-tool palette, click/drag
  painting (mouse+touch), undo + Ctrl+Z, clear, live validation, Play-here,
  QR/link sharing (qrcode lib), Supabase `levelCustom` send, last-5 recents.
- Added `src/game/hunter.ts` — HunterLink phone-side authority: claim/busy,
  10 msg/s token bucket, 5 s silence → AI hand-back, stale-claim lapse.
- Changed `src/game/creature.ts` — hearClick/hearFootstep return the heard
  position (footsteps now share the click Gaussian error — see NOTES.md);
  `puppet` flag + `driveTo` A* movement at investigate/hunt speed.
- Changed `src/spectate/net.ts` — phone receives `hunter`/`levelCustom`,
  broadcasts `hear`/`hunterAck`; watch side can send and receives them.
- Changed `src/spectate/watch.ts` — hunter role + Hunt button, single-hunter
  ack, fog view (no player, hearing ripples fading 3 s), `V` fog toggle for
  projectors, custom-map decode for drawn rooms.
- Changed `src/game/loop.ts` — hunter-driven creature while linked, ripples
  broadcast from hearing, hunter intro line, `hunted` on the recording.
- Changed `src/main.ts` — `/draw` route, `?custom=` ingest, levelCustom
  pending-room offer on menu/results/pause, "Draw a room" picker entry,
  hunter message routing. `src/replay/*` — ripples + "Hunted by a person".
- Added tests: `tests/custom.test.ts` (codec round-trip, 2000-char URL cap,
  validation statuses, rt60/heading) and `tests/hunter.test.ts` (claim
  rules, hand-back/retakeover, rate cap, ripple=hearing-rule reuse,
  driveTo catch).
- Deps added: `fflate`, `qrcode`, `@types/qrcode`.
- Validation: `tsc` clean; 78/78 tests; `vite build` clean.
- Limitations: Supabase realtime paths untested end-to-end pending env
  vars on Vercel; /draw needs the Vercel rewrite for direct links.

## 2026-10-25T02:00:00+05:30 — Declutter the desktop visual UI

- Changed: `src/debug/overlay.ts` — visual-mode HUD chips trimmed to
  heard/creature/heading (engine internals only in non-visual debug mode);
  dead dbg-caption element removed. `src/game/loop.ts` — extras slimmed
  accordingly. `src/main.ts` — key hints merged into the status pill (one
  element at top), separate `#keys-help` bar removed; level picker split
  into a levels row + a dimmer utility row (Calm, Draw). `src/style.css` —
  matching layout updates.
- Why: during desktop play the screen had status pill + hint bar + ~10
  stat chips + room code + caption all floating at once.
- Validation: `tsc` clean; 78/78 tests; `vite build` clean.
- Limitations: none.

## 2026-10-25T02:30:00+05:30 — Debug map hidden by default

- Changed: `src/main.ts` — overlay no longer force-shown at menu or level
  start; it opens only via ` (backquote) or `?debug=1`. Menu map preview
  renders only while the overlay is open. `src/input/keyboard.ts` — tuning
  panel moved to its own key (T) so ` gives just the map.
- Why: the always-on debug HUD cluttered the screen when not needed.
- Validation: `tsc` clean; 78/78 tests; `vite build` clean.
- Limitations: none.

## 2026-10-25T03:05:00+05:30 — The Hold rebalance + beacon aiming clarity

- Changed: `src/game/creature.ts` — footsteps can no longer trigger a hunt
  (only clicks within huntEnter can); during a hunt the creature charges the
  last *heard* position and footsteps no longer re-target it; a 4 s
  `huntCooldownSec` after every hunt opens an escape window; wander targets
  never pick a cell within 1.5 m of the player; `targetPos` getter added.
  `src/levels/hold.ts` — investigate speed 1.0 → 0.9 (below walk speed) and a
  new intro line teaching the escape rule. `src/game/loop.ts` — positional
  state cues: a low curious grunt on investigate-enter and a soft exhale when
  a hunt ends ("it lost you"); `playPositional` gains a playbackRate param.
  `src/audio/sources.ts` + `loop.ts` — the beacon's aiming reward is now a
  smooth cos² gain curve *and* brightens the occlusion filter (1500 → 5000 Hz)
  as you face the apparent source, so "aimed at it" is clearly distinct, not
  just louder.
- Why: sim traces showed the old rules were mathematically unwinnable —
  head-on corridor passes let footsteps trigger hunts at 1.35 m/s vs 1.1
  walk with no escape window (all 8 seeds died at t≈8 s). The aimed wind
  was also not audibly distinct when occluded.
- Validation: new `tests/hold.test.ts` — scripted "competent player" (walks
  the exit path, clicks only when the creature is >8 m away, per the taught
  heartbeat rule) now wins 8/8 seeds; unit tests for footsteps-never-hunt,
  mid-hunt re-target suppression, hunt cooldown, and re-hunt after cooldown.
  Full suite 82/82, `tsc` + `vite build` clean.
- Limitations: human play remains scarier than the deterministic bot (real
  players click when they shouldn't); balance validated by simulation, not
  yet by a fresh blind playtest.

## 2026-10-25T03:40:00+05:30 — Real landing/menu screen

- Changed: `src/main.ts` — new `#menu` screen shown in the menu phase on
  every device: ECHO wordmark, one-line pitch ("A game played in total
  darkness, by sound alone"), the cue legend (knock/chime/wind), the level
  picker moved inside it, and a pulsing "pick a level / press Space" CTA.
  The bare status pill no longer doubles as the menu (status is quiet
  unless a message needs it, e.g. an incoming drawn room). The menu hides
  on play/results and returns on the menu phase. `src/style.css` — menu
  styling; the picker now flows inside the panel instead of floating at
  the bottom; room code stays above the menu for /watch setup.
- Why: after the boot tap users landed in a black void with a dim pill and
  loose floating buttons — nothing said what the game was or what to do.
  (The tuning panel was already hidden by default; T toggles it.)
- Validation: `tsc` clean; 82/82 tests; `vite build` clean.
- Limitations: none.

## 2026-10-25T04:10:00+05:30 — Atmosphere pass (grain, vignette, drone)

- Changed: `src/style.css` — animated film grain (feTurbulence, ~3% opacity)
  and a breathing radial vignette over the whole app; a rare ~120 ms title
  flicker every 14 s on boot/menu/watch headings; slower fade transitions
  (0.9 s); a dimmer, slower sonar ping behind the menu. `src/main.ts` — a
  low room-tone drone under the menu only: detuned 46/46.8 Hz sines plus
  the breathing loop at 0.45× speed, ~5% gain, fading in/out with the menu.
- Why: make the whole site feel quietly unsettling through atmosphere —
  texture, darkness, and a felt-not-heard tone — not themed decoration.
- Validation: `tsc` clean; `vite build` clean.
- Limitations: the drone needs the post-tap audio context (menus only,
  never during play so it can't mask game cues).

## 2026-10-25T04:25:00+05:30 — Doc accuracy pass (template compliance)

- Changed: `SUBMISSION.md` — final implementation SHA `879127b`, test count
  82/82 with the real suite description, limitations corrected (Vercel is
  deployed; removed the stale "requires login" note), libraries updated
  (fflate, qrcode). `README.md` — 82 tests, full key list (`M`, `T`, ` map),
  Calm mode listed, stale "deploy not performed" removed. `DEMO.md` —
  backquote/T key descriptions corrected. `AI_USAGE.md` — rows added for
  the post-build sessions (playtest fixes, Batch D, Hold rebalance, UI work).
- Why: AGENTS.md requires docs to match the submitted code and record real
  checks — several entries had drifted (SHA, test counts, deploy status).
- Validation: documentation diff review; no code changed.
- Limitations: none.

## 2026-10-25T04:45:00+05:30 — PWA update takeover fix

- Changed: `vite.config.ts` — `workbox.skipWaiting` + `clientsClaim` so a new
  service worker activates immediately instead of waiting for all old-version
  tabs to close (the cause of users seeing stale builds after deploys).
- Why: deployed UI changes appeared missing because the old SW kept serving
  the cached shell.
- Validation: `vite build` regenerates the SW with the new flags.
- Limitations: tabs already open still need one reload to pick this up.

## 2026-10-25T05:00:00+05:30 — Fix permanently-visible tuning panel

- Changed: `src/style.css` — added `#tuning-panel.hidden` and
  `#debug-overlay.hidden { display: none }`. There was never a global
  `.hidden` rule — only `.screen.hidden` and `#menu.hidden` existed, so
  the tuning panel was visible on every page since it was added (the
  overlay was saved by its no-op render + zero-size container).
- Why: the panel was supposed to open only via `T`.
- Validation: `vite build` clean; panel hidden until `T` toggles it.
- Limitations: none.

## 2026-10-25T05:20:00+05:30 — Deeper horror atmosphere pass

- Changed: `src/style.css` — two large soft shadow masses (`.fog`) that drift
  slowly across every screen; denser grain (4.5%) and a deeper breathing
  vignette; faint chromatic edge-split on the ECHO titles; irregular menu
  sonar rings (three different periods — something circling); slower,
  dimmer CTA pulse. `src/main.ts` — `.fog` layer added; the room-tone drone
  now also runs under the results screen; random distant ambience while the
  menu is up: every 4–13 s a deep knock (pitched-down drip), a sigh, or a
  far-off growl rumble, panned to a random side via the stereo layer.
- Why: user wanted the whole site to feel spooky — achieved through
  darkness, texture and sound (implied presence), no themed decoration.
- Validation: `tsc` clean; `vite build` clean.
- Limitations: ambience only on menu/results — never during play, so game
  cues stay clean.

## 2026-10-25T05:30:00+05:30 — Watermark

- Changed: `index.html`, `src/style.css` — a small `caine × devin` mark in
  the bottom-left corner on every route (game, /watch, /draw); dim cyan,
  non-interactive.
- Validation: `vite build` clean.
- Limitations: none.

## 2026-10-25T05:45:00+05:30 — Room code visibility

- Changed: `src/main.ts` — when the spectator connection fails, the corner
  now reads "spectator off" instead of staying blank (silence was
  indistinguishable from "code too dim to spot"). `src/style.css` — room
  code opacity 0.4 → 0.75 and slightly larger so it survives the darker
  vignette.
- Validation: `vite build` clean.
- Limitations: the code still only exists after the boot tap (the channel
  connects inside the first gesture).

## 2026-10-25T06:00:00+05:30 — Watermark findable

- Changed: `src/style.css` — `#wm` opacity 0.35 → 0.55, cyan-dim → cyan,
  0.68rem → 0.72rem. It was deployed but effectively invisible.
- Validation: deployed HTML confirmed to contain `#wm`; visual only.

## 2026-10-25T06:55:00+05:30 — Batch E: pebble throws + projector leaderboard

- **D3 Throw a Pebble** (`src/game/pebble.ts`, `gestures.ts`, `keyboard.ts`,
  `synth.ts`, `loop.ts`, `recorder.ts`, `render.ts`, `results.ts`, `net.ts`,
  `watch.ts`, `hold.ts`, `codec.ts`, `script.ts`, `main.ts`): creature
  levels gain a 3-per-run pebble — flick up (phone) or `Q` (desktop), 800
  ms cooldown. Landing = DDA ray 6 m max, 0.3 m before the first solid,
  never inside solid. Flight whoosh pans/fades along the path; landing
  plays a material clatter (stone/wood/sacks wall, floor skitter, water
  splash) through the same propagation/occlusion model. The creature hears
  it exactly like a click at the landing (shared `hearClick`; ripple
  identical for hunters). Two-note count earcon pitch-drops as pebbles run
  out; empty pouch plays a dull tick. New drag gate: turning only starts
  past 10 px dominant horizontal — a flick applies zero turn and never
  clicks. Recorder `throw` event + `pebbles` counter; replay/`/watch` draw
  a dashed amber arc + landing ring (hunter fog shows only the ripple);
  results show pebbles used. Hold + creature-custom intros teach the
  gesture; objective repeat includes pebbles left.
- **D4 Projector Leaderboard** (`src/spectate/leaderboard.ts`,
  `boardui.ts`, `watch.ts`, `main.ts`, `style.css`): localStorage boards
  keyed `levelId` / `custom:<map-hash>` with `:calm` suffix — calm and
  normal runs never mix. Ranking escaped → faster → fewer clicks; top 20
  kept, top 5 shown. `/watch` shows a "Name this player" overlay on each
  finished run (Enter saves, Esc discards); laptop-local runs prompt on the
  results screen (visual mode only). `L` toggles the panel, auto-shows 10 s
  after a save with the entry highlighted, new #1 fires a sting + NEW
  RECORD banner (3 s), `Shift+L` clears after confirm. Recording carries
  `assist`/`customHash` so remote runs key correctly.
- Validation: 102/102 vitest (20 new: landing math, creature parity, pouch,
  flick classifier, ranking/keying/sanitize/cap), `tsc` clean,
  `vite build` clean.
- Limitations: the whoosh stretches a fixed 0.45 s buffer rather than
  tracking the throw; leaderboard is single-device (no cross-laptop sync,
  per spec); the naming prompt on local runs appears only in visual mode.
