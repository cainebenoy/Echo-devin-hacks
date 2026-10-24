# Project submission

## Project

- **Project name:** Echo
- **Short description:** A game played in total darkness by sound alone. The
  phone screen stays black; the player taps to click, hears 3D echoes of a
  simulated space through wired earphones, turns by physically turning, and
  finds the exit — while a creature hunts them by the same sounds. Built for
  players and for demos where the audience watches the blindfolded player on a
  projector (`/watch`). Helps demonstrate real-world human echolocation.
- **Code repository URL:** https://github.com/cainebenoy/Echo-devin-hacks
- **Final submitted implementation commit SHA:** `5dcbdf6` (implementation
  complete as of this commit; later commits are docs-only).
- **Working demo URL or local demo steps:** https://echo-devin-hacks.vercel.app/
  (spectator: `/watch`, room editor: `/draw`, hunter mode: `/watch?role=hunter`).
  Local: `npm install && npm run dev`. Demo flow in [DEMO.md](DEMO.md).
- **Demo access requirements:** phone + wired earphones for the intended
  experience; desktop keyboard fallback works in any modern browser. Supabase
  env vars only needed for spectator/hunter/phone-delivery (`/draw` QR links
  work fully offline).

## Participants

| Participant name | GitHub handle | Contribution |
| --- | --- | --- |
| Caine Benoy | cainebenoy | Direction, testing, integration |

## Run and demonstrate

- **Prerequisites and versions:** Node.js 20+, npm 10+.
- **Install command:** `npm install`
- **Required environment variable names:** none required; optional
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for `/watch` (`.env.example`).
- **Start command:** `npm run dev`
- **Demo walkthrough:** open `/watch` on a projector, `/?level=walls` on a
  phone, enter the 4-digit room code, blindfold the player; the audience
  watches clicks and echo lines live. Full script in [DEMO.md](DEMO.md).
- **Checks performed and results:** `npm test` — 102/102 pass (level validation,
  DDA/LOS/collision, BFS/A*/propagation, echo math, creature hearing/hunt/
  catch/cooldown, a scripted Hold beatability simulation, custom-room codec/
  validation, hunter claim/rate-cap/fallback, gesture state machine +
  flick classifier, pebble landing/hearing parity, leaderboard ranking/
  keying/cap, orientation yaw). `npm run build` — clean typecheck +
  production build + service worker.
- **Known limitations or incomplete features:** real-device iOS/Android
  playtest pending (spec §14); portrait lock unavailable on iOS Safari
  (heading math unaffected); live Supabase spectator/hunter paths verified
  by code review and unit tests but need a two-device live run. See
  [NOTES.md](NOTES.md).
- **Libraries, APIs, and public datasets used:** Vite, TypeScript, Vitest,
  vite-plugin-pwa, @supabase/supabase-js, fflate, qrcode; Web Audio /
  Web Speech / deviceorientation / wake-lock / vibration browser APIs.
  No datasets or assets — all audio is synthesized.
- **AI usage record:** [AI_USAGE.md](AI_USAGE.md)
- **Development change log:** [CHANGELOG.md](CHANGELOG.md)

## Submission checklist

- [x] The project implementation started from scratch at the event.
- [x] I participated solo or with no more than 4 team members in total.
- [x] AI assistance was used during development and its usage is documented.
- [x] The code repository URL, short description, and working demo are provided.
- [x] README setup and demo instructions match the submitted code.
- [x] Actual checks and known limitations are documented.
- [x] Meaningful changes are documented and committed throughout development.
- [x] The final implementation is committed and pushed, and its SHA is recorded above.
- [x] No credentials or private data are included in the repository or demo instructions.
- [ ] The organizers' announced submission method and timing have been followed.
