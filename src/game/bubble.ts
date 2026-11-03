import type { Rect } from './collision';

export const GRAVITY = 900;
export const TIER_RADIUS = [10, 17, 26, 38];
/** Apex height above the floor reached on a floor bounce, per tier. */
export const TIER_BOUNCE = [110, 170, 230, 290];
export const TIER_SPEED = [150, 120, 95, 75];
export const TIER_COLOR = ['#ffd166', '#06d6a0', '#4cc9f0', '#ef476f'];

export interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tier: number; // 0..3
}

export interface Bounds {
  left: number;
  right: number;
  floor: number;
  ceiling: number;
}

export function radius(b: Bubble): number {
  return TIER_RADIUS[b.tier];
}

export function bounceSpeed(tier: number): number {
  return Math.sqrt(2 * GRAVITY * TIER_BOUNCE[tier]);
}

export function createBubble(x: number, y: number, tier: number, dir: 1 | -1, vy = 0): Bubble {
  return { x, y, vx: dir * TIER_SPEED[tier], vy, tier };
}

/** Hit by a harpoon: returns the two smaller bubbles, or [] when the smallest tier pops. */
export function split(b: Bubble): Bubble[] {
  if (b.tier === 0) return [];
  const t = b.tier - 1;
  return [createBubble(b.x - 4, b.y, t, -1, -220), createBubble(b.x + 4, b.y, t, 1, -220)];
}

export function stepBubble(b: Bubble, dt: number, bounds: Bounds, blocks: Rect[]): void {
  const r = radius(b);
  b.vy += GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x - r < bounds.left) {
    b.x = bounds.left + r;
    b.vx = Math.abs(b.vx);
  } else if (b.x + r > bounds.right) {
    b.x = bounds.right - r;
    b.vx = -Math.abs(b.vx);
  }
  if (b.y + r >= bounds.floor) {
    b.y = bounds.floor - r;
    b.vy = -bounceSpeed(b.tier);
  }
  if (b.y - r < bounds.ceiling) {
    b.y = bounds.ceiling + r;
    b.vy = Math.abs(b.vy);
  }

  for (const k of blocks) {
    const cx = Math.max(k.x, Math.min(b.x, k.x + k.w));
    const cy = Math.max(k.y, Math.min(b.y, k.y + k.h));
    let dx = b.x - cx;
    let dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 === 0) {
      // centre inside the block: push out through the nearest side
      dx = b.x < k.x + k.w / 2 ? -1 : 1;
      dy = 0;
      b.x = dx < 0 ? k.x - r : k.x + k.w + r;
      b.vx = dx * Math.abs(b.vx);
      continue;
    }
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    b.x = cx + nx * r;
    b.y = cy + ny * r;
    if (Math.abs(ny) > Math.abs(nx)) {
      b.vy = ny < 0 ? -bounceSpeed(b.tier) : Math.abs(b.vy);
    } else {
      b.vx = nx < 0 ? -Math.abs(b.vx) : Math.abs(b.vx);
    }
  }
}
