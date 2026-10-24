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
import { decodeCustom, customDef, validateCustomMap, STATUS_TEXT, customHash } from './custom/codec';
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
      <h1>ECH<span class="o">O<span class="sonar"><i></i><i></i><i></i><i></i><b class="core"></b></span></span></h1>
      <p>Put on wired earphones.<br>Tap anywhere to begin.</p>
      <p class="code" id="speech-note"></p>
    </div>
    <div id="menu" class="hidden">
      <div class="menu-inner">
        <h1>ECH<span class="o">O<span class="sonar"><i></i><i></i><i></i><i></i><b class="core"></b></span></span></h1>
        <p class="tagline">A game played in total darkness, by sound alone.</p>
        <p class="howto">Send out a click — its echo paints the room.<br>Knock = wall · Chime = opening · Wind = the way out.</p>
        <div id="level-pick"></div>
        <p class="cta" id="menu-cta"></p>
      </div>
    </div>
    <div id="room-code"></div>
    <div id="status"></div>
    <div id="ready-gate" class="hidden">
      <p class="rg-level" id="rg-level"></p>
      <p class="rg-sub" id="rg-sub"></p>
      <button id="rg-start">Start round</button>
      <p class="rg-hint">or tap / press Space when ready — won't fire a click</p>
    </div>
    <div id="caption"></div>`;
  const bootEl = app.querySelector('#boot')!;
  const codeEl = app.querySelector('#room-code')!;
  const speechNote = app.querySelector('#speech-note')!;
  const captionEl = app.querySelector<HTMLElement>('#caption')!;
  const statusEl = app.querySelector<HTMLElement>('#status')!;
  const levelPick = app.querySelector<HTMLElement>('#level-pick')!;
  const menuEl = app.querySelector<HTMLElement>('#menu')!;
  const menuCta = app.querySelector<HTMLElement>('#menu-cta')!;
  const readyEl = app.querySelector<HTMLElement>('#ready-gate')!;
  const rgLevel = app.querySelector<HTMLElement>('#rg-level')!;
  const rgSub = app.querySelector<HTMLElement>('#rg-sub')!;
  const rgBtn = app.querySelector<HTMLButtonElement>('#rg-start')!;

  // Measure the active system font's exact 'O' ink centre (ascent/descent
  // vs cap-height) so the sonar rings sit dead-centre inside the O on
  // Windows (Segoe UI), macOS/iOS (SF Pro), and Android (Roboto).
  try {
    const oEl = app.querySelector<HTMLElement>('.o');
    const c = document.createElement('canvas').getContext('2d');
    if (oEl && c) {
      const cs = getComputedStyle(oEl);
      const fs = parseFloat(cs.fontSize) || 100;
      c.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      const m = c.measureText('O');
      if (m.fontBoundingBoxAscent && m.actualBoundingBoxAscent) {
        const base = m.fontBoundingBoxAscent + (fs - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2;
        const cy = base - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
        app.style.setProperty('--o-cy', `${((cy / fs) * 100).toFixed(2)}%`);
      }
    }
  } catch { /* fallback 56.5% in CSS */ }

  const results = new ResultsScreen(app);
  const boardUi = new BoardUI(app);
  // L/Shift+L work here too — the board hints at them wherever it appears.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'l' && e.key !== 'L') return;
    if ((e.target as HTMLElement | null)?.closest?.('input')) return;
    const key = boardUi.currentKey ?? (currentLevel
      ? boardKey({
        levelId: currentLevel.meta.id,
        customHash: currentLevel.meta.id === 'custom' ? customHash(currentLevel.map) : undefined,
        assist,
      })
      : null);
    if (e.shiftKey) boardUi.clearCurrent(key);
    else boardUi.toggle(key);
  });
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
  /** The offer must be ANNOUNCED before a tap can accept — a room arriving
   *  mid-run is stored silently, then announced on the next safe screen, so
   *  the player's next tap is never silently hijacked into a drawn room. */
  let customAnnounced = false;
  net.onHunter = (m) => handleHunterMsg(m as HunterMsg);
  net.onLevelCustom = (data) => {
    pendingCustom = data;
    customAnnounced = false;
    if (phase === 'menu' || phase === 'results') offerPendingCustom();
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
      else if (phase === 'intro') beginRun();
      else if (phase === 'menu') {
        const l = levels[menuIdx];
        const locked = !visual && !(l.meta.order <= progress.unlocked || progress.finishedAll);
        if (locked) narrator.say(MENU.locked);
        else startLevel(l);
      }
    },
    onArrow: (d) => {
      if (phase !== 'menu') return;
      menuIdx = (menuIdx + d + levels.length) % levels.length;
      announceLevel();
    },
    onHint: () => { if (phase === 'playing') session?.hint(); },
    onPause: () => {
      if (phase === 'intro') { session?.stop(); session = null; enterMenu(); }
      else togglePause();
    },
    onDebugToggle: () => overlay.toggle(),
    onTuningToggle: () => tuningPanel.toggle(),
    onSkipSpeech: () => {
      narrator.clear();
      if (phase === 'intro') beginRun();
    },
    onToggleVoice: () => {
      const m = narrator.toggleMuted();
      document.body.classList.toggle('muted', m);
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
  let assist = params.get('assist') === '1';
  // localStorage can throw outright (blocked site data, Safari private) —
  // the game must still boot.
  try { assist = assist || localStorage.getItem('echo.assist') === '1'; } catch { /* blocked */ }
  overlay.setVisual(visual);
  // In visual/desktop testing mode, default to captions-only so the robot
  // speechSynthesis voice doesn't talk over every run (press M to enable).
  try {
    if (visual && localStorage.getItem('echo.voiceMuted') === null) {
      narrator.setMuted(true);
    }
  } catch { /* blocked */ }
  document.body.classList.toggle('muted', narrator.muted);

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
  results.onMenu = () => {
    results.hide();
    enterMenu();
  };
  results.onBoard = () => {
    const key = boardUi.currentKey ?? (currentLevel
      ? boardKey({
        levelId: currentLevel.meta.id,
        customHash: currentLevel.meta.id === 'custom' ? customHash(currentLevel.map) : undefined,
        assist,
      })
      : null);
    boardUi.toggle(key);
  };
  // Whenever the leaderboard hides over the results screen, restart the
  // replay from 0:00 so the player can watch their full run unobstructed.
  boardUi.onHide = () => {
    if (phase === 'results') results.restartReplay();
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
    if (document.visibilityState === 'visible') {
      if (phase !== 'boot') void requestWakeLock();
      // iOS leaves the context suspended/interrupted after an app switch —
      // without this the game comes back silent.
      if (engine.ready && engine.ctx.state !== 'running') void engine.ctx.resume();
    } else if (phase === 'playing') {
      // App switch / phone call mid-run — pause rather than let the
      // creature catch an unattended player.
      togglePause();
    }
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
          // Consume the room link — a reload must not drop straight back in.
          params.delete('custom');
          history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
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
    customAnnounced = true;
    setStatus('A new room has been drawn for you — tap to enter');
    narrator.say('A new room has been drawn for you. Tap to enter.');
  }

  function acceptPendingCustom(): boolean {
    // Only after the player has actually been told a room waits — a tap
    // before the announcement belongs to the screen they're on.
    if (!pendingCustom || !customAnnounced) return false;
    customAnnounced = false;
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
      try { localStorage.setItem('echo.assist', assist ? '1' : '0'); } catch { /* blocked */ }
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

  /** Pointer lock + "screen stays black" follow the phase. Call after every
   *  phase change — the lock must only exist while a run is live, or the
   *  cursor vanishes and menu/results buttons can't be clicked. */
  function syncChrome(): void {
    keyboard.setPointerLock(phase === 'playing');
    document.body.classList.toggle('in-run', phase === 'playing' && !visual);
    maybeUpdateSw(); // safe-screen gate for pending SW updates
  }

  function enterMenu(): void {
    phase = 'menu';
    syncChrome();
    readyEl.classList.add('hidden');
    boardUi.dismissAll(); // clear lingering board flash AND any open name prompt
    menuIdx = Math.min(menuIdx, levels.length - 1);
    const l = levels[menuIdx];
    menuStatus();
    narrator.say(MENU.intro(l.meta.order, l.meta.name));
    if (pendingCustom && !customAnnounced) offerPendingCustom();
  }

  // ── level lifecycle ───────────────────────────────────────────────────
  function startLevel(level: Level): void {
    if (!sounds) return;
    session?.stop();
    boardUi.dismissAll(); // clear lingering board flash AND any open name prompt
    currentLevel = level;
    // Stage in 'intro' behind the Start gate — the intro narration plays,
    // the timer and creature stay frozen, and the gesture that entered the
    // level (or the next tap to begin) can NEVER fire a fake first click.
    phase = 'intro';
    syncChrome();
    renderLevelPick();
    setStatus(`Level ${level.meta.order} — ${level.meta.name}`, true);
    rgLevel.textContent = `${level.meta.order} · ${level.meta.name}`;
    const intro = level.meta.narration.intro;
    rgSub.textContent = intro[intro.length - 1] ?? '';
    readyEl.classList.remove('hidden');
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
      gateStart: true,
      onEnd: onRunEnd,
    });
    session.start(level);
  }

  /** Releases the Start gate — begins the clock + creature without clicking. */
  function beginRun(): void {
    if (phase !== 'intro') return;
    readyEl.classList.add('hidden');
    phase = 'playing';
    syncChrome();
    session?.begin();
  }
  rgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    beginRun();
  });

  function onRunEnd(outcome: 'win' | 'caught', rec: Recording): void {
    lastRec = rec;
    phase = 'results';
    syncChrome();
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
      // Hold the replay at 0:00 while the player enters their name + sees
      // the 3s leaderboard flash; it starts from 0:00 as soon as that clears.
      results.pauseReplay();
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
      recordRun(boardUi, key, run, undefined, () => {
        // If the player skipped naming (no board flash), start the replay now.
        if (!boardUi.visible && phase === 'results') results.restartReplay();
      });
    }
    const summary = outcome === 'win'
      ? (isTouch ? MENU.winSummary(rec.duration, rec.clicks) : MENU.winSummaryDesktop(rec.duration, rec.clicks))
      : (isTouch ? MENU.loseSummary(rec.duration, rec.clicks) : MENU.loseSummaryDesktop(rec.duration, rec.clicks));
    narrator.say(summary);
    if (pendingCustom && !customAnnounced) offerPendingCustom();
  }

  function nextLevel(l: Level): Level | null {
    const i = levels.findIndex((x) => x.meta.id === l.meta.id);
    return i >= 0 && i + 1 < levels.length ? levels[i + 1] : null;
  }

  // ── pause ─────────────────────────────────────────────────────────────
  function togglePause(): void {
    if (phase === 'playing') {
      phase = 'paused';
      syncChrome();
      session?.setPaused(true);
      setStatus('Paused — tap to resume, swipe down restart, swipe up menu, swipe left steps');
      narrator.say(MENU.pause);
    } else if (phase === 'paused') {
      resume();
    }
  }

  function resume(): void {
    phase = 'playing';
    syncChrome();
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
      case 'intro':
        // Any tap / swipe / hold releases the Start gate without firing a
        // click — blindfolded players just tap when the intro stops talking.
        if (e.type === 'tap' || e.type === 'walkStart') beginRun();
        break;
      case 'playing':
        if (e.type === 'threeFingerTap') {
          togglePause();
        } else {
          session?.handleGesture(e);
        }
        break;
      case 'paused':
        // No acceptPendingCustom here — "tap to resume" must never morph
        // into "enter a drawn room" under the player's finger.
        if (e.type === 'tap') resume();
        else if (e.type === 'swipe' && e.dir === 'down') { session?.stop(); if (currentLevel) startLevel(currentLevel); }
        else if (e.type === 'swipe' && e.dir === 'up') { session?.stop(); session = null; enterMenu(); }
        else if (e.type === 'swipe' && e.dir === 'left') {
          steps.enabled = !steps.enabled;
          narrator.say(steps.enabled ? 'Walk in place: on.' : 'Walk in place: off.');
        }
        break;
      case 'results': {
        // Never let a tap on results leak through while the leaderboard or
        // name prompt is open — dismiss the board instead.
        if (boardUi.visible || boardUi.isPromptOpen) {
          if (e.type === 'tap') boardUi.hide();
          break;
        }
        if (e.type === 'tap' && acceptPendingCustom()) break;
        if (!lastRec || !currentLevel) break;
        const won = lastRec.outcome === 'win';
        // In visual/desktop mode, #results has explicit Retry / Next level /
        // Menu buttons — a stray click on the canvas or background must NOT
        // jump into the next round while the player is watching the replay.
        if (e.type === 'tap' && !visual) {
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

  // A single tap anywhere starts the boot sequence — and every tap is a
  // chance to resurrect an AudioContext iOS suspended in the background.
  app.addEventListener('pointerdown', () => {
    if (engine.ready && engine.ctx.state !== 'running') void engine.ctx.resume();
    if (phase === 'boot') void firstTap();
  }, { once: false });

  // PWA registration (no-op in dev). A new SW waits for a safe screen —
  // autoUpdate would hard-reload the phone in the middle of a run.
  let updateSwFn: ((reload?: boolean) => Promise<void>) | null = null;
  let swUpdatePending = false;
  function maybeUpdateSw(): void {
    const safe = phase === 'menu' || phase === 'results' || phase === 'boot';
    if (swUpdatePending && safe && updateSwFn) {
      swUpdatePending = false;
      void updateSwFn(true);
    }
  }
  import('virtual:pwa-register')
    .then((m) => {
      updateSwFn = m.registerSW({
        immediate: true,
        onNeedRefresh() {
          swUpdatePending = true;
          maybeUpdateSw();
        },
      });
    })
    .catch(() => { /* module absent in dev */ });
}
