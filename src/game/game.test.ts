import { describe, expect, it } from 'vitest';
import { circleRect, circleVSegment } from './collision';
import { createBubble, radius, split, stepBubble, type Bounds } from './bubble';
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
  it('bounces off blocks without tunnelling', () => {
    const block = { x: 350, y: 250, w: 100, h: 18 };
    const b = createBubble(400, 100, 1, 1);
    for (let i = 0; i < 60 * 10; i++) {
      stepBubble(b, 1 / 60, bounds, [block]);
      const inside = b.x > block.x && b.x < block.x + block.w && b.y > block.y && b.y < block.y + block.h;
      expect(inside).toBe(false);
    }
  });
});

describe('levels', () => {
  it('has 5 levels, each with bubbles', () => {
    expect(levels).toHaveLength(5);
    expect(levels.every((l) => l.bubbles.length > 0)).toBe(true);
  });
});
