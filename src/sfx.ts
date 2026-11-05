import { settings } from './settings';

/** Synthesized sound effects and per-level background music. Nothing is loaded from files. */

interface Track {
  bpm: number;
  root: number; // MIDI note of the scale root
  scale: number[]; // semitone offsets
  prog: number[]; // scale-degree offset per bar (4 bars)
  bass: number[]; // 16 steps: scale degree or -1 for rest
  arp: number[]; // 16 steps: scale degree or -1 for rest
  lead: OscillatorType;
  hats: 'off' | 'eighth' | 'sixteenth';
  kick: boolean;
}

const PENTA = [0, 2, 4, 7, 9];
const MINOR_PENTA = [0, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

const TRACKS: Track[] = [
  {
    bpm: 112,
    root: 60,
    scale: PENTA,
    prog: [0, 3, 1, 4],
    bass: [0, -1, -1, 0, -1, -1, 0, -1, 0, -1, -1, 0, -1, 2, -1, -1],
    arp: [0, 2, 4, 2, 0, 2, 4, 5, 0, 2, 4, 2, 5, 4, 2, -1],
    lead: 'triangle',
    hats: 'off',
    kick: true,
  },
  {
    bpm: 124,
    root: 57,
    scale: MINOR_PENTA,
    prog: [0, 0, 3, 2],
    bass: [0, -1, 0, -1, 0, -1, 2, -1, 0, -1, 0, -1, 3, -1, 2, -1],
    arp: [4, -1, 2, -1, 4, 5, -1, 2, 4, -1, 2, -1, 0, 2, 4, -1],
    lead: 'square',
    hats: 'sixteenth',
    kick: true,
  },
  {
    bpm: 100,
    root: 62,
    scale: DORIAN,
    prog: [0, 3, 4, 2],
    bass: [0, -1, -1, -1, 0, -1, -1, 4, 0, -1, -1, -1, 0, -1, 4, -1],
    arp: [0, -1, 2, -1, 4, -1, 2, -1, 5, -1, 4, -1, 2, -1, 1, -1],
    lead: 'sine',
    hats: 'eighth',
    kick: false,
  },
  {
    bpm: 128,
    root: 52,
    scale: MINOR,
    prog: [0, 5, 3, 4],
    bass: [0, 0, -1, 0, -1, 0, 0, -1, 0, 0, -1, 0, -1, 3, 2, -1],
    arp: [0, 2, 4, 7, 4, 2, 0, 2, 4, 2, 0, -1, 2, 4, 7, 9],
    lead: 'sawtooth',
    hats: 'eighth',
    kick: true,
  },
  {
    bpm: 140,
    root: 54,
    scale: PHRYGIAN,
    prog: [0, 1, 0, 6],
    bass: [0, 0, 0, -1, 0, 0, 1, -1, 0, 0, 0, -1, 4, 3, 1, -1],
    arp: [0, 3, 4, 3, 0, 3, 4, 6, 7, 6, 4, 3, 1, 3, 4, -1],
    lead: 'sawtooth',
    hats: 'sixteenth',
    kick: true,
  },
];

const midiHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
const degree = (t: Track, d: number): number => {
  const n = t.scale.length;
  return t.root + t.scale[((d % n) + n) % n] + 12 * Math.floor(d / n);
};
/** Semitone climb for consecutive combo pops (major pentatonic over two octaves). */
const COMBO_SEMIS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private paused = false;

  // ------------------------------------------------------------- plumbing

  private context(): AudioContext | null {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      return null;
    }
    return this.ctx;
  }

  private ensure(): AudioContext | null {
    return this.muted ? null : this.context();
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private beep(freq: number, dur: number, type: OscillatorType, vol = 0.08, slideTo?: number, delay = 0): void {
    const ctx = this.ensure();
    vol *= settings.sfx / 100;
    if (!ctx || vol < 0.0005) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  private burst(dur: number, vol: number, from: number, to: number): void {
    const ctx = this.ensure();
    vol *= settings.sfx / 100;
    if (!ctx || vol < 0.0005) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  toggleMute(): void {
    this.muted = !this.muted;
  }

  // --------------------------------------------------------------- effects

  shoot(): void {
    this.beep(500, 0.12, 'square', 0.04, 900);
  }
  /** Pitch climbs a pentatonic scale with the combo count. */
  pop(tier: number, combo = 1): void {
    const semis = COMBO_SEMIS[Math.min(combo - 1, COMBO_SEMIS.length - 1)];
    const f = (220 + (3 - tier) * 120) * Math.pow(2, semis / 12);
    this.beep(f, 0.12, 'triangle', 0.1, f * 0.4);
    if (combo >= 3) this.beep(f * 2, 0.08, 'sine', 0.04, f * 2.2, 0.03);
  }
  crack(): void {
    this.beep(900, 0.07, 'square', 0.05, 400);
    this.burst(0.08, 0.08, 6000, 800);
  }
  hit(): void {
    this.beep(200, 0.5, 'sawtooth', 0.1, 40);
  }
  die(): void {
    this.beep(440, 0.9, 'triangle', 0.09, 70);
    this.beep(330, 0.9, 'sine', 0.07, 50, 0.08);
  }
  power(): void {
    this.beep(600, 0.2, 'sine', 0.1, 1200);
  }
  life(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.14, 'square', 0.06, undefined, i * 0.08));
  }
  boom(): void {
    this.burst(0.7, 0.35, 4000, 60);
    this.beep(120, 0.5, 'sine', 0.2, 35);
  }
  clear(): void {
    this.beep(523, 0.15, 'square', 0.06);
    setTimeout(() => this.beep(784, 0.25, 'square', 0.06), 150);
  }
  win(): void {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.beep(f, 0.2, 'square', 0.06, undefined, i * 0.14));
  }

  // ----------------------------------------------------------------- music

  startMusic(levelIdx: number): void {
    this.stopMusic();
    this.track = TRACKS[levelIdx % TRACKS.length];
    this.step = 0;
    const ctx = this.context();
    this.nextTime = (ctx?.currentTime ?? 0) + 0.1;
    this.timer = window.setInterval(() => this.pump(), 30);
  }

  stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }

  setMusicPaused(paused: boolean): void {
    this.paused = paused;
  }

  private pump(): void {
    const ctx = this.ctx;
    const track = this.track;
    if (!ctx || !track) return;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      if (!this.muted && !this.paused && settings.music > 0) this.playStep(ctx, track, this.nextTime);
      this.nextTime += 60 / track.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private out(ctx: AudioContext): GainNode {
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.9;
      this.musicGain.connect(ctx.destination);
    }
    this.musicGain.gain.value = 0.9 * (settings.music / 100);
    return this.musicGain;
  }

  private tone(ctx: AudioContext, freq: number, when: number, dur: number, type: OscillatorType, vol: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(vol, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain).connect(this.out(ctx));
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private playStep(ctx: AudioContext, t: Track, when: number): void {
    const s = this.step % 16;
    const off = t.prog[Math.floor(this.step / 16) % 4];
    const beat = 60 / t.bpm;

    if (t.kick && s % 4 === 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
      gain.gain.setValueAtTime(0.13, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      osc.connect(gain).connect(this.out(ctx));
      osc.start(when);
      osc.stop(when + 0.18);
    }

    const hat = t.hats === 'sixteenth' ? true : t.hats === 'eighth' ? s % 2 === 0 : false;
    if (hat) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(s % 4 === 2 ? 0.05 : 0.025, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      src.connect(hp).connect(gain).connect(this.out(ctx));
      src.start(when);
      src.stop(when + 0.06);
    }

    const b = t.bass[s];
    if (b >= 0) this.tone(ctx, midiHz(degree(t, b + off) - 24), when, beat * 0.45, 'triangle', 0.09);
    const a = t.arp[s];
    if (a >= 0) this.tone(ctx, midiHz(degree(t, a + off) + 12), when, beat * 0.3, t.lead, 0.03);
  }
}
