import type { Rect } from './collision';

export const GRAVITY = 900;
export const TIER_RADIUS = [10, 17, 26, 38];
/** Apex height above the floor reached on a floor bounce, per tier. */
export const TIER_BOUNCE = [110, 170, 230, 290];
export const TIER_SPEED = [150, 120, 95, 75];
export const TIER_COLOR = ['#ffd166', '#06d6a0', '#4cc9f0', '#ef476f'];

/**
 * normal:     splits in two
 * triple:     splits in three
 * horizontal: splits into two fast sideways-flying bubbles
 * armored:    survives the first hit (cracks), then behaves like a normal bubble
 * erratic:    bounces to random heights and changes direction at random
 */
export type BubbleKind = 'normal' | 'triple' | 'horizontal' | 'armored' | 'erratic';
export const BUBBLE_KINDS: BubbleKind[] = ['normal', 'triple', 'horizontal', 'armored', 'erratic'];

export interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tier: number; // 0..3
  kind: BubbleKind;
  hp: number;
}

export interface Bounds {
  left: number;
  right: number;
  floor: number;
  ceiling: number;
}

export type Rand = () => number;

export function radius(b: Bubble): number {
  return TIER_RADIUS[b.tier];
}

export function bounceSpeed(tier: number): number {
  return Math.sqrt(2 * GRAVITY * TIER_BOUNCE[tier]);
}

export function createBubble(
  x: number,
  y: number,
  tier: number,
  dir: 1 | -1,
  vy = 0,
  kind: BubbleKind = 'normal',
): Bubble {
  return { x, y, vx: dir * TIER_SPEED[tier], vy, tier, kind, hp: kind === 'armored' ? 2 : 1 };
}

/** Applies one harpoon hit. Returns true when the bubble is destroyed (and should split). */
export function damage(b: Bubble): boolean {
  if (b.hp > 1) {
    b.hp--;
    b.kind = 'normal'; // armour is gone
    b.vy = Math.min(b.vy, -160); // small knock-back
    return false;
  }
  return true;
}

/** A destroyed bubble's offspring; the smallest tier just pops. */
export function split(b: Bubble): Bubble[] {
  if (b.tier === 0) return [];
  const t = b.tier - 1;
  switch (b.kind) {
    case 'triple': {
      const mid = createBubble(b.x, b.y - 4, t, 1, -320, 'normal');
      mid.vx *= 0.15;
      return [createBubble(b.x - 6, b.y, t, -1, -220), mid, createBubble(b.x + 6, b.y, t, 1, -220)];
    }
    case 'horizontal': {
      const l = createBubble(b.x - 4, b.y, t, -1, -90, 'horizontal');
      const r = createBubble(b.x + 4, b.y, t, 1, -90, 'horizontal');
      l.vx *= 2.4;
      r.vx *= 2.4;
      return [l, r];
    }
    case 'erratic':
      return [createBubble(b.x - 4, b.y, t, -1, -220, 'erratic'), createBubble(b.x + 4, b.y, t, 1, -220, 'erratic')];
    default:
      return [createBubble(b.x - 4, b.y, t, -1, -220), createBubble(b.x + 4, b.y, t, 1, -220)];
  }
}

function bounceVelocity(b: Bubble, rand: Rand): number {
  const mul = b.kind === 'erratic' ? 0.6 + rand() * 0.65 : 1;
  if (b.kind === 'erratic') {
    b.vx = (rand() < 0.5 ? -1 : 1) * TIER_SPEED[b.tier] * (0.6 + rand() * 0.9);
  }
  return -bounceSpeed(b.tier) * mul;
}

export function stepBubble(b: Bubble, dt: number, bounds: Bounds, blocks: Rect[], rand: Rand = Math.random): void {
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
    b.vy = bounceVelocity(b, rand);
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
      b.vy = ny < 0 ? bounceVelocity(b, rand) : Math.abs(b.vy);
    } else {
      b.vx = nx < 0 ? -Math.abs(b.vx) : Math.abs(b.vx);
    }
  }
}
