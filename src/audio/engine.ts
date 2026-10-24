/**
 * AudioContext, buses and routing.
 *
 *   voices → sfxBus → master ─┐
 *   reverbSend → convolver ───┤→ compressor → destination
 *   ambienceBus → master ─────┘
 *
 * Narration ducking multiplies master gain to 0.4 while speech plays.
 */
export class Engine {
  ctx!: AudioContext;
  master!: GainNode;
  sfxBus!: GainNode;
  ambienceBus!: GainNode;
  reverbSend!: GainNode;
  convolver!: ConvolverNode;
  compressor!: DynamicsCompressorNode;
  private ducked = false;
  private activeVoices = 0;
  private pending = new Set<AudioBufferSourceNode>();

  get ready(): boolean {
    return !!this.ctx;
  }

  /** Must be called inside a user gesture. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    this.compressor.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.connect(this.compressor);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);

    this.ambienceBus = this.ctx.createGain();
    this.ambienceBus.connect(this.master);

    this.convolver = this.ctx.createConvolver();
    this.convolver.connect(this.master);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.connect(this.convolver);
    void this.ctx.resume();
  }

  /** Stereo impulse response: decorrelated noise × exp(−6.91·t/rt60). */
  setReverb(rt60: number): void {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rt60 * 1.2 * rate));
    const ir = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        d[i] = (Math.random() * 2 - 1) * Math.exp((-6.91 * t) / rt60);
      }
    }
    this.convolver.buffer = ir;
  }

  /** Duck master to 0.4 during speech (150 ms ramps). */
  duck(on: boolean): void {
    if (!this.ctx || on === this.ducked) return;
    this.ducked = on;
    this.master.gain.setTargetAtTime(on ? 0.4 : 1.0, this.ctx.currentTime, 0.05);
  }

  /** HRTF panner placed at relative angle `rel` (rad), unit distance. */
  pannerAt(rel: number): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1;
    p.rolloffFactor = 0;
    p.positionX.value = Math.sin(rel);
    p.positionY.value = 0;
    p.positionZ.value = -Math.cos(rel);
    return p;
  }

  /**
   * StereoPanner that exaggerates left/right from relative angle `rel`.
   * Placed AFTER an HRTF panner — HRTF alone is too subtle on speakers and
   * has a front/back cone of confusion; this makes direction unmissable.
   */
  stereoAt(rel: number): StereoPannerNode {
    const s = this.ctx.createStereoPanner();
    s.pan.value = Math.max(-0.85, Math.min(0.85, Math.sin(rel) * 1.4));
    return s;
  }

  /** Centred panner (for footsteps, dry click). */
  centred(): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1;
    p.rolloffFactor = 0;
    p.positionX.value = 0;
    p.positionY.value = 0;
    p.positionZ.value = -1;
    return p;
  }

  track(src: AudioBufferSourceNode): void {
    this.pending.add(src);
    this.activeVoices = this.pending.size;
    src.onended = () => {
      this.pending.delete(src);
      this.activeVoices = this.pending.size;
      try { src.disconnect(); } catch { /* already gone */ }
    };
  }

  get voiceCount(): number {
    return this.activeVoices;
  }

  get latencyInfo(): { baseLatency: number; outputLatency: number } {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return { baseLatency: c?.baseLatency ?? 0, outputLatency: c?.outputLatency ?? 0 };
  }
}

export const engine = new Engine();
