# Pang

A modern take on the classic arcade game *Pang* (Buster Bros). Shoot the bouncing bubbles with your harpoon before they hit you or time runs out. Each hit splits a bubble into two smaller ones until they pop.

Playable on desktop (keyboard) and mobile (on-screen touch buttons).

## Features

- 5 levels with increasing difficulty; levels 4 and 5 add solid blocks that bubbles bounce off
- Bubbles in 4 sizes that split when hit, with squash-and-stretch physics
- Eight power-ups: **double shot**, **rapid fire** (hold to machine-gun), **sticky harpoon** (stays on the ceiling), **slow-mo**, **freeze**, **shield**, **dynamite** (pops all small bubbles) and **extra life**
- Bubble variety: **triple** (splits in three), **horizontal** (splits into fast sideways bubbles), **armored** (takes two hits) and **erratic** (bounces unevenly)
- Combo multiplier for popping bubbles in quick succession, with floating "x3" popups and a rising-pitch pop sound
- Synthesized background music with a different track per level
- Hit-stop on big pops, a slow-motion death, character reactions (watches and flinches from nearby bubbles, victory pose)
- Animated weather per level: stars, rain, fireflies, snow and embers; glowing bubbles with light trails
- Time limit per level, lives, score, time bonus and a saved best score
- Procedurally generated art (no image files): glossy bubbles, animated character, parallax backgrounds, particles and screen shake
- Settings (gear icon, top right): music and effects volume, particle amount (off / low / full), screen shake and flashes, weather effects, bubble glow and trails, and vibration. They are saved on the device, and the game pauses while the dialog is open
- Renders at your screen's native resolution, so it stays sharp on high-density displays
- Loading screen, pause, and mute

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | `←` `→` or `A` `D` | On-screen ◀ ▶ buttons |
| Shoot | `Space` (also `↑` / `W`) | FIRE button |
| Start / continue | `Space` or `Enter` | Tap the screen |
| Pause | `P` or `Esc` | Tap to resume |
| Mute | `M` | – |

On a phone, play in landscape for a bigger view.

## Tech stack

- [Phaser](https://phaser.io) 4 (rendering, scenes, input, scaling)
- TypeScript 7
- [Vite](https://vite.dev) 8 (dev server and build)
- [Vitest](https://vitest.dev) 5 (unit tests)
- Web Audio API for synthesized sound effects (no audio files)

## Getting started

Requires Node.js 20.19+ or newer.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`). The dev server also listens on your network, so you can open it from a phone on the same Wi-Fi.

Add `?level=3` to the URL to start on a specific level (handy for testing).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests |

The build output in `dist/` is a plain static site; it can be hosted anywhere (Laragon, GitHub Pages, Netlify, etc.).

## Project structure

```
index.html              Page shell, loading screen, on-screen touch buttons
src/
  main.ts               Phaser game config and bootstrap
  loader.ts             Loading screen control
  touch.ts              On-screen button state
  settings.ts           Saved player settings (defaults, validation, storage)
  settingsPanel.ts      Settings dialog controller
  sfx.ts                Synthesized sound effects
  style.css             Page and touch-button styles
  game/
    BootScene.ts        Generates textures with a progress bar
    MenuScene.ts        Title screen
    PlayScene.ts        Gameplay, HUD and effects
    art.ts              Procedural graphics (bubbles, player, backgrounds)
    bubble.ts           Bubble physics and splitting
    collision.ts        Collision helpers
    levels.ts           Level definitions
    view.ts             Native-resolution scaling
    game.test.ts        Unit tests
```

## Adding a level

Levels are plain data in `src/game/levels.ts`. Add an entry with a name, time limit, background colours, optional blocks, and bubble spawns:

```ts
{
  name: 'My Level',
  time: 90,
  bg: ['#0b1d3a', '#1b4b7a'],
  blocks: [{ x: 300, y: 230, w: 120, h: 18 }],
  bubbles: [{ x: 200, y: 150, tier: 2, dir: 1 }],
}
```

`tier` is the bubble size from 0 (smallest) to 3 (largest). Also add a matching entry to the `STYLES` list in `src/game/art.ts` to choose the background silhouette.

## Ideas for later

More levels, two-player co-op, boss levels, a level editor, installable/offline support, and an online leaderboard.
