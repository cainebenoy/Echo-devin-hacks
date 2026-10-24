# DEMO — exact steps

## Setup

1. Deploy to Vercel (`npx vercel --prod`) with `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` set for spectator mode, or run `npm run dev` locally.
2. Laptop on the projector, open `https://<deploy>/watch`.
3. Phone (wired earphones), open `https://<deploy>/?level=walls`.
4. Tap the boot screen once — this unlocks audio, motion sensors, and the wake
   lock, and shows a **4-digit room code**. Enter it on the laptop's `/watch`
   page.

## The demo

1. **Blindfold the judge.** Hand over the phone and earphones.
2. The room watches the live map on `/watch` — player dot, heading cone, click
   rings, and the echo lines showing *what the judge hears*.
3. The judge taps to click, physically turns, and walks (two-finger hold)
   toward the silent gap in the wall.
4. When they reach the exit: the phone shows the **results screen** and
   `/watch` automatically plays the full replay — the path, every click, and
   every echo hit.
5. If time allows: `?level=hold` — the creature that hunts by sound. Watch it
   investigate every click on the projector while the judge tries to sneak
   out. (On `/watch`, press `C` to hide/show the creature.)

## Backup

- Desktop: `Space` = click, `W`/`S` = walk, `A`/`D` or mouse = turn,
  `H` = hint, `M` = voice, `Esc` = pause, `` ` `` = debug map,
  `T` = tuning sliders.
- A pre-recorded run video covers total network/device failure.

## Draw a room (Batch D)

1. Judge B opens `https://<deploy>/draw` on any device.
2. Paint a room: walls/materials/water, exactly one Start, exits on the edge,
   optional Creature. The status line turns **Ready** when it's solvable.
3. Get it to the player, any of:
   - **Play here** — starts it on the same device immediately.
   - **QR / link** — the encoded `?custom=` URL; works fully offline.
   - **Send to phone** — enter the phone's 4-digit room code; the phone
     narrates "A new room has been drawn for you. Tap to enter." at the menu,
     results screen or pause menu (never mid-run).

## Hunter mode (Batch D)

1. Phone in the room, room code visible. Needs a creature level (`?level=hold`
   or a drawn room with `C`).
2. Judge B opens `https://<deploy>/watch`, enters the code, clicks **Hunt the
   player** — they get a fogged map: walls, water, the creature, and fading
   ripples where it heard sounds. The player is invisible.
3. Tapping the map sends a target cell; the creature A*-walks there at
   investigate speed (hunt speed when the target is within 7 m of the
   player). If the hunter goes quiet for 5 s the AI silently takes back over.
4. Projector trick: `V` toggles the fog on a spectator `/watch`, so one
   laptop can show the hunter's view. Results show "Hunted by a person".
