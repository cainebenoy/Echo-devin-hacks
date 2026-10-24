/**
 * All sounds are synthesized into AudioBuffers at boot — no asset files.
 * Buffers are rendered through OfflineAudioContext graphs so the recipes can
 * use real filters/waveshapers.
 */
export interface SoundSet {
  click: AudioBuffer;
  footstepStone: AudioBuffer;
  footstepWood: AudioBuffer[];
  footstepWater: AudioBuffer[];
  bump: AudioBuffer;
  beacon: AudioBuffer;       // 6 s seamless loop
  breathing: AudioBuffer;    // looped
  growl: AudioBuffer;
  heartbeat: AudioBuffer;    // one lub-dub
  winSting: AudioBuffer;
  loseSting: AudioBuffer;
  drip: AudioBuffer;
  earcon: AudioBuffer;       // two-tone hint cue for no-speech fallback
  openAir: AudioBuffer;      // airy whoosh — a click's "non-return" from an opening
  whoosh: AudioBuffer;       // pebble flight — soft rising noise
  clatterStone: AudioBuffer; // pebble off a stone wall — bright ticks
  clatterWood: AudioBuffer;  // pebble off wood — dull knocks
  clatterSacks: AudioBuffer; // pebble into sacks — one muffled thump
  skitterStone: AudioBuffer; // pebble skittering on stone floor
  skitterWood: AudioBuffer;  // pebble skittering on wood floor
  pebbleSplash: AudioBuffer; // pebble into water — short bright splash
  pebbleCount: AudioBuffer;  // two-note "pebbles left" earcon (rate-shifted)
  pebbleEmpty: AudioBuffer;  // dull tick — pouch is empty
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, pink = false): AudioBuffer {
  const n = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (!pink) {
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  } else {
    // Paul Kellet pink-noise approximation.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

function normalize(buf: AudioBuffer, peak = 1): AudioBuffer {
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    let max = 0;
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
    if (max > 1e-6) {
      const s = peak / max;
      for (let i = 0; i < d.length; i++) d[i] *= s;
    }
  }
  return buf;
}

async function render(sampleRate: number, seconds: number, build: (ctx: OfflineAudioContext) => void): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  build(ctx);
  return ctx.startRendering();
}

function envGain(ctx: OfflineAudioContext, points: [number, number][]): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(points[0][1], points[0][0]);
  for (let i = 1; i < points.length; i++) {
    const [t, v] = points[i];
    g.gain.linearRampToValueAtTime(v, t);
  }
  return g;
}

export async function synthesize(ctx: AudioContext): Promise<SoundSet> {
  const rate = ctx.sampleRate;

  // ── Click: 4 ms noise burst, exp decay, band-pass 3 kHz Q1.2 + transient ──
  const click = await render(rate, 0.05, (o) => {
    const src = o.createBufferSource();
    src.buffer = noiseBuffer(o, 0.05);
    const env = envGain(o, [[0, 1], [0.004, 0.05], [0.05, 0]]);
    const bp = o.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 1.2;
    src.connect(env).connect(bp).connect(o.destination);
    src.start();
  });
  normalize(click);
  click.getChannelData(0)[0] = 1; // 1-sample transient

  // ── Footstep stone: 45 ms dull thud — low-passed noise + 140 Hz body ──
  const footstepStone = await render(rate, 0.12, (o) => {
    const src = o.createBufferSource();
    src.buffer = noiseBuffer(o, 0.12);
    const env = envGain(o, [[0, 0.6], [0.045, 0.08], [0.12, 0]]);
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const body = o.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(140, 0);
    body.frequency.exponentialRampToValueAtTime(75, 0.08);
    const bg = envGain(o, [[0, 0.5], [0.09, 0]]);
    src.connect(env).connect(lp).connect(o.destination);
    body.connect(bg).connect(o.destination);
    src.start(); body.start(); body.stop(0.1);
  });
  normalize(footstepStone, 0.8);

  // ── Footstep wood: 70 ms band-pass 500 Hz + short resonant creak, ±8% ──
  const footstepWood: AudioBuffer[] = [];
  for (let v = 0; v < 3; v++) {
    const pitch = 1 + (Math.random() * 0.16 - 0.08);
    const b = await render(rate, 0.16, (o) => {
      const src = o.createBufferSource();
      src.buffer = noiseBuffer(o, 0.16);
      src.playbackRate.value = pitch;
      const env = envGain(o, [[0, 0.55], [0.07, 0.12], [0.16, 0]]);
      const bp = o.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 500 * pitch; bp.Q.value = 1.1;
      const creak = o.createOscillator();
      creak.type = 'sine';
      creak.frequency.setValueAtTime(160 * pitch, 0.02);
      creak.frequency.exponentialRampToValueAtTime(120 * pitch, 0.09);
      const cg = envGain(o, [[0.02, 0.18], [0.09, 0]]);
      src.connect(env).connect(bp).connect(o.destination);
      creak.connect(cg).connect(o.destination);
      src.start(); creak.start(0.02); creak.stop(0.12);
    });
    footstepWood.push(normalize(b, 0.8));
  }

  // ── Footstep water: 180 ms filtered noise, 3 sub-splashes, LP 2.5 kHz ──
  const footstepWater: AudioBuffer[] = [];
  for (let v = 0; v < 3; v++) {
    const b = await render(rate, 0.24, (o) => {
      const src = o.createBufferSource();
      src.buffer = noiseBuffer(o, 0.24);
      const env = envGain(o, [[0, 0.7], [0.18, 0.12], [0.24, 0]]);
      const lp = o.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2500;
      src.connect(env).connect(lp).connect(o.destination);
      src.start();
      for (let s = 0; s < 3; s++) {
        const t = 0.03 + Math.random() * 0.12;
        const sub = o.createBufferSource();
        sub.buffer = noiseBuffer(o, 0.04);
        const sg = envGain(o, [[t, 0.5 + Math.random() * 0.3], [t + 0.035, 0]]);
        const bp = o.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 1800; bp.Q.value = 1.5;
        sub.connect(sg).connect(bp).connect(o.destination);
        sub.start(t);
      }
    });
    footstepWater.push(normalize(b, 0.9));
  }

  // ── Wall bump: 80 ms thud, 90 Hz sine pitch drop + LP noise ──
  const bump = await render(rate, 0.12, (o) => {
    const osc = o.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, 0);
    osc.frequency.exponentialRampToValueAtTime(45, 0.08);
    const og = envGain(o, [[0, 0.9], [0.08, 0]]);
    osc.connect(og).connect(o.destination);
    const n = o.createBufferSource();
    n.buffer = noiseBuffer(o, 0.05);
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    const ng = envGain(o, [[0, 0.5], [0.05, 0]]);
    n.connect(lp).connect(ng).connect(o.destination);
    osc.start(); osc.stop(0.1); n.start();
  });
  normalize(bump);

  // ── Sea-breeze beacon: pink noise, band-pass 400–1200, LFO, 6 s loop ──
  // Spec asks for a 0.15 Hz LFO and a seamless 6 s loop; 0.15 Hz does not
  // complete a whole cycle in 6 s, so the LFO runs at 1/6 Hz (one cycle per
  // loop) which keeps the loop seamless.
  const beacon = await render(rate, 6.0, (o) => {
    const src = o.createBufferSource();
    src.buffer = noiseBuffer(o, 6.0, true);
    src.loop = true;
    const bp = o.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = Math.sqrt(400 * 1200); bp.Q.value = 0.55;
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200;
    const hp = o.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 400;
    const g = o.createGain();
    const d = g.gain;
    const cycle = 1 / 6;
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * 6;
      d.setValueAtTime(0.55 + 0.45 * Math.sin(2 * Math.PI * cycle * t - Math.PI / 2) * 0.5 + 0.225, t);
    }
    const lfo = o.createOscillator();
    lfo.frequency.value = cycle;
    const lfoG = o.createGain();
    lfoG.gain.value = 0.22;
    lfo.connect(lfoG).connect(d);
    src.connect(hp).connect(lp).connect(bp).connect(g).connect(o.destination);
    src.start(); lfo.start();
  });
  // Equal-power crossfade the ends for a perfectly seamless loop.
  {
    const d = beacon.getChannelData(0);
    const x = Math.floor(rate * 0.15);
    for (let i = 0; i < x; i++) {
      const t = i / x;
      const tail = d[d.length - x + i];
      d[d.length - x + i] = tail * Math.cos(t * Math.PI / 2) + d[i] * Math.sin(t * Math.PI / 2);
      d[i] = d[i] * Math.cos(t * Math.PI / 2) + tail * Math.sin(t * Math.PI / 2);
    }
  }
  normalize(beacon, 0.8);

  // ── Breathing: LP noise 500 Hz, inhale/exhale 3.2 s, slight irregularity ──
  const breathing = await render(rate, 6.4, (o) => {
    const src = o.createBufferSource();
    src.buffer = noiseBuffer(o, 6.4);
    src.loop = true;
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = o.createGain();
    for (let c = 0; c < 2; c++) {
      const base = c * 3.2;
      const wobble = 1 + (c === 0 ? 0 : 0.08);
      const pts: [number, number][] = [
        [base, 0.05],
        [base + 1.0 * wobble, 0.6],   // inhale
        [base + 1.4 * wobble, 0.5],
        [base + 2.6 * wobble, 0.12],  // exhale
        [base + 3.2, 0.05],
      ];
      g.gain.setValueAtTime(pts[0][1], base);
      for (let i = 1; i < pts.length; i++) g.gain.linearRampToValueAtTime(pts[i][1], pts[i][0]);
    }
    src.connect(lp).connect(g).connect(o.destination);
    src.start();
  });
  {
    const d = breathing.getChannelData(0);
    const x = Math.floor(rate * 0.2);
    for (let i = 0; i < x; i++) {
      const t = i / x;
      const tail = d[d.length - x + i];
      d[d.length - x + i] = tail * (1 - t) + d[i] * t;
      d[i] = d[i] * (1 - t) + tail * t;
    }
  }
  normalize(breathing, 0.85);

  // ── Growl: 900 ms, 70 Hz saw + vibrato, waveshaper, low-pass ──
  const growl = await render(rate, 0.95, (o) => {
    const osc = o.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 70;
    const vib = o.createOscillator();
    vib.frequency.value = 9;
    const vibG = o.createGain();
    vibG.gain.value = 6;
    vib.connect(vibG).connect(osc.frequency);
    const shaper = o.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(3 * x);
    }
    shaper.curve = curve;
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = envGain(o, [[0, 0], [0.08, 0.9], [0.7, 0.7], [0.95, 0]]);
    osc.connect(shaper).connect(lp).connect(g).connect(o.destination);
    osc.start(); vib.start(); osc.stop(0.95); vib.stop(0.95);
  });
  normalize(growl, 0.9);

  // ── Heartbeat: double thump, 55 Hz sine bursts ──
  const heartbeat = await render(rate, 0.45, (o) => {
    for (const t of [0, 0.16]) {
      const osc = o.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.11);
      const g = envGain(o, [[t, t === 0 ? 0.9 : 0.65], [t + 0.11, 0]]);
      osc.connect(g).connect(o.destination);
      osc.start(t); osc.stop(t + 0.13);
    }
  });
  normalize(heartbeat);

  // ── Win sting: tonal swell ──
  const winSting = await render(rate, 1.4, (o) => {
    for (const [f, dt] of [[392, 0], [523.25, 0.12], [659.25, 0.24]] as const) {
      const osc = o.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = envGain(o, [[dt, 0], [dt + 0.06, 0.5], [1.4, 0]]);
      osc.connect(g).connect(o.destination);
      osc.start(dt); osc.stop(1.4);
    }
  });
  normalize(winSting, 0.8);

  // ── Lose sting: harsh noise + growl hit ──
  const loseSting = await render(rate, 1.2, (o) => {
    const n = o.createBufferSource();
    n.buffer = noiseBuffer(o, 0.6);
    const bp = o.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 0.7;
    const ng = envGain(o, [[0, 1], [0.6, 0]]);
    n.connect(bp).connect(ng).connect(o.destination);
    const osc = o.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(65, 0);
    osc.frequency.exponentialRampToValueAtTime(35, 1.1);
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    const og = envGain(o, [[0, 0.8], [1.2, 0]]);
    osc.connect(lp).connect(og).connect(o.destination);
    n.start(); osc.start(); osc.stop(1.2);
  });
  normalize(loseSting);

  // ── Drip: 10 ms high sine blip with pitch drop ──
  const drip = await render(rate, 0.12, (o) => {
    const osc = o.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, 0);
    osc.frequency.exponentialRampToValueAtTime(900, 0.01);
    const g = envGain(o, [[0, 0.7], [0.01, 0.2], [0.12, 0]]);
    osc.connect(g).connect(o.destination);
    osc.start(); osc.stop(0.12);
  });
  normalize(drip, 0.7);

  // ── Earcon: two-tone cue used when speech is unavailable ──
  const earcon = await render(rate, 0.5, (o) => {
    for (const [f, t] of [[880, 0], [1174.66, 0.16]] as const) {
      const osc = o.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = envGain(o, [[t, 0.5], [t + 0.14, 0.4], [t + 0.18, 0]]);
      osc.connect(g).connect(o.destination);
      osc.start(t); osc.stop(t + 0.2);
    }
  });
  normalize(earcon, 0.6);

  // ── Open-air return: warm 2-note chime — unmistakable "opening ahead" ──
  const openAir = await render(rate, 0.45, (o) => {
    for (const [f, t0, g0] of [[523.25, 0, 0.45], [659.25, 0.07, 0.55], [783.99, 0.14, 0.4]] as const) {
      const osc = o.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = envGain(o, [[t0, 0.001], [t0 + 0.015, g0], [t0 + 0.28, 0]]);
      osc.connect(g).connect(o.destination);
      osc.start(t0); osc.stop(t0 + 0.3);
    }
  });
  normalize(openAir, 0.85);

  // ── Pebble whoosh: soft band-passed noise sweeping upward, 0.45 s ──
  const whoosh = await render(rate, 0.45, (o) => {
    const src = o.createBufferSource();
    src.buffer = noiseBuffer(o, 0.45);
    const bp = o.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1100, 0);
    bp.frequency.exponentialRampToValueAtTime(2600, 0.45);
    bp.Q.value = 0.8;
    const env = envGain(o, [[0, 0.02], [0.07, 0.45], [0.45, 0]]);
    src.connect(env).connect(bp).connect(o.destination);
    src.start();
  });
  normalize(whoosh, 0.65);

  // ── Pebble clatter on stone: 5 bright ticks + a high noise burst ──
  const clatterStone = await render(rate, 0.32, (o) => {
    for (let i = 0; i < 5; i++) {
      const t = i * 0.038 + Math.random() * 0.02;
      const osc = o.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2400 + Math.random() * 2400, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.03);
      const g = envGain(o, [[t, 0.55 - i * 0.08], [t + 0.03, 0]]);
      osc.connect(g).connect(o.destination);
      osc.start(t); osc.stop(t + 0.04);
    }
    const n = o.createBufferSource();
    n.buffer = noiseBuffer(o, 0.05);
    const hp = o.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3200;
    const ng = envGain(o, [[0, 0.3], [0.05, 0]]);
    n.connect(hp).connect(ng).connect(o.destination);
    n.start();
  });
  normalize(clatterStone, 0.85);

  // ── Pebble clatter on wood: 3 dull knocks around 600 Hz ──
  const clatterWood = await render(rate, 0.3, (o) => {
    for (let i = 0; i < 3; i++) {
      const t = i * 0.055 + Math.random() * 0.02;
      const osc = o.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620 + Math.random() * 160, t);
      osc.frequency.exponentialRampToValueAtTime(280, t + 0.04);
      const g = envGain(o, [[t, 0.6 - i * 0.12], [t + 0.05, 0]]);
      osc.connect(g).connect(o.destination);
      osc.start(t); osc.stop(t + 0.06);
    }
    const n = o.createBufferSource();
    n.buffer = noiseBuffer(o, 0.06);
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200;
    const ng = envGain(o, [[0, 0.3], [0.06, 0]]);
    n.connect(lp).connect(ng).connect(o.destination);
    n.start();
  });
  normalize(clatterWood, 0.8);

  // ── Pebble into sacks: a single muffled thump ──
  const clatterSacks = await render(rate, 0.2, (o) => {
    const osc = o.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, 0);
    osc.frequency.exponentialRampToValueAtTime(70, 0.12);
    const og = envGain(o, [[0, 0.8], [0.14, 0]]);
    osc.connect(og).connect(o.destination);
    const n = o.createBufferSource();
    n.buffer = noiseBuffer(o, 0.05);
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 280;
    const ng = envGain(o, [[0, 0.4], [0.05, 0]]);
    n.connect(lp).connect(ng).connect(o.destination);
    osc.start(); osc.stop(0.16); n.start();
  });
  normalize(clatterSacks, 0.85);

  // ── Pebble skitter on hard floors: descending bounce ticks ──
  const skitter = async (bright: boolean): Promise<AudioBuffer> => {
    const b = await render(rate, 0.5, (o) => {
      // Ticks cluster then space out like a bouncing stone settling.
      const times = [0, 0.05, 0.11, 0.19, 0.29, 0.41];
      times.forEach((t, i) => {
        const osc = o.createOscillator();
        osc.type = bright ? 'triangle' : 'sine';
        const base = bright ? 2600 - i * 320 : 640 - i * 60;
        osc.frequency.setValueAtTime(base + Math.random() * 120, t);
        osc.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.03);
        const g = envGain(o, [[t, Math.max(0.08, 0.5 - i * 0.09)], [t + 0.032, 0]]);
        osc.connect(g).connect(o.destination);
        osc.start(t); osc.stop(t + 0.04);
      });
      if (!bright) {
        const n = o.createBufferSource();
        n.buffer = noiseBuffer(o, 0.05);
        const lp = o.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1000;
        const ng = envGain(o, [[0, 0.25], [0.05, 0]]);
        n.connect(lp).connect(ng).connect(o.destination);
        n.start();
      }
    });
    return normalize(b, 0.8);
  };
  const skitterStone = await skitter(true);
  const skitterWood = await skitter(false);

  // ── Pebble splash: the water footstep recipe, shorter and brighter ──
  const pebbleSplash = await render(rate, 0.2, (o) => {
    const src = o.createBufferSource();
    src.buffer = noiseBuffer(o, 0.2);
    const env = envGain(o, [[0, 0.7], [0.14, 0.1], [0.2, 0]]);
    const lp = o.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4000;
    src.connect(env).connect(lp).connect(o.destination);
    src.start();
    for (let s = 0; s < 3; s++) {
      const t = 0.02 + Math.random() * 0.08;
      const sub = o.createBufferSource();
      sub.buffer = noiseBuffer(o, 0.03);
      const sg = envGain(o, [[t, 0.5 + Math.random() * 0.3], [t + 0.03, 0]]);
      const bp = o.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2000 + Math.random() * 2400; bp.Q.value = 1.6;
      sub.connect(sg).connect(bp).connect(o.destination);
      sub.start(t);
    }
  });
  normalize(pebbleSplash, 0.85);

  // ── Pebble count earcon: two soft notes; played at lower rates as the
  //    pouch empties so the pitch itself counts down. ──
  const pebbleCount = await render(rate, 0.4, (o) => {
    for (const [f, t] of [[1046.5, 0], [784, 0.14]] as const) {
      const osc = o.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = envGain(o, [[t, 0.4], [t + 0.1, 0.3], [t + 0.14, 0]]);
      osc.connect(g).connect(o.destination);
      osc.start(t); osc.stop(t + 0.16);
    }
  });
  normalize(pebbleCount, 0.55);

  // ── Empty pouch: one dull tick — "nothing left". ──
  const pebbleEmpty = await render(rate, 0.12, (o) => {
    const osc = o.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, 0);
    osc.frequency.exponentialRampToValueAtTime(110, 0.08);
    const g = envGain(o, [[0, 0.6], [0.1, 0]]);
    osc.connect(g).connect(o.destination);
    osc.start(); osc.stop(0.11);
  });
  normalize(pebbleEmpty, 0.6);

  return {
    click, footstepStone, footstepWood, footstepWater, bump, beacon,
    breathing, growl, heartbeat, winSting, loseSting, drip, earcon, openAir,
    whoosh, clatterStone, clatterWood, clatterSacks, skitterStone, skitterWood,
    pebbleSplash, pebbleCount, pebbleEmpty,
  };
}
