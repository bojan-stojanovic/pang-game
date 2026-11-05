/** Player-adjustable settings, persisted in localStorage. */

export type Particles = 'off' | 'low' | 'full';

export interface Settings {
  /** 0-100 */
  music: number;
  /** 0-100 */
  sfx: number;
  particles: Particles;
  /** Screen shake and flashes */
  shake: boolean;
  /** Stars, rain, fireflies, snow and embers */
  weather: boolean;
  /** Bubble glow and light trails */
  glow: boolean;
  vibration: boolean;
}

const KEY = 'pang-settings';
const PARTICLES: Particles[] = ['off', 'low', 'full'];

export function defaults(): Settings {
  const calm = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return { music: 60, sfx: 80, particles: 'full', shake: !calm, weather: !calm, glow: true, vibration: true };
}

const volume = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : fallback;
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Merges untrusted stored data over a base, keeping only valid values. */
export function normalize(raw: unknown, base: Settings = defaults()): Settings {
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  return {
    music: volume(r.music, base.music),
    sfx: volume(r.sfx, base.sfx),
    particles: PARTICLES.includes(r.particles as Particles) ? (r.particles as Particles) : base.particles,
    shake: flag(r.shake, base.shake),
    weather: flag(r.weather, base.weather),
    glow: flag(r.glow, base.glow),
    vibration: flag(r.vibration, base.vibration),
  };
}

function load(): Settings {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return defaults();
  }
}

/** Live settings object; read it wherever a setting applies. */
export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

export function resetSettings(): void {
  Object.assign(settings, defaults());
  saveSettings();
}

/** Whether the settings panel is showing (the game pauses while it is). */
export const settingsUi = { open: false };

const openListeners = new Set<() => void>();
export function onSettingsOpen(fn: () => void): () => void {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}
export function notifySettingsOpen(): void {
  for (const fn of openListeners) fn();
}

/** Set by main.ts so the panel can play a sample when the effects volume changes. */
export const hooks = { previewSfx: () => {} };

export function haptic(pattern: number | number[]): void {
  if (settings.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}
