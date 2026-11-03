import Phaser from 'phaser';

export const W = 800;
export const H = 500;
const MAX_K = 3;

/** Render scale: canvas pixels per logical unit, matched to the screen's physical pixels. */
export function viewScale(): number {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.min((window.innerWidth * dpr) / W, (window.innerHeight * dpr) / H);
  return Math.min(MAX_K, Math.max(1, Math.round(k * 20) / 20));
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
