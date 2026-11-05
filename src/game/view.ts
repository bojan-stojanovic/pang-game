import Phaser from 'phaser';

export const W = 800;
export const H = 500;

/** Phones/tablets (coarse primary pointer) and low-memory devices render at most 2x to save GPU memory. */
const MAX_K = (() => {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  return coarse || (memory !== undefined && memory <= 4) ? 2 : 3;
})();

const clampScale = (k: number): number => Math.min(MAX_K, Math.max(1, Math.round(k * 20) / 20));

/** Render scale: canvas pixels per logical unit, matched to the window's physical pixels. */
export function viewScale(): number {
  const dpr = window.devicePixelRatio || 1;
  return clampScale(Math.min((window.innerWidth * dpr) / W, (window.innerHeight * dpr) / H));
}

/** The largest render scale this screen could ask for (landscape use), used to size textures once. */
export function screenScale(): number {
  const dpr = window.devicePixelRatio || 1;
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  return clampScale(Math.min((long * dpr) / W, (short * dpr) / H));
}

/**
 * Makes the canvas backing store match the screen resolution (no blurry upscaling) and
 * zooms the camera so the 800x500 logical world still fills it. Call from a scene's create().
 * `texts` are re-rasterised at the new scale so they stay sharp.
 */
export function setupView(scene: Phaser.Scene, texts: () => Phaser.GameObjects.Text[]): void {
  const apply = () => {
    const k = viewScale();
    const w = Math.round(W * k);
    const h = Math.round(H * k);
    if (scene.scale.width !== w || scene.scale.height !== h) scene.scale.setGameSize(w, h);
    const cam = scene.cameras.main;
    cam.setSize(w, h);
    cam.setZoom(k);
    cam.centerOn(W / 2, H / 2);
    for (const t of texts()) if (t.active && t.style.resolution !== k) t.setResolution(k);
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  scene.scale.on('resize', apply);
  scene.events.once('shutdown', () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
    scene.scale.off('resize', apply);
  });
}
