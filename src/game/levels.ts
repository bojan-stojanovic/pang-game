import type { Rect } from './collision';

export interface BubbleSpawn {
  x: number;
  y: number;
  tier: number;
  dir: 1 | -1;
}

export interface LevelDef {
  name: string;
  time: number; // seconds
  bubbles: BubbleSpawn[];
  blocks: Rect[];
  bg: [string, string];
}

export const levels: LevelDef[] = [
  {
    name: 'Warm-up',
    time: 60,
    bg: ['#0b1d3a', '#1b4b7a'],
    blocks: [],
    bubbles: [{ x: 200, y: 150, tier: 2, dir: 1 }],
  },
  {
    name: 'Double Trouble',
    time: 70,
    bg: ['#2a0f3a', '#6b2a7a'],
    blocks: [],
    bubbles: [
      { x: 150, y: 140, tier: 2, dir: 1 },
      { x: 650, y: 140, tier: 2, dir: -1 },
    ],
  },
  {
    name: 'Big One',
    time: 80,
    bg: ['#0f3a2a', '#1b7a55'],
    blocks: [],
    bubbles: [
      { x: 400, y: 130, tier: 3, dir: 1 },
      { x: 120, y: 200, tier: 1, dir: 1 },
      { x: 680, y: 200, tier: 1, dir: -1 },
    ],
  },
  {
    name: 'Blocks',
    time: 90,
    bg: ['#3a2a0f', '#7a5a1b'],
    blocks: [
      { x: 220, y: 230, w: 120, h: 18 },
      { x: 460, y: 230, w: 120, h: 18 },
    ],
    bubbles: [
      { x: 120, y: 130, tier: 2, dir: 1 },
      { x: 680, y: 130, tier: 2, dir: -1 },
      { x: 400, y: 120, tier: 1, dir: 1 },
    ],
  },
  {
    name: 'Chaos',
    time: 110,
    bg: ['#3a0f14', '#7a1b2a'],
    blocks: [
      { x: 150, y: 250, w: 100, h: 18 },
      { x: 350, y: 190, w: 100, h: 18 },
      { x: 550, y: 250, w: 100, h: 18 },
    ],
    bubbles: [
      { x: 150, y: 120, tier: 3, dir: 1 },
      { x: 650, y: 120, tier: 3, dir: -1 },
      { x: 400, y: 100, tier: 2, dir: 1 },
    ],
  },
];
