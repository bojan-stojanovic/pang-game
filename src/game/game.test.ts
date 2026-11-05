import { describe, expect, it } from 'vitest';
import { circleRect, circleVSegment } from './collision';
import {
  TIER_BOUNCE,
  bounceSpeed,
  createBubble,
  damage,
  radius,
  split,
  stepBubble,
  type Bounds,
} from './bubble';
import { levels } from './levels';

const bounds: Bounds = { left: 0, right: 800, floor: 470, ceiling: 36 };

describe('collision', () => {
  it('circle vs rect', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(circleRect({ x: 12, y: 5, r: 3 }, r)).toBe(true);
    expect(circleRect({ x: 20, y: 5, r: 3 }, r)).toBe(false);
  });
  it('circle vs vertical segment', () => {
    expect(circleVSegment({ x: 105, y: 50, r: 10 }, 100, 0, 200)).toBe(true);
    expect(circleVSegment({ x: 105, y: 250, r: 10 }, 100, 0, 200)).toBe(false);
  });
});

describe('bubble', () => {
  it('splits into two smaller bubbles, smallest pops', () => {
    const parts = split(createBubble(100, 100, 2, 1));
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.tier === 1)).toBe(true);
    expect(parts[0].vx).toBeLessThan(0);
    expect(parts[1].vx).toBeGreaterThan(0);
    expect(split(createBubble(100, 100, 0, 1))).toEqual([]);
  });
  it('triple bubbles split into three, the middle one rising', () => {
    const parts = split(createBubble(100, 100, 2, 1, 0, 'triple'));
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.tier === 1 && p.kind === 'normal')).toBe(true);
    expect(parts[1].vy).toBeLessThan(parts[0].vy);
  });
  it('horizontal bubbles split into fast sideways children that stay horizontal', () => {
    const base = createBubble(100, 100, 2, 1);
    const parts = split(createBubble(100, 100, 2, 1, 0, 'horizontal'));
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.kind === 'horizontal')).toBe(true);
    expect(Math.abs(parts[1].vx)).toBeGreaterThan(Math.abs(split(base)[1].vx));
  });
  it('armored bubbles survive one hit, then become normal', () => {
    const b = createBubble(100, 100, 3, 1, 0, 'armored');
    expect(b.hp).toBe(2);
    expect(damage(b)).toBe(false);
    expect(b.kind).toBe('normal');
    expect(damage(b)).toBe(true);
  });
  it('stays inside bounds and bounces off the floor', () => {
    const b = createBubble(400, 100, 3, 1);
    let bounced = false;
    for (let i = 0; i < 60 * 20; i++) {
      stepBubble(b, 1 / 60, bounds, []);
      if (b.vy < 0 && b.y + radius(b) >= bounds.floor - 5) bounced = true;
      expect(b.x - radius(b)).toBeGreaterThanOrEqual(-0.001);
      expect(b.x + radius(b)).toBeLessThanOrEqual(800.001);
      expect(b.y + radius(b)).toBeLessThanOrEqual(bounds.floor + 0.001);
    }
    expect(bounced).toBe(true);
  });
  it('erratic bubbles bounce to uneven heights, normal ones do not', () => {
    const peaks = (kind: 'normal' | 'erratic') => {
      let n = 0;
      const rand = () => {
        n = (n * 9301 + 49297) % 233280;
        return n / 233280;
      };
      const b = createBubble(400, 440, 2, 1, 0, kind);
      const found = new Set<number>();
      let prevVy = 0;
      for (let i = 0; i < 60 * 30; i++) {
        stepBubble(b, 1 / 60, bounds, [], rand);
        if (prevVy < 0 && b.vy >= 0) found.add(Math.round(b.y / 20));
        prevVy = b.vy;
      }
      return found.size;
    };
    expect(peaks('erratic')).toBeGreaterThan(peaks('normal'));
  });
  it('bounces off blocks without tunnelling', () => {
    const block = { x: 350, y: 250, w: 100, h: 18 };
    const b = createBubble(400, 100, 1, 1);
    for (let i = 0; i < 60 * 10; i++) {
      stepBubble(b, 1 / 60, bounds, [block]);
      const inside = b.x > block.x && b.x < block.x + block.w && b.y > block.y && b.y < block.y + block.h;
      expect(inside).toBe(false);
    }
  });
  it('bounce speed matches the configured apex height', () => {
    const v = bounceSpeed(2);
    expect((v * v) / (2 * 900)).toBeCloseTo(TIER_BOUNCE[2], 5);
  });
});

describe('levels', () => {
  it('has 5 levels, each with bubbles and a weather type', () => {
    expect(levels).toHaveLength(5);
    expect(levels.every((l) => l.bubbles.length > 0 && !!l.weather)).toBe(true);
  });
});
