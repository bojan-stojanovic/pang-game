/** Tiny synthesized sound effects; the AudioContext is created on first user gesture. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      return null;
    }
    return this.ctx;
  }

  private beep(freq: number, dur: number, type: OscillatorType, vol = 0.08, slideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
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

  shoot(): void {
    this.beep(500, 0.12, 'square', 0.04, 900);
  }
  pop(tier: number): void {
    this.beep(220 + (3 - tier) * 120, 0.12, 'triangle', 0.1, 80);
  }
  hit(): void {
    this.beep(200, 0.5, 'sawtooth', 0.1, 40);
  }
  power(): void {
    this.beep(600, 0.2, 'sine', 0.1, 1200);
  }
  clear(): void {
    this.beep(523, 0.15, 'square', 0.06);
    setTimeout(() => this.beep(784, 0.25, 'square', 0.06), 150);
  }
}
