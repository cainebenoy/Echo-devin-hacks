# AI usage record

AI assistance during the hackathon is documented below.

## Event build log

| Date and time with timezone | Tool / model, if known | Task | Assistance and affected files | Human review / corrections | Validation and result |
| --- | --- | --- | --- | --- | --- |
| 2026-10-24 ~20:30–21:15 +05:30 | Devin (SWE-2 High) | Full implementation of ECHO_SPEC.md: Vite+TS scaffold, world core (DDA raycast, LOS, collision, BFS/A*, propagation), procedural audio engine + echo model, input (gestures, rotation-matrix heading, keyboard, steps), player/creature/game loop, narrator, replay, spectator, debug tools, levels, tests, PWA | Wrote essentially all of `src/`, `tests/`, build config, `NOTES.md`, `DEMO.md` | Reviewed; fixed test fixtures (missing `P`/`E`, ragged sandbox rows), creature-wander test flake, `lru-cache` dependency breakage after interrupted `npm install` | `npm test` 54/54 pass; `npm run build` clean; `vite preview` smoke check 200s |
| 2026-10-24 ~21:15 +05:30 | Devin (SWE-2 High) | Template-repo migration + screenshots | Copied project into template fork; `scripts/screenshots.ts` renders real level/echo data to PNG; filled README/SUBMISSION/AI_USAGE/CHANGELOG | Pending | Screenshots visually verified; docs placeholders replaced |
| 2026-10-24 ~22:00–24:00 +05:30 | Devin (SWE-2 High) | Playtest-driven fixes across several sessions | Desktop input routing (Space/A-D/W-S), forward-focused echo design with chime-vs-knock cues, narration skip/mute, level picker, stereo-exaggerated positional audio, beacon audibility floor, creature "stuck" fix, heartbeat/growl proximity+direction cues, Walls gap widening, Calm assist mode | Human playtest reports drove every change; user verified each fix live | `npm test` + `vite build` clean each commit; scripted level audit (A* walk of all maps + beacon-floor table) |
| 2026-10-25 ~00:00–01:30 +05:30 | Devin (SWE-2 High) | Batch D: `/draw` room editor + Hunter mode | Custom-room codec (fflate, <2000-char URLs), canvas editor with live BFS validation, QR/link/Supabase delivery, last-5 local rooms, hunter claim/rate-cap/fog-ripples/AI-fallback, narration + results labeling | Reviewed; supplied Supabase project URL + anon key | 24 new tests (codec, validation, hunter rules); 78/78 suite pass; build clean |
| 2026-10-25 ~02:00–04:15 +05:30 | Devin (SWE-2 Max) | Hold rebalance, UI declutter, menu + atmosphere | Footsteps-never-charge hunt rules, hunt cooldown, creature state audio cues, scripted Hold beatability sim (1/8 → 8/8 seeds); HUD declutter; debug map hidden by default (`` ` ``/T split); landing/menu screen; grain/vignette/flicker/menu drone | User reports ("impossible", "cluttered") drove the work | `tests/hold.test.ts` sim + mechanics tests; 82/82 suite; build clean |
| 2026-10-25 ~06:00–07:00 +05:30 | Devin (SWE-2 Max) | Batch E: Throw a Pebble (D3) + Projector Leaderboard (D4) | Wrote `src/game/pebble.ts`, `src/spectate/leaderboard.ts`, `boardui.ts`, new synth recipes (whoosh/clatters/skits/splash/count/empty), `tests/pebble.test.ts`, `tests/leaderboard.test.ts`; extended gestures (flick + drag gate), loop, recorder, renderer, watch, codec, narration | User supplied the Batch E spec verbatim | `npm test` 102/102; `npm run build` clean |
| 2026-10-25 ~07:15 +05:30 | Devin (SWE-2 Max) | Batch E self-review: edge-case fixes | Found + fixed 6 issues: stale pebble landing on discarded sessions, control-byte regex in `sanitizeName`, whoosh squeak at 0-dist, leaderboard/name-prompt taps leaking into gestures, drag-gate reset on pointerCancel, `0:60` board time + maxlength mismatch | AI-initiated review pass; human-reviewed diff | `npx tsc --noEmit` clean; `vitest` 102/102; `vite build` clean |
| 2026-10-25 ~07:45 +05:30 | Devin (SWE-2 Max) | Leaderboard robustness + editable entries | User reported leaderboard issues; fixed flash lingering over gameplay, silent prompt discards (now queued), `L` fallback `custom:<hash>` resolution, `at`-identity collisions; added row rename/remove (`renameEntry`/`removeEntry`) | User reported the issues + requested entry editing | `npx tsc --noEmit` clean; `vitest` 104/104; `vite build` clean |
| 2026-10-25 ~08:00–08:30 +05:30 | Devin (Gemini 4 Argon Medium) | O-origin sonar, Shift+L fix, Start gate, leaderboard dismiss, Hold audio declutter | Moved sonar rings inside the O of ECHO with capped scale + core pulse; fixed Shift+L fallback key & hidden-input focus trap; added `#ready-gate` Start button (`phase = 'intro'`, `session.armed`) so round-entry taps never fire a fake click; added Save/Skip/×/backdrop-close on `#name-prompt` and ×/Esc on `#board`; rebalanced Hold hunt mix (lower heartbeat bpm/gain, wider growl spacing, lower breathing/drip gain, higher beacon floor) | User reported each issue from playtests | `npx tsc --noEmit` clean; `vitest` 104/104; `vite build` clean |
| 2026-10-25 ~03:10 +05:30 | Devin (SWE-2 Max) | Mobile feel pass + doc timestamp corrections | Gyro EMA snap-band (0.12°) + baseline re-capture at Start press; tap window 250→350 ms, swipe 450→900 ms; haptics on click/throw/pause; device-aware Start-gate hint; persisted walk-in-place toggle; corrected 43 inflated changelog timestamps against `git log` | User asked for a smoother mobile experience | `npx tsc --noEmit` clean; `vitest` 110/110; `vite build` clean |

## Template preparation

This historical preparation note refers to the older template. It does not define Devin Hack Kochi's event rules or AI tool requirements.

On 10 October 2026, Codex prepared this documentation template from the
organizer's supplied rules. This record covers participant AI usage above.

## Event documentation correction — 2026-10-24T21:53:05+05:30

- Tool: Codex.
- Task: correct the organizer-shared template to Devin Hack Kochi and clarify
  that the event has no major AI usage constraints.
- Affected files: `.github/pull_request_template.md`, `AGENTS.md`, `AI_USAGE.md`, `CHANGELOG.md`, `README.md`, `RULES.md`, `SUBMISSION.md`.
- Human review: pending maintainer review of this pull request.
- Validation: documentation diff, whitespace, and local Markdown link checks;
  no application code changed and no runtime checks were needed.

## Review-driven hardening pass — 2026-10-25T03:10:00+05:30

- Tool: Devin (SWE-2 Max).
- Task: verify and fix an external code review's findings (18 items across
  input handling, /draw editor, spectator transport, leaderboard, narrator,
  storage guards, PWA update safety).
- Assistance: verified each finding against source, implemented fixes, added
  regression tests (caught-ranking, Anonymous merge, narrator interrupt).
- Human review: changes reviewed via git diff; commit 63a64c5.
- Checks: `npx tsc --noEmit` clean, `vitest` 110/110 (13 files), `vite build`
  clean. Not browser-verified on this machine.
