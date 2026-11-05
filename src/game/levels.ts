import type { BubbleKind } from './bubble';
import type { Rect } from './collision';

export type Weather = 'stars' | 'rain' | 'fireflies' | 'snow' | 'embers';

export interface BubbleSpawn {
  x: number;
  y: number;
  tier: number;
  dir: 1 | -1;
  kind?: BubbleKind;
}

export interface LevelDef {
  name: string;
  time: number; // seconds
  bubbles: BubbleSpawn[];
  blocks: Rect[];
  bg: [string, string];
  weather: Weather;
}

export const levels: LevelDef[] = [
  {
    name: 'Warm-up',
    time: 60,
    bg: ['#0b1d3a', '#1b4b7a'],
    weather: 'stars',
    blocks: [],
    bubbles: [{ x: 200, y: 150, tier: 2, dir: 1 }],
  },
  {
    name: 'Triple Threat',
    time: 70,
    bg: ['#2a0f3a', '#6b2a7a'],
    weather: 'rain',
    blocks: [],
    bubbles: [
      { x: 150, y: 140, tier: 2, dir: 1 },
      { x: 650, y: 140, tier: 2, dir: -1, kind: 'triple' },
    ],
  },
  {
    name: 'Iron Giant',
    time: 80,
    bg: ['#0f3a2a', '#1b7a55'],
    weather: 'fireflies',
    blocks: [],
    bubbles: [
      { x: 400, y: 130, tier: 3, dir: 1, kind: 'armored' },
      { x: 120, y: 200, tier: 1, dir: 1 },
      { x: 680, y: 200, tier: 1, dir: -1 },
    ],
  },
  {
    name: 'Crosswinds',
    time: 90,
    bg: ['#1a2f4a', '#4a7aa8'],
    weather: 'snow',
    blocks: [
      { x: 220, y: 230, w: 120, h: 18 },
      { x: 460, y: 230, w: 120, h: 18 },
    ],
    bubbles: [
      { x: 120, y: 130, tier: 2, dir: 1, kind: 'horizontal' },
      { x: 680, y: 130, tier: 2, dir: -1, kind: 'horizontal' },
      { x: 400, y: 120, tier: 1, dir: 1, kind: 'erratic' },
    ],
  },
  {
    name: 'Chaos',
    time: 120,
    bg: ['#3a0f14', '#7a1b2a'],
    weather: 'embers',
    blocks: [
      { x: 150, y: 250, w: 100, h: 18 },
      { x: 350, y: 190, w: 100, h: 18 },
      { x: 550, y: 250, w: 100, h: 18 },
    ],
    bubbles: [
      { x: 150, y: 120, tier: 3, dir: 1, kind: 'armored' },
      { x: 650, y: 120, tier: 3, dir: -1, kind: 'erratic' },
      { x: 400, y: 100, tier: 2, dir: 1, kind: 'triple' },
    ],
  },
];
