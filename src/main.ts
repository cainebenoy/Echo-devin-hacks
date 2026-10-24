import './style.css';
import { engine } from './audio/engine';
import { synthesize, type SoundSet } from './audio/synth';
import { loadTuning } from './audio/tuning';
import { campaignLevels, getLevel } from './levels';
import type { Level } from './world/level';
import { GestureRecognizer, type GestureEvent } from './input/gestures';
import { OrientationTracker } from './input/orientation';
import { KeyboardInput } from './input/keyboard';
import { StepDetector } from './input/steps';
import { Narrator } from './narration/narrator';
import { MENU } from './narration/script';
import { GameSession } from './game/loop';
import { loadProgress, saveProgress, type GamePhase, type Progress } from './game/state';
import { ResultsScreen } from './replay/results';
import { SpectateNet } from './spectate/net';
import { startWatchPage } from './spectate/watch';
import { startDrawPage } from './draw/editor';
import { HunterLink, type HunterMsg } from './game/hunter';
import { decodeCustom, customDef, validateCustomMap, STATUS_TEXT } from './custom/codec';
import { boardKey, type BoardRun } from './spectate/leaderboard';
import { BoardUI, recordRun } from './spectate/boardui';
import { parseLevel } from './world/level';
import { DebugOverlay } from './debug/overlay';
import { TuningPanel } from './debug/tuning';
import type { Recording } from './replay/recorder';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

if (location.pathname === '/watch') {
  startWatchPage(app);
} else if (location.pathname === '/draw') {
  startDrawPage(app);
} else {
  boot();
}

function boot(): void {
  // ── DOM scaffold ──────────────────────────────────────────────────────
  app.innerHTML = `
    <div class="fog"></div>
    <div id="boot" class="screen">
      <h1>ECH<span class="o">O<span class="sonar"><i></i><i></i><i></i></span></span></h1>
      <p>Put on wired earphones.<br>Tap anywhere to begin.</p>
      <p class="code" id="speech-note"></p>
    </div>
    <div id="menu" class="hidden">
      <div class="menu-inner">
        <h1>ECH<span class="o">O<span class="sonar"><i></i><i></i><i></i></span></span></h1>
        <p class="tagline">A game played in total darkness, by sound alone.</p>
        <p class="howto">Send out a click — its echo paints the room.<br>Knock = wall · Chime = opening · Wind = the way out.</p>
        <div id="level-pick"></div>
        <p class="cta" id="menu-cta"></p>
      </div>
    </div>
    <div id="room-code"></div>
    <div id="status"></div>
    <div id="caption"></div>`;
  const bootEl = app.querySelector('#boot')!;
  const codeEl = app.querySelector('#room-code')!;
  const speechNote = app.querySelector('#speech-note')!;
  const captionEl = app.querySelector<HTMLElement>('#caption')!;
  const statusEl = app.querySelector<HTMLElement>('#status')!;
  const levelPick = app.querySelector<HTMLElement>('#level-pick')!;
  const menuEl = app.querySelector<HTMLElement>('#menu')!;
  const menuCta = app.querySelector<HTMLElement>('#menu-cta')!;

  const results = new ResultsScreen(app);
  const boardUi = new BoardUI(app);
  const overlay = new DebugOverlay(app);
  const tuning = loadTuning();
  const tuningPanel = new TuningPanel(app, tuning);

  // ── services ─────────────────────────────────────────────────────────
  const narrator = new Narrator();
  const orientation = new OrientationTracker();
  const steps = new StepDetector();
  const net = new SpectateNet();
  const hunterLink = new HunterLink();
  /** A drawn room broadcast to this room's channel, waiting for the player. */
  let pendingCustom: string | null = null;
  net.onHunter = (m) => handleHunterMsg(m as HunterMsg);
  net.onLevelCustom = (data) => {
    pendingCustom = data;
    // Never interrupts a run — announced when the player can accept.
    if (phase !== 'playing' && phase !== 'boot') offerPendingCustom();
  };
  const gestures = new GestureRecognizer(handleGesture);
  let sounds: SoundSet | null = null;
  let session: GameSession | null = null;
  let phase: GamePhase = 'boot';
  let progress: Progress = loadProgress();
  const levels = campaignLevels();
  let menuIdx = 0;
  let currentLevel: Level | null = null;
  let lastRec: Recording | null = null;
  let wakeLock: { release(): Promise<void> } | null = null;
  let debugOn = params.get('debug') === '1';
  if (debugOn) overlay.show(true);
  if (params.get('unlock') === '1') {
    progress.unlocked = levels.length;
    progress.finishedAll = true;
  }

  const keyboard = new KeyboardInput({
    onClick: () => {
      if (phase === 'playing') session?.click();
      else if (phase === 'menu') {
        const l = levels[menuIdx];
        if (l.meta.order <= progress.unlocked || progress.finishedAll) startLevel(l);
      }
    },
    onHint: () => { if (phase === 'playing') session?.hint(); },
    onPause: () => togglePause(),
    onDebugToggle: () => overlay.toggle(),
    onTuningToggle: () => tuningPanel.toggle(),
    onSkipSpeech: () => narrator.clear(),
    onToggleVoice: () => {
      const m = narrator.toggleMuted();
      setStatus(m ? 'Voice muted — captions only (M to enable)' : 'Voice enabled (M to mute)', phase === 'playing');
    },
    onThrow: () => { if (phase === 'playing') session?.throwPebble(); },
  });

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  menuCta.textContent = isTouch
    ? 'tap a level to begin'
    : 'pick a level — or press Space to play';
  // Visual/testing mode: live map during play. On by default on desktop,
  // or anywhere via ?visual=1 (phone stays black without it).
  const visual = params.get('visual') === '1' || (!isTouch && params.get('visual') !== '0');
  // Calm/assist mode: slower creature, duller hearing, louder beacon floor.
  let assist = params.get('assist') === '1' || localStorage.getItem('echo.assist') === '1';
  overlay.setVisual(visual);
  // In visual/desktop testing mode, default to captions-only so the robot
  // speechSynthesis voice doesn't talk over every run (press M to enable).
  if (visual && localStorage.getItem('echo.voiceMuted') === null) {
    narrator.setMuted(true);
  }

  function setStatus(text: string, keys = false): void {
    // One pill at the top: label plus a dim key row — no separate hint bar.
    statusEl.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = text;
    statusEl.appendChild(label);
    if (keys && visual) {
      const k = document.createElement('span');
      k.className = 'keys';
      k.textContent = 'Space click · W/S walk · A/D turn · Q pebble · H hint · M voice · Esc pause · ` map · T tuning';
      statusEl.appendChild(k);
    }
    statusEl.classList.toggle('on', !!text && visual);
  }

  function earcon(): void {
    if (!sounds || !engine.ready) return;
    const ctx = engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = sounds.earcon;
    const pan = engine.centred();
    src.connect(pan).connect(engine.sfxBus);
    engine.track(src);
    src.start();
  }

  narrator.wire(engine, captionEl, earcon);

  results.onRetry = () => {
    results.hide();
    if (currentLevel) startLevel(currentLevel);
  };
  results.onNext = () => {
    results.hide();
    const n = currentLevel ? nextLevel(currentLevel) : null;
    if (n) startLevel(n); else enterMenu();
  };

  // ── wake lock ─────────────────────────────────────────────────────────
  async function requestWakeLock(): Promise<void> {
    if (wakeLock) return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
      // The sentinel is released automatically on visibility change.
      if (wakeLock) {
        (wakeLock as { onrelease?: (() => void) | null }).onrelease = () => { wakeLock = null; };
      }
    } catch { /* unsupported */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && phase !== 'boot') void requestWakeLock();
  });

  // ── boot tap: unlock everything inside the gesture ───────────────────
  let booted = false;
  async function firstTap(): Promise<void> {
    if (booted) return;
    booted = true;
    engine.init();
    narrator.unlock();
    void OrientationTracker.requestPermission();
    void requestWakeLock();
    orientation.attach();
    steps.attach();
    try {
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await so.lock?.('portrait');
    } catch { /* best effort — heading math doesn't depend on it */ }

    // Synthesize all sounds (async) while the boot screen fades.
    sounds = await synthesize(engine.ctx);

    // Spectator code (optional; never blocks). Say so when it's off —
    // silence looked identical to "code too dim to spot".
    void net.connect().then((code) => {
      codeEl.textContent = code ? `room ${code}` : 'spectator off';
    });

    if (!narrator.speechAvailable) {
      speechNote.textContent = MENU.noSpeechNotice;
    }
    narrator.say('Echo.');

    gestures.attach(app);
    keyboard.attach(app);
    steps.onStep = () => session?.queueStep();

    bootEl.classList.add('hidden');
    setTimeout(() => bootEl.remove(), 800);

    const levelParam = params.get('level');
    const direct = levelParam ? getLevel(levelParam) : null;
    const customParam = params.get('custom');
    if (customParam) {
      // QR/link path: decode → validate → play, or stay on menu with an error.
      const payload = decodeCustom(customParam);
      const v = payload ? validateCustomMap(payload.map) : null;
      if (payload && v && v.status === 'ready') {
        try {
          startLevel(parseLevel(customDef(payload)));
        } catch {
          setStatus('That room link did not load — pick a level below');
          enterMenu();
        }
      } else {
        setStatus(v ? STATUS_TEXT[v.status] : 'That room link did not work');
        enterMenu();
      }
    } else if (direct) {
      // ?level=<id> jumps straight in for the demo — bypasses the lock.
      startLevel(direct);
    } else {
      enterMenu();
    }
  }

  // ── hunter mode: remote human drives the creature via this link ──────
  function handleHunterMsg(m: HunterMsg): void {
    const now = performance.now();
    if (m.t === 'claim') {
      net.hunterAck(m.id, hunterLink.claim(m.id, now) === 'accepted');
    } else if (m.t === 'release') {
      hunterLink.release(m.id);
    } else if (m.t === 'target') {
      hunterLink.onTarget(m.id, m.col, m.row, now);
    }
  }

  // ── drawn rooms received over the room channel ────────────────────────
  function offerPendingCustom(): void {
    setStatus('A new room has been drawn for you — tap to enter');
    narrator.say('A new room has been drawn for you. Tap to enter.');
  }

  function acceptPendingCustom(): boolean {
    if (!pendingCustom) return false;
    const payload = decodeCustom(pendingCustom);
    pendingCustom = null;
    if (!payload) {
      setStatus('That room could not be loaded');
      return false;
    }
    const v = validateCustomMap(payload.map);
    if (v.status !== 'ready') {
      setStatus(STATUS_TEXT[v.status]);
      return false;
    }
    results.hide();
    session?.stop();
    startLevel(parseLevel(customDef(payload)));
    return true;
  }

  // ── menu ambience: a low room-tone drone — presence, not music ──────
  let droneGain: GainNode | null = null;
  function setDrone(on: boolean): void {
    if (!sounds || !engine.ready) return;
    if (!droneGain) {
      const ctx = engine.ctx;
      droneGain = ctx.createGain();
      droneGain.gain.value = 0;
      // Air: the breathing loop at half speed reads as room tone.
      const air = ctx.createBufferSource();
      air.buffer = sounds.breathing;
      air.loop = true;
      air.playbackRate.value = 0.45;
      // Sub-bass: two detuned sines beat ~0.8 Hz — a subliminal pulse.
      const og = ctx.createGain();
      og.gain.value = 0.5;
      const a1 = ctx.createOscillator();
      a1.type = 'sine';
      a1.frequency.value = 46;
      const a2 = ctx.createOscillator();
      a2.type = 'sine';
      a2.frequency.value = 46.8;
      air.connect(droneGain);
      a1.connect(og);
      a2.connect(og);
      og.connect(droneGain);
      droneGain.connect(engine.ambienceBus);
      air.start();
      a1.start();
      a2.start();
    }
    droneGain.gain.setTargetAtTime(on ? 0.05 : 0, engine.ctx.currentTime, 1.2);
  }

  // ── menu ambience: distant sounds emerging from the dark ────────────
  let ambientTimer = 0;
  let ambientOn = false;
  function scheduleAmbient(): void {
    clearTimeout(ambientTimer);
    ambientTimer = window.setTimeout(() => {
      if (phase === 'menu' && sounds && engine.ready) {
        const ctx = engine.ctx;
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        const rel = (Math.random() * 2 - 1) * 2.2;
        const pick = Math.random();
        if (pick < 0.5) {
          // A deep knock — the drip pitched far down.
          src.buffer = sounds.drip;
          src.playbackRate.value = 0.55 + Math.random() * 0.35;
          g.gain.value = 0.06 + Math.random() * 0.07;
        } else if (pick < 0.82) {
          // A sigh in the walls.
          src.buffer = sounds.breathing;
          src.playbackRate.value = 0.5;
          g.gain.value = 0.09;
        } else {
          // Something far off.
          src.buffer = sounds.growl;
          src.playbackRate.value = 0.5 + Math.random() * 0.2;
          g.gain.value = 0.06;
        }
        src.connect(g).connect(engine.stereoAt(rel)).connect(engine.ambienceBus);
        engine.track(src);
        src.start();
      }
      if (phase === 'menu') scheduleAmbient();
    }, 4000 + Math.random() * 9000);
  }
  function setAmbient(on: boolean): void {
    if (on && !ambientOn) { ambientOn = true; scheduleAmbient(); }
    else if (!on) { ambientOn = false; clearTimeout(ambientTimer); }
  }

  // ── audio menu ────────────────────────────────────────────────────────
  function renderLevelPick(): void {
    const show = phase === 'menu';
    menuEl.classList.toggle('hidden', !show);
    setDrone(show || phase === 'results');
    setAmbient(show);
    levelPick.classList.toggle('on', show);
    levelPick.innerHTML = '';
    if (!show) return;
    const rowLevels = document.createElement('div');
    rowLevels.className = 'pick-levels';
    levels.forEach((l, i) => {
      const b = document.createElement('button');
      const locked = !visual && !(l.meta.order <= progress.unlocked || progress.finishedAll);
      b.textContent = `${l.meta.order}. ${l.meta.name}`;
      b.className = i === menuIdx ? 'sel' : '';
      if (locked) b.classList.add('locked');
      b.onclick = () => {
        menuIdx = i;
        menuStatus();
        if (!locked) startLevel(l);
      };
      rowLevels.appendChild(b);
    });
    const rowUtils = document.createElement('div');
    rowUtils.className = 'pick-utils';
    const calm = document.createElement('button');
    calm.textContent = assist ? 'Calm: on' : 'Calm: off';
    calm.className = assist ? 'sel' : '';
    calm.onclick = () => {
      assist = !assist;
      localStorage.setItem('echo.assist', assist ? '1' : '0');
      renderLevelPick();
    };
    rowUtils.appendChild(calm);
    const draw = document.createElement('button');
    draw.textContent = '✎ Draw a room';
    draw.onclick = () => { location.href = '/draw'; };
    rowUtils.appendChild(draw);
    levelPick.appendChild(rowLevels);
    levelPick.appendChild(rowUtils);
  }

  function menuStatus(): void {
    const l = levels[menuIdx];
    const locked = !visual && !(l.meta.order <= progress.unlocked || progress.finishedAll);
    setStatus(''); // the menu screen carries the info — keep the top quiet
    renderLevelPick();
    if (overlay.visible) {
      overlay.render(l, {}, engine.ready ? engine : null, { menu: locked ? 'locked' : 'unlocked' });
    }
  }

  function announceLevel(): void {
    const l = levels[menuIdx];
    menuStatus();
    if (l.meta.order <= progress.unlocked || progress.finishedAll) {
      narrator.interrupt(MENU.levelName(l.meta.order, l.meta.name));
    } else {
      narrator.interrupt(`${MENU.levelName(l.meta.order, l.meta.name)} ${MENU.locked}`);
    }
  }

  function enterMenu(): void {
    phase = 'menu';
    boardUi.hide(); // a lingering leaderboard flash must not ride into the menu
    menuIdx = Math.min(menuIdx, levels.length - 1);
    const l = levels[menuIdx];
    menuStatus();
    narrator.say(MENU.intro(l.meta.order, l.meta.name));
  }

  // ── level lifecycle ───────────────────────────────────────────────────
  function startLevel(level: Level): void {
    if (!sounds) return;
    session?.stop();
    boardUi.hide(); // a lingering leaderboard flash must not cover gameplay
    currentLevel = level;
    phase = 'playing';
    renderLevelPick();
    setStatus(`Level ${level.meta.order} — ${level.meta.name}`, true);
    session = new GameSession({
      engine,
      sounds,
      tuning,
      narrator,
      orientation,
      keyboard,
      steps,
      net,
      overlay,
      isTouch,
      assist,
      hunter: hunterLink,
      onEnd: onRunEnd,
    });
    session.start(level);
  }

  function onRunEnd(outcome: 'win' | 'caught', rec: Recording): void {
    lastRec = rec;
    phase = 'results';
    renderLevelPick(); // hides the menu screen
    setStatus(outcome === 'win' ? 'Results — escaped' : 'Results — caught');
    if (visual) overlay.show(false);
    const l = currentLevel!;
    if (outcome === 'win' && l.meta.order < 90) {
      progress.unlocked = Math.max(progress.unlocked, Math.min(levels.length, l.meta.order + 1));
      if (l.meta.order >= levels.length) progress.finishedAll = true;
      saveProgress(progress);
    }
    const next = nextLevel(l);
    results.show(rec, l, outcome === 'win' && next !== null);
    // Runs played on the laptop itself feed the projector leaderboard
    // (same localStorage /watch reads). Phone runs arrive via broadcast —
    // and the blindfolded player never types.
    if (visual && rec.outcome) {
      const key = boardKey({ levelId: rec.levelId, customHash: rec.customHash, assist: rec.assist });
      const run: BoardRun = {
        levelId: rec.levelId,
        customHash: rec.customHash,
        outcome: rec.outcome,
        duration: rec.duration,
        clicks: rec.clicks,
        pebbles: rec.pebbles ?? 0,
        assist: !!rec.assist,
        hunted: !!rec.hunted,
      };
      recordRun(boardUi, key, run);
    }
    const summary = outcome === 'win'
      ? MENU.winSummary(rec.duration, rec.clicks)
      : MENU.loseSummary(rec.duration, rec.clicks);
    narrator.say(summary);
  }

  function nextLevel(l: Level): Level | null {
    const i = levels.findIndex((x) => x.meta.id === l.meta.id);
    return i >= 0 && i + 1 < levels.length ? levels[i + 1] : null;
  }

  // ── pause ─────────────────────────────────────────────────────────────
  function togglePause(): void {
    if (phase === 'playing') {
      phase = 'paused';
      session?.setPaused(true);
      setStatus('Paused — tap to resume, swipe down restart, swipe up menu, swipe left steps');
      narrator.say(MENU.pause);
    } else if (phase === 'paused') {
      resume();
    }
  }

  function resume(): void {
    phase = 'playing';
    session?.setPaused(false);
    setStatus(`Level ${currentLevel?.meta.order ?? ''} — ${currentLevel?.meta.name ?? ''}`, true);
  }

  // ── gesture routing by phase ──────────────────────────────────────────
  function handleGesture(e: GestureEvent): void {
    switch (phase) {
      case 'boot':
        void firstTap();
        break;
      case 'menu': {
        if (e.type === 'tap' && acceptPendingCustom()) break;
        if (e.type === 'swipe') {
          if (e.dir === 'left' || e.dir === 'right') {
            menuIdx = (menuIdx + (e.dir === 'right' ? -1 : 1) + levels.length) % levels.length;
            announceLevel();
          }
        } else if (e.type === 'tap') {
          const l = levels[menuIdx];
          if (l.meta.order <= progress.unlocked || progress.finishedAll) {
            startLevel(l);
          } else {
            narrator.say(MENU.locked);
          }
        }
        break;
      }
      case 'playing':
        if (e.type === 'threeFingerTap') {
          togglePause();
        } else {
          session?.handleGesture(e);
        }
        break;
      case 'paused':
        if (e.type === 'tap' && acceptPendingCustom()) break;
        if (e.type === 'tap') resume();
        else if (e.type === 'swipe' && e.dir === 'down') { session?.stop(); if (currentLevel) startLevel(currentLevel); }
        else if (e.type === 'swipe' && e.dir === 'up') { session?.stop(); session = null; enterMenu(); }
        else if (e.type === 'swipe' && e.dir === 'left') {
          steps.enabled = !steps.enabled;
          narrator.say(steps.enabled ? 'Walk in place: on.' : 'Walk in place: off.');
        }
        break;
      case 'results': {
        if (e.type === 'tap' && acceptPendingCustom()) break;
        if (!lastRec || !currentLevel) break;
        const won = lastRec.outcome === 'win';
        if (e.type === 'tap') {
          results.hide();
          if (won) {
            const n = nextLevel(currentLevel);
            if (n) startLevel(n); else enterMenu();
          } else {
            startLevel(currentLevel);
          }
        } else if (e.type === 'swipe' && e.dir === 'down') {
          results.hide();
          startLevel(currentLevel);
        } else if (e.type === 'swipe' && e.dir === 'up') {
          results.hide();
          enterMenu();
        }
        break;
      }
    }
  }

  // A single tap anywhere starts the boot sequence.
  app.addEventListener('pointerdown', () => {
    if (phase === 'boot') void firstTap();
  }, { once: false });

  // PWA registration (no-op in dev).
  import('virtual:pwa-register')
    .then((m) => m.registerSW({ immediate: true }))
    .catch(() => { /* module absent in dev */ });
}
