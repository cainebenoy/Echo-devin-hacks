# Echo

A game played in total darkness, by sound alone. The phone screen stays black
during play. The player taps to make a click, hears the echoes of a simulated
space in 3D audio through wired earphones, turns by physically turning the
phone, and must find the exit — later, while something hunts them by sound.

Built for **Devin Hack Kochi** (see
[RULES.md](RULES.md), [AGENTS.md](AGENTS.md)). Full design spec:
[ECHO_SPEC.md](ECHO_SPEC.md). Demo script: [DEMO.md](DEMO.md). Spec deviations:
[NOTES.md](NOTES.md).

## Project overview

- **Project name:** Echo
- **Short description:** A mobile-web audio game with no visuals during play.
  Players echolocate with tap-generated clicks (a real-time raycast echo model
  over a 2D grid, rendered through HRTF-panned Web Audio), navigate by a
  sea-breeze beacon that propagates around corners, and evade a creature that
  hunts by hearing the same clicks the player relies on. A spectator view
  (`/watch`) lets an audience watch the blindfolded player's run live on a
  projector.
- **Team:** cainebenoy
- **Working demo:** https://echo-devin-hacks.vercel.app/ — phone + wired
  earphones for the real experience; desktop keyboard fallback. Spectator
  view at `/watch`. See [DEMO.md](DEMO.md).
- **Technology stack:** Vite + TypeScript (no UI framework, plain DOM +
  Canvas 2D), Web Audio API (all sounds procedurally synthesized), Web Speech
  API narration, Supabase Realtime broadcast for spectator mode (optional),
  Vitest + `vite-plugin-pwa` (offline after first load).

### Run the project

1. Prerequisites: Node.js 20+ and npm 10+.
2. `npm install`
3. Environment: spectator mode needs `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (see `.env.example`); the game works fully without
   them.
4. Start: `npm run dev` (desktop backup demo: `Space` click, `W` walk, `A`/`D`
   turn, `H` hint, `Esc` pause, `` ` `` debug overlay).
5. Checks: `npm test` (54 unit tests), `npm run build` (typecheck + PWA build).
6. Screenshots: `npm run screenshots` regenerates `screenshots/` from the real
   level maps and echo model.

### Current status

- **Working features:** all five levels + sandbox, echo model with material
  reflectivity/cutoffs, beacon and creature positional audio with
  around-corner propagation, gesture state machine (tap/walk/long-press/
  three-finger/swipe), rotation-matrix phone turning with drag fallback,
  narration queue with offline-voice preference and caption+earcon fallback,
  creature AI (wander/investigate/hunt/catch), 10 Hz run recorder, results
  screen with scrub-able replay, `/watch` spectator view, PWA offline, wake
  lock, walk-in-place step detection.
- **Known limitations:** portrait lock is best-effort (unsupported on iOS
  Safari); speech depends on device voices (fallback mode documented in
  NOTES.md); Vercel deploy not yet performed (requires `vercel login`);
  real-device checklist in ECHO_SPEC.md §14 still pending.
- **Libraries, APIs, datasets:** Vite, TypeScript, Vitest, `vite-plugin-pwa`
  (workbox), `@supabase/supabase-js`. All audio synthesized at runtime; no
  assets or datasets.

## Screenshots

Top-down renders produced by `scripts/screenshots.ts` from the actual level
maps and echo computations (the player never sees these — they are what the
sound field represents):

| | |
|---|---|
| ![Walls](screenshots/level-walls.png) | ![Hold](screenshots/level-hold.png) |
| Walls — find the silent gap by echo | The Hold — the creature (red) |
| ![Hold run](screenshots/hold-run.png) | ![Godown](screenshots/level-godown.png) |
| Hold mid-run: path, click rings, echo lines | Godown — sacks, water, decoy |

See [AI_USAGE.md](AI_USAGE.md) for the AI-assistance record and
[CHANGELOG.md](CHANGELOG.md) for the development record.

## Event clarification

Devin Hack Kochi has no major AI usage constraints. Participants may use Devin and other AI tools, models, and providers; this template does not require Codex or restrict AI usage to OpenAI. AI usage notes are project documentation, not an additional event eligibility requirement.

See [RULES.md](RULES.md) for the corrected event guidance.
