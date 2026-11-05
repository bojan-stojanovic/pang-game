import {
  hooks,
  notifySettingsOpen,
  resetSettings,
  saveSettings,
  settings,
  settingsUi,
  type Particles,
  type Settings,
} from './settings';

type FlagKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const FLAGS: [id: string, key: FlagKey][] = [
  ['set-shake', 'shake'],
  ['set-weather', 'weather'],
  ['set-glow', 'glow'],
  ['set-vibration', 'vibration'],
];

let root: HTMLElement | null = null;
let refresh = (): void => {};

/** Wires the settings dialog defined in index.html. */
export function initSettingsPanel(): void {
  root = document.getElementById('settings');
  if (!root) return;
  const dialog = root;
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  const music = el<HTMLInputElement>('set-music');
  const sfx = el<HTMLInputElement>('set-sfx');
  const musicOut = el<HTMLOutputElement>('out-music');
  const sfxOut = el<HTMLOutputElement>('out-sfx');
  const segments = dialog.querySelectorAll<HTMLButtonElement>('[data-particles]');
  const done = el<HTMLButtonElement>('set-close');

  if (!('vibrate' in navigator)) el('row-vibration').hidden = true;

  refresh = () => {
    music.value = String(settings.music);
    sfx.value = String(settings.sfx);
    musicOut.textContent = `${settings.music}%`;
    sfxOut.textContent = `${settings.sfx}%`;
    segments.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.particles === settings.particles)));
    for (const [id, key] of FLAGS) el<HTMLInputElement>(id).checked = settings[key];
  };

  music.addEventListener('input', () => {
    settings.music = Number(music.value);
    musicOut.textContent = `${settings.music}%`;
    saveSettings();
  });
  sfx.addEventListener('input', () => {
    settings.sfx = Number(sfx.value);
    sfxOut.textContent = `${settings.sfx}%`;
    saveSettings();
  });
  sfx.addEventListener('change', () => hooks.previewSfx());

  segments.forEach((b) =>
    b.addEventListener('click', () => {
      settings.particles = b.dataset.particles as Particles;
      saveSettings();
      refresh();
    }),
  );
  for (const [id, key] of FLAGS) {
    el<HTMLInputElement>(id).addEventListener('change', (e) => {
      settings[key] = (e.target as HTMLInputElement).checked;
      saveSettings();
    });
  }

  el('set-reset').addEventListener('click', () => {
    resetSettings();
    refresh();
  });
  done.addEventListener('click', closeSettings);
  dialog.addEventListener('pointerdown', (e) => {
    if (e.target === dialog) closeSettings(); // tap outside the card
  });

  // Keep keystrokes away from the game (Space/arrows are captured there), and let Esc close the dialog.
  const stop = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.type === 'keydown' && e.key === 'Escape') closeSettings();
  };
  dialog.addEventListener('keydown', stop);
  dialog.addEventListener('keyup', stop);
}

export function openSettings(): void {
  if (!root || settingsUi.open) return;
  refresh();
  root.hidden = false;
  settingsUi.open = true;
  notifySettingsOpen();
  document.getElementById('set-close')?.focus();
}

export function closeSettings(): void {
  if (!root || !settingsUi.open) return;
  root.hidden = true;
  settingsUi.open = false;
  (document.activeElement as HTMLElement | null)?.blur();
}
