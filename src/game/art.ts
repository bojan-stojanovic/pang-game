import Phaser from 'phaser';
import { TIER_COLOR, TIER_RADIUS } from './bubble';
import { levels } from './levels';

/** Textures are drawn at S x resolution; display objects are scaled by 1 / S. */
export const S = 3;
/** Backdrop textures are large smooth gradients, so they use a lower density. */
export const BS = 2;
export const GLOW = 10;
export const PLAYER_FRAMES = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'shoot'] as const;
const BG_W = 800;
const BG_H = 500;

type Draw = (c: CanvasRenderingContext2D) => void;
type RGB = [number, number, number];

// ------------------------------------------------------------------ helpers

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw, sc = S): void {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * sc);
  cv.height = Math.ceil(h * sc);
  const c = cv.getContext('2d')!;
  c.scale(sc, sc);
  draw(c);
  scene.textures.addCanvas(key, cv);
}

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex: string, to: RGB, t: number, a = 1): string {
  const [r, g, b] = rgb(hex);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgba(${m(r, to[0])},${m(g, to[1])},${m(b, to[2])},${a})`;
}
const lighten = (hex: string, t: number, a = 1) => mix(hex, [255, 255, 255], t, a);
const darken = (hex: string, t: number, a = 1) => mix(hex, [0, 0, 0], t, a);

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ bubbles

function drawBubble(c: CanvasRenderingContext2D, size: number, r: number, color: string): void {
  const cx = size / 2;
  const cy = size / 2;

  let g = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + GLOW);
  g.addColorStop(0, lighten(color, 0.2, 0.4));
  g.addColorStop(1, lighten(color, 0.2, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, r + GLOW, 0, Math.PI * 2);
  c.fill();

  g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, lighten(color, 0.6));
  g.addColorStop(0.45, color);
  g.addColorStop(1, darken(color, 0.42));
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();

  // bounce light on the lower right, clipped to the body
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();
  g = c.createRadialGradient(cx + r * 0.45, cy + r * 0.55, 0, cx + r * 0.45, cy + r * 0.55, r * 0.7);
  g.addColorStop(0, lighten(color, 0.75, 0.6));
  g.addColorStop(1, lighten(color, 0.75, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  c.restore();

  c.lineWidth = 1.5;
  c.strokeStyle = darken(color, 0.55, 0.75);
  c.beginPath();
  c.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  c.stroke();

  // specular streak + dot
  c.save();
  c.translate(cx - r * 0.38, cy - r * 0.42);
  c.rotate(-0.7);
  g = c.createLinearGradient(-r * 0.32, 0, r * 0.32, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0.1)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, 0, r * 0.32, r * 0.16, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.beginPath();
  c.arc(cx + r * 0.42, cy + r * 0.36, Math.max(1, r * 0.07), 0, Math.PI * 2);
  c.fill();
}

// ------------------------------------------------------------------- player

interface Pose {
  phase: number;
  amp: number;
  bob: number;
  shoot: boolean;
}
const POSES: Record<(typeof PLAYER_FRAMES)[number], Pose> = {
  idle0: { phase: 0, amp: 0, bob: 0, shoot: false },
  idle1: { phase: 0, amp: 0, bob: 1, shoot: false },
  run0: { phase: 0, amp: 1, bob: 0, shoot: false },
  run1: { phase: Math.PI / 2, amp: 1, bob: 1.5, shoot: false },
  run2: { phase: Math.PI, amp: 1, bob: 0, shoot: false },
  run3: { phase: (Math.PI * 3) / 2, amp: 1, bob: 1.5, shoot: false },
  shoot: { phase: 0, amp: 0, bob: 0, shoot: true },
};

function drawPlayer(c: CanvasRenderingContext2D, p: Pose): void {
  const X = 22;
  const skin = '#ffd2a6';
  c.lineCap = 'round';

  // backpack
  c.fillStyle = '#3d405b';
  rr(c, X - 18, 25 + p.bob, 11, 17, 4);
  c.fill();

  // legs
  for (let i = 0; i < 2; i++) {
    const s = Math.sin(p.phase + i * Math.PI) * p.amp * 6;
    const lift = Math.max(0, Math.cos(p.phase + i * Math.PI)) * p.amp * 3;
    const x = X - 8 + i * 9 + s;
    c.fillStyle = i ? '#1f2c52' : '#2b3a67';
    rr(c, x, 40, 7, 14 - lift, 3);
    c.fill();
    c.fillStyle = '#f4f1de';
    rr(c, x - 1, 52 - lift, 10, 6, 3);
    c.fill();
    c.fillStyle = '#ff9f1c';
    c.fillRect(x - 1, 56.5 - lift, 10, 1.5);
  }

  c.save();
  c.translate(0, p.bob);

  // torso
  let g = c.createLinearGradient(0, 22, 0, 44);
  g.addColorStop(0, '#ff6b6b');
  g.addColorStop(1, '#c9184a');
  c.fillStyle = g;
  rr(c, X - 11, 22, 22, 22, 8);
  c.fill();
  c.fillStyle = '#ffd166';
  c.fillRect(X - 11, 37, 22, 3.5);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  rr(c, X - 8, 24, 4, 12, 2);
  c.fill();

  // arms
  const arm = (sx: number, ang: number, back: boolean) => {
    const len = 13;
    const ex = sx + Math.sin(ang) * len;
    const ey = 27 + Math.cos(ang) * len;
    c.strokeStyle = back ? '#a3123a' : '#d6264f';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(sx, 27);
    c.lineTo(ex, ey);
    c.stroke();
    c.fillStyle = skin;
    c.beginPath();
    c.arc(ex, ey, 3.2, 0, Math.PI * 2);
    c.fill();
  };
  if (p.shoot) {
    arm(X - 6, Math.PI - 0.15, true);
    arm(X + 7, Math.PI + 0.15, false);
  } else {
    const sw = Math.sin(p.phase) * p.amp * 0.8;
    arm(X - 6, -sw + 0.1, true);
    arm(X + 7, sw + 0.1, false);
  }

  // head
  g = c.createRadialGradient(X - 3, 10, 1, X, 14, 11);
  g.addColorStop(0, '#ffe6cc');
  g.addColorStop(1, '#f0b27a');
  c.fillStyle = g;
  c.beginPath();
  c.arc(X, 14, 10, 0, Math.PI * 2);
  c.fill();
  // cap
  c.fillStyle = '#1d3557';
  c.beginPath();
  c.arc(X, 13, 10.5, Math.PI, Math.PI * 2);
  c.closePath();
  c.fill();
  c.fillStyle = '#e63946';
  rr(c, X + 2, 8.5, 14, 4, 2);
  c.fill();
  // goggles
  c.fillStyle = '#264653';
  c.fillRect(X - 10, 12, 20, 3);
  g = c.createRadialGradient(X + 4, 12, 0.5, X + 5, 14, 5);
  g.addColorStop(0, '#e0fbff');
  g.addColorStop(1, '#2ec4b6');
  c.fillStyle = g;
  c.beginPath();
  c.arc(X + 5, 14, 4.5, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#264653';
  c.lineWidth = 1.2;
  c.stroke();
  // smile
  c.strokeStyle = '#7a3e1d';
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(X + 2, 17.5, 3, 0.2, Math.PI - 0.5);
  c.stroke();

  c.restore();
}

// ----------------------------------------------------------- props & effects

function drawBlock(c: CanvasRenderingContext2D, w: number, h: number): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#b88a5a');
  g.addColorStop(1, '#6a4a2b');
  c.fillStyle = g;
  rr(c, 0, 0, w, h, 5);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  rr(c, 2, 1.5, w - 4, 3, 1.5);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(2, h - 3.5, w - 4, 2.5);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 1;
  for (let x = 30; x < w - 10; x += 30) {
    c.beginPath();
    c.moveTo(x, 4);
    c.lineTo(x, h - 4);
    c.stroke();
  }
  c.fillStyle = '#f1d9a8';
  for (const x of [7, w - 7]) {
    c.beginPath();
    c.arc(x, h / 2 + 1, 1.8, 0, Math.PI * 2);
    c.fill();
  }
}

function drawPowerUp(c: CanvasRenderingContext2D, kind: 'double' | 'shield' | 'freeze', color: string): void {
  const cx = 18;
  const cy = 18;
  let g = c.createRadialGradient(cx, cy, 8, cx, cy, 18);
  g.addColorStop(0, lighten(color, 0.2, 0.5));
  g.addColorStop(1, lighten(color, 0.2, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, 18, 0, Math.PI * 2);
  c.fill();

  g = c.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 13);
  g.addColorStop(0, lighten(color, 0.6));
  g.addColorStop(1, darken(color, 0.25));
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, 13, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 2;
  c.stroke();

  c.fillStyle = '#10213a';
  c.strokeStyle = '#10213a';
  c.lineWidth = 2;
  c.lineCap = 'round';
  if (kind === 'double') {
    c.font = 'bold 12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('2x', cx, cy + 1);
  } else if (kind === 'shield') {
    c.beginPath();
    c.moveTo(cx, cy - 7);
    c.lineTo(cx + 6, cy - 4);
    c.lineTo(cx + 5, cy + 3);
    c.lineTo(cx, cy + 8);
    c.lineTo(cx - 5, cy + 3);
    c.lineTo(cx - 6, cy - 4);
    c.closePath();
    c.fill();
  } else {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      c.beginPath();
      c.moveTo(cx - Math.cos(a) * 7, cy - Math.sin(a) * 7);
      c.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
      c.stroke();
    }
  }
}

function radialDot(c: CanvasRenderingContext2D, size: number, inner: string, outer: string): void {
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.beginPath();
  c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  c.fill();
}

// -------------------------------------------------------------- backgrounds

type Style = 'hills' | 'city' | 'spikes';
const STYLES: Style[] = ['hills', 'city', 'hills', 'city', 'spikes'];

function drawSky(c: CanvasRenderingContext2D, i: number): void {
  const [a, b] = levels[i].bg;
  const r = rng(1000 + i * 17);
  const g = c.createLinearGradient(0, 0, 0, BG_H);
  g.addColorStop(0, darken(a, 0.3));
  g.addColorStop(0.55, a);
  g.addColorStop(1, lighten(b, 0.12));
  c.fillStyle = g;
  c.fillRect(0, 0, BG_W, BG_H);

  for (let k = 0; k < 80; k++) {
    c.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.6})`;
    const s = 0.5 + r() * 1.3;
    c.fillRect(r() * BG_W, r() * 260, s, s);
  }

  const mx = 120 + r() * 560;
  const my = 70 + r() * 60;
  const halo = c.createRadialGradient(mx, my, 10, mx, my, 170);
  halo.addColorStop(0, lighten(b, 0.7, 0.45));
  halo.addColorStop(1, lighten(b, 0.7, 0));
  c.fillStyle = halo;
  c.fillRect(0, 0, BG_W, 340);
  const m = c.createRadialGradient(mx - 6, my - 6, 2, mx, my, 28);
  m.addColorStop(0, '#ffffff');
  m.addColorStop(1, lighten(b, 0.6));
  c.fillStyle = m;
  c.beginPath();
  c.arc(mx, my, 26, 0, Math.PI * 2);
  c.fill();
}

function drawSilhouette(
  c: CanvasRenderingContext2D,
  style: Style,
  w: number,
  h: number,
  color: string,
  seed: number,
  windows: boolean,
): void {
  const r = rng(seed);
  c.fillStyle = color;
  if (style === 'hills') {
    const k1 = 2 + Math.floor(r() * 2);
    const k2 = 5 + Math.floor(r() * 3);
    const p1 = r() * 6;
    const p2 = r() * 6;
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const y = h * 0.55 - Math.sin((x / w) * Math.PI * 2 * k1 + p1) * h * 0.2 - Math.sin((x / w) * Math.PI * 2 * k2 + p2) * h * 0.08;
      c.lineTo(x, y);
    }
    c.lineTo(w, h);
    c.closePath();
    c.fill();
  } else if (style === 'city') {
    let x = 0;
    while (x < w) {
      const bw = Math.min(w - x, 22 + r() * 34);
      const bh = h * (0.3 + r() * 0.55);
      c.fillRect(x, h - bh, bw - 2, bh);
      if (windows) {
        for (let wy = h - bh + 8; wy < h - 8; wy += 10) {
          for (let wx = x + 5; wx < x + bw - 8; wx += 8) {
            if (r() < 0.45) {
              c.fillStyle = `rgba(255,224,130,${0.35 + r() * 0.4})`;
              c.fillRect(wx, wy, 3.5, 4.5);
            }
          }
        }
        c.fillStyle = color;
      }
      x += bw;
    }
  } else {
    let x = 0;
    while (x < w) {
      const bw = Math.min(w - x, 30 + r() * 50);
      const bh = h * (0.4 + r() * 0.55);
      c.beginPath();
      c.moveTo(x, h);
      c.lineTo(x + bw / 2, h - bh);
      c.lineTo(x + bw, h);
      c.closePath();
      c.fill();
      x += bw * 0.8;
    }
  }
}

// ------------------------------------------------------------------- public

export function blockTexture(scene: Phaser.Scene, w: number, h: number): string {
  const key = `block_${w}x${h}`;
  make(scene, key, w, h, (c) => drawBlock(c, w, h));
  return key;
}

/** Number of `yield`s in `generateArt`, used to report loading progress. */
export const ART_STEPS = 3 + levels.length;

/** Generates every texture; yields between groups so the caller can keep the UI responsive. */
export function* generateArt(scene: Phaser.Scene): Generator<void, void, void> {
  TIER_RADIUS.forEach((r, t) => {
    const size = 2 * (r + GLOW);
    make(scene, `bubble_${t}`, size, size, (c) => drawBubble(c, size, r, TIER_COLOR[t]));
  });
  yield;

  for (const name of PLAYER_FRAMES) make(scene, `pl_${name}`, 44, 60, (c) => drawPlayer(c, POSES[name]));
  yield;

  make(scene, 'rope', 6, 16, (c) => {
    c.fillStyle = '#ecd9ab';
    c.fillRect(0, 0, 6, 16);
    c.strokeStyle = '#9a7b4f';
    c.lineWidth = 2.5;
    for (let y = -4; y < 20; y += 8) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(6, y + 4);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.fillRect(1, 0, 1.2, 16);
  });
  make(scene, 'tip', 16, 22, (c) => {
    const g = c.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, '#8795a3');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(1, '#8795a3');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(8, 0);
    c.lineTo(15, 19);
    c.lineTo(8, 15);
    c.lineTo(1, 19);
    c.closePath();
    c.fill();
    c.strokeStyle = '#3d4856';
    c.lineWidth = 1;
    c.stroke();
  });

  make(scene, 'glow', 48, 48, (c) => radialDot(c, 48, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'));
  make(scene, 'dot', 12, 12, (c) => radialDot(c, 12, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'));
  make(scene, 'ring', 64, 64, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(32, 32, 28, 0, Math.PI * 2);
    c.stroke();
  });
  make(scene, 'shadow', 64, 14, (c) => {
    c.translate(32, 7);
    c.scale(1, 0.22);
    radialDot2(c);
  });
  make(scene, 'heart', 20, 18, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 18);
    g.addColorStop(0, '#ff8fa3');
    g.addColorStop(1, '#e5173f');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(10, 17);
    c.bezierCurveTo(-4, 7, 3, -3, 10, 4);
    c.bezierCurveTo(17, -3, 24, 7, 10, 17);
    c.fill();
    c.strokeStyle = 'rgba(80,0,20,0.6)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.ellipse(5.5, 5, 2.2, 1.4, -0.6, 0, Math.PI * 2);
    c.fill();
  });
  make(scene, 'shield', 72, 72, (c) => {
    const g = c.createRadialGradient(36, 36, 18, 36, 36, 34);
    g.addColorStop(0, 'rgba(76,201,240,0)');
    g.addColorStop(1, 'rgba(76,201,240,0.5)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(36, 36, 34, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(200,245,255,0.9)';
    c.lineWidth = 2;
    c.stroke();
  });
  make(scene, 'cloud', 150, 56, (c) => {
    for (const [x, y, r] of [[40, 34, 20], [65, 24, 26], [95, 30, 22], [118, 36, 16], [80, 38, 24]]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  });
  make(scene, 'floor', 64, 30, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 30);
    g.addColorStop(0, '#323a5e');
    g.addColorStop(1, '#171b2e');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 30);
    const t = c.createLinearGradient(0, 0, 0, 6);
    t.addColorStop(0, '#8b9bd4');
    t.addColorStop(1, '#4a5886');
    c.fillStyle = t;
    c.fillRect(0, 0, 64, 5);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(0, 0, 64, 1.2);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 17);
    c.lineTo(64, 17);
    c.moveTo(32, 5);
    c.lineTo(32, 17);
    c.moveTo(16, 17);
    c.lineTo(16, 30);
    c.moveTo(48, 17);
    c.lineTo(48, 30);
    c.stroke();
  });

  make(scene, 'pu_double', 36, 36, (c) => drawPowerUp(c, 'double', '#f7b731'));
  make(scene, 'pu_shield', 36, 36, (c) => drawPowerUp(c, 'shield', '#4cc9f0'));
  make(scene, 'pu_freeze', 36, 36, (c) => drawPowerUp(c, 'freeze', '#a5f3fc'));

  yield;

  for (const [i, lv] of levels.entries()) {
    make(scene, `bg_${i}`, BG_W, BG_H, (c) => drawSky(c, i), BS);
    make(
      scene,
      `far_${i}`,
      BG_W,
      190,
      (c) => drawSilhouette(c, STYLES[i], BG_W, 190, darken(lv.bg[1], 0.38, 0.9), 50 + i, false),
      BS,
    );
    make(
      scene,
      `near_${i}`,
      BG_W,
      120,
      (c) => drawSilhouette(c, STYLES[i], BG_W, 120, darken(lv.bg[1], 0.62, 0.95), 90 + i, true),
      BS,
    );
    yield;
  }
}

function radialDot2(c: CanvasRenderingContext2D): void {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 32, 0, Math.PI * 2);
  c.fill();
}
