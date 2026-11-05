import { describe, expect, it } from 'vitest';
import { normalize, type Settings } from './settings';

const base: Settings = {
  music: 60,
  sfx: 80,
  particles: 'full',
  shake: true,
  weather: true,
  glow: true,
  vibration: true,
};

describe('settings.normalize', () => {
  it('falls back to the base for missing or junk data', () => {
    expect(normalize(null, base)).toEqual(base);
    expect(normalize('nope', base)).toEqual(base);
    expect(normalize({}, base)).toEqual(base);
  });

  it('keeps valid stored values', () => {
    const stored = { music: 10, sfx: 0, particles: 'low', shake: false, weather: false, glow: false, vibration: false };
    expect(normalize(stored, base)).toEqual(stored);
  });

  it('clamps volumes and rejects invalid types', () => {
    const s = normalize({ music: 250, sfx: -5, particles: 'ultra', shake: 'yes', glow: 1 }, base);
    expect(s.music).toBe(100);
    expect(s.sfx).toBe(0);
    expect(s.particles).toBe('full');
    expect(s.shake).toBe(true);
    expect(s.glow).toBe(true);
  });

  it('rounds volumes and ignores non-finite numbers', () => {
    expect(normalize({ music: 33.6 }, base).music).toBe(34);
    expect(normalize({ music: NaN, sfx: Infinity }, base)).toMatchObject({ music: 60, sfx: 80 });
  });
});
