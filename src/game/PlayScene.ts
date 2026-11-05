import Phaser from 'phaser';
import {
  type Bubble,
  type Bounds,
  TIER_COLOR,
  createBubble,
  damage,
  radius,
  split,
  stepBubble,
} from './bubble';
import { circleRect, circleVSegment, type Rect } from './collision';
import { levels, type LevelDef, type Weather } from './levels';
import { BS, S, blockTexture, bubbleKey, type PowerKind } from './art';
import { H, W, setupView, viewScale } from './view';
import { addSettingsButton } from './settingsButton';
import { haptic, onSettingsOpen, settings, settingsUi } from '../settings';
import { Sfx } from '../sfx';
import { touch } from '../touch';

const CEILING = 36;
const FLOOR = 470;
const BOUNDS: Bounds = { left: 0, right: W, floor: FLOOR, ceiling: CEILING };

const PLAYER_W = 30;
const PLAYER_H = 42;
const PLAYER_SPEED = 270;
const HARPOON_SPEED = 560;
const STICKY_HOLD = 1.4;
const START_LIVES = 3;
const MAX_LIVES = 5;
const COMBO_WINDOW = 1.5;
const SLOWMO_FACTOR = 0.4;
const DEATH_SLOWDOWN = 0.25;
const STEP = 1 / 60;
const FONT = 'system-ui, sans-serif';
const STROKE = '#0b1020';

type State = 'playing' | 'dying' | 'levelClear' | 'gameOver' | 'win';
type Obj = Phaser.GameObjects.GameObject;
type Pooled = { setVisible(v: boolean): unknown };

interface Harpoon {
  x: number;
  top: number;
  /** Seconds left while stuck to the ceiling (sticky power-up); -1 while still travelling. */
  stuck: number;
  dead: boolean;
}
interface PowerUp {
  x: number;
  y: number;
  type: PowerKind;
  life: number;
  t: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
}
interface Cloud {
  img: Phaser.GameObjects.Image;
  speed: number;
}
interface Ambient {
  spr: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}
interface TrailPoint {
  x: number;
  y: number;
}

const POWER_WEIGHTS: [PowerKind, number][] = [
  ['double', 3],
  ['machinegun', 2],
  ['sticky', 2],
  ['slowmo', 2],
  ['freeze', 2],
  ['shield', 2],
  ['dynamite', 1.5],
  ['life', 0.7],
];
const POWER_LABEL: Record<PowerKind, string> = {
  double: 'DOUBLE SHOT',
  machinegun: 'RAPID FIRE',
  sticky: 'STICKY',
  slowmo: 'SLOW-MO',
  freeze: 'FREEZE',
  shield: 'SHIELD',
  dynamite: 'BOOM!',
  life: '1UP!',
};
const POWER_DURATION = { double: 12, machinegun: 10, sticky: 10, slowmo: 6, freeze: 5 };
const COMBO_COLORS = ['#ffffff', '#ffe28a', '#ffb347', '#ff7a59', '#ff4d6d'];

const WEATHER: Record<Weather, { count: number; depth: number; tint: number; alpha: number }> = {
  stars: { count: 46, depth: 1.5, tint: 0xffffff, alpha: 0.9 },
  rain: { count: 110, depth: 11.5, tint: 0xaed6ff, alpha: 0.35 },
  fireflies: { count: 24, depth: 11.5, tint: 0xd9ff7a, alpha: 1 },
  snow: { count: 80, depth: 11.5, tint: 0xffffff, alpha: 0.7 },
  embers: { count: 50, depth: 11.5, tint: 0xff8a3d, alpha: 0.9 },
};

const hex = (s: string): number => parseInt(s.slice(1), 16);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export function loadBest(): number {
  try {
    return Number(localStorage.getItem('pang-best') ?? 0) || 0;
  } catch {
    return 0;
  }
}

export class PlayScene extends Phaser.Scene {
  private sfx!: Sfx;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // display objects
  private levelObjs: Obj[] = [];
  private clouds: Cloud[] = [];
  private ambient: Ambient[] = [];
  private weather: Weather = 'stars';
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private bubbleSpr: Phaser.GameObjects.Image[] = [];
  private glowSpr: Phaser.GameObjects.Image[] = [];
  private shadowSpr: Phaser.GameObjects.Image[] = [];
  private trailSpr: Phaser.GameObjects.Image[] = [];
  private ropeSpr: Phaser.GameObjects.TileSprite[] = [];
  private tipSpr: Phaser.GameObjects.Image[] = [];
  private tipGlow: Phaser.GameObjects.Image[] = [];
  private puSpr: Phaser.GameObjects.Image[] = [];
  private partSpr: Phaser.GameObjects.Image[] = [];
  private heartSpr: Phaser.GameObjects.Image[] = [];
  private playerSpr!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  private shieldSpr!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Rectangle;
  private overlayA = 0;
  private overlayColor = 0x000000;
  private barG!: Phaser.GameObjects.Graphics;
  private hud!: Record<'score' | 'level' | 'time' | 'best' | 'powers' | 'combo', Phaser.GameObjects.Text>;
  private banner!: Phaser.GameObjects.Container;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerKey = '';
  private builtLevel = -1;
  private trails = new Map<Bubble, TrailPoint[]>();

  // game state
  private state: State = 'playing';
  private paused = false;
  private levelIdx = 0;
  private level: LevelDef = levels[0];

  private px = W / 2;
  private facing: 1 | -1 = 1;
  private moving = false;
  private shootTimer = 0;
  private animT = 0;
  private nearGap = Infinity;
  private nearDir: 1 | -1 = 1;
  private lives = START_LIVES;
  private score = 0;
  private best = 0;
  private invuln = 0;
  private fireCooldown = 0;
  private doubleTime = 0;
  private rapidTime = 0;
  private stickyTime = 0;
  private slowTime = 0;
  private freezeTime = 0;
  private shield = false;
  private timeLeft = 0;
  private stateTimer = 0;
  private levelBonus = 0;
  private combo = 0;
  private comboTimer = 0;
  private shownCombo = 0;
  private hitStop = 0;
  private timeScale = 1;
  private deathReal = 0;
  private deathDir: 1 | -1 = 1;
  private acc = 0;
  private confirmPressed = false;

  private bubbles: Bubble[] = [];
  private harpoons: Harpoon[] = [];
  private powerUps: PowerUp[] = [];
  private particles: Particle[] = [];

  constructor() {
    super('play');
  }

  create(): void {
    // The scene instance is reused across restarts, so reset every display reference.
    this.levelObjs = [];
    this.clouds = [];
    this.ambient = [];
    this.bubbleSpr = [];
    this.glowSpr = [];
    this.shadowSpr = [];
    this.trailSpr = [];
    this.ropeSpr = [];
    this.tipSpr = [];
    this.tipGlow = [];
    this.puSpr = [];
    this.partSpr = [];
    this.heartSpr = [];
    this.trails = new Map();
    this.builtLevel = -1;
    this.bannerKey = '';
    this.paused = false;
    this.acc = 0;
    this.hitStop = 0;
    this.timeScale = 1;
    this.overlayA = 0;
    this.shownCombo = 0;

    this.sfx = this.registry.get('sfx') as Sfx;
    this.best = loadBest();
    this.input.addPointer(2);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE,ENTER,P,ESC,M') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
    // taps on the gear button (a game object) are not "confirm" taps
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Obj[]) => {
      if (over.length === 0) this.confirmPressed = true;
    });
    // opening the settings dialog swallows key/touch releases, so drop any held input
    const stopHeld = onSettingsOpen(() => {
      for (const key of Object.values(this.keys)) key.reset();
      touch.left = touch.right = touch.fire = false;
    });
    this.events.once('shutdown', () => {
      stopHeld();
      this.sfx.stopMusic();
    });

    this.createActors();
    this.createHud();
    setupView(this, () => [...Object.values(this.hud), this.bannerTitle, this.bannerSub]);

    this.lives = START_LIVES;
    this.score = 0;
    // `?level=3` in the URL starts on that level (handy for testing)
    const start = Number(new URLSearchParams(window.location.search).get('level'));
    this.levelIdx = Number.isInteger(start) && start >= 1 ? Math.min(start, levels.length) - 1 : 0;
    this.loadLevel();
  }

  private img(key: string, depth: number): Phaser.GameObjects.Image {
    return this.add.image(0, 0, key).setScale(1 / S).setDepth(depth);
  }

  private createActors(): void {
    this.playerShadow = this.img('shadow', 6);
    this.playerSpr = this.img('pl_idle0', 9).setOrigin(0.5, 1).setScale(0.8 / S);
    this.shieldSpr = this.img('shield', 12).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(24);
  }

  private createHud(): void {
    const panel = this.add.graphics().setDepth(20);
    panel.fillStyle(0x070b18, 0.62).fillRect(0, 0, W, CEILING);
    panel.fillStyle(0xffffff, 0.12).fillRect(0, CEILING - 1, W, 1);
    this.barG = this.add.graphics().setDepth(21);

    const txt = (x: number, y: number, ox: number, size: number, color = '#ffffff') =>
      this.add
        .text(x, y, '', {
          fontFamily: FONT,
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color,
          stroke: STROKE,
          strokeThickness: 3,
        })
        .setOrigin(ox, 0.5)
        .setDepth(22);
    this.hud = {
      score: txt(12, 17, 0, 16),
      level: txt(400, 17, 0.5, 16),
      time: txt(560, 17, 0.5, 16),
      best: txt(W - 44, 17, 1, 16, '#ffd166'),
      powers: txt(12, CEILING + 14, 0, 13, '#e8f4ff').setLineSpacing(4).setOrigin(0, 0),
      combo: txt(W / 2, CEILING + 24, 0.5, 24, '#ffd166').setVisible(false),
    };
    for (let i = 0; i < MAX_LIVES; i++) {
      this.heartSpr.push(this.img('heart', 22).setPosition(210 + i * 24, 18));
    }

    addSettingsButton(this, W - 22, 18, 23);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x050814, 0.72).fillRect(-W / 2, -82, W, 164);
    panelBg.fillStyle(0xffd166, 0.9).fillRect(-W / 2, -82, W, 2).fillRect(-W / 2, 80, W, 2);
    this.bannerTitle = this.add
      .text(0, -22, '', { fontFamily: FONT, fontSize: '50px', fontStyle: 'bold', color: '#ffffff', stroke: STROKE, strokeThickness: 7 })
      .setOrigin(0.5);
    this.bannerSub = this.add
      .text(0, 38, '', { fontFamily: FONT, fontSize: '21px', color: '#cfd8ff', stroke: STROKE, strokeThickness: 3 })
      .setOrigin(0.5);
    this.banner = this.add.container(W / 2, 235, [panelBg, this.bannerTitle, this.bannerSub]).setDepth(30).setVisible(false);
  }

  // ---------------------------------------------------------------- state

  private loadLevel(): void {
    this.level = levels[this.levelIdx];
    if (this.builtLevel !== this.levelIdx) this.buildLevel();
    this.bubbles = this.level.bubbles.map((s) => createBubble(s.x, s.y, s.tier, s.dir, 0, s.kind));
    this.trails.clear();
    this.harpoons = [];
    this.powerUps = [];
    this.particles = [];
    this.px = W / 2;
    this.invuln = 1.5;
    this.timeLeft = this.level.time;
    this.freezeTime = 0;
    this.doubleTime = 0;
    this.rapidTime = 0;
    this.stickyTime = 0;
    this.slowTime = 0;
    this.shield = false;
    this.fireCooldown = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.timeScale = 1;
    this.nearGap = Infinity;
    this.state = 'playing';
  }

  private buildLevel(): void {
    for (const o of this.levelObjs) o.destroy();
    this.levelObjs = [];
    this.clouds = [];
    this.ambient = [];
    const i = this.levelIdx;
    this.builtLevel = i;
    const add = <T extends Obj>(o: T): T => {
      this.levelObjs.push(o);
      return o;
    };

    add(this.add.image(0, 0, `bg_${i}`).setOrigin(0).setScale(1 / BS).setDepth(0));
    this.weather = this.level.weather;
    const w = WEATHER[this.weather];
    for (let n = 0; n < w.count; n++) {
      const spr = add(this.img('dot', w.depth).setBlendMode(Phaser.BlendModes.ADD).setTint(w.tint));
      const a: Ambient = { spr, x: 0, y: 0, vx: 0, vy: 0, size: 1, phase: Math.random() * 6.28 };
      this.resetAmbient(a, true);
      this.ambient.push(a);
    }
    for (let c = 0; c < 4; c++) {
      const img = add(this.add.image(Math.random() * W, 50 + Math.random() * 140, 'cloud'))
        .setScale((0.8 + Math.random() * 0.8) / S)
        .setDepth(1);
      this.clouds.push({ img, speed: 4 + Math.random() * 8 });
    }
    this.far = add(
      this.add.tileSprite(0, FLOOR - 190, W, 190, `far_${i}`).setOrigin(0).setTileScale(1 / BS, 1 / BS).setDepth(2),
    );
    this.near = add(
      this.add.tileSprite(0, FLOOR - 120, W, 120, `near_${i}`).setOrigin(0).setTileScale(1 / BS, 1 / BS).setDepth(3),
    );
    add(this.add.tileSprite(0, FLOOR, W, H - FLOOR, 'floor').setOrigin(0).setTileScale(1 / S, 1 / S).setDepth(4));
    for (const k of this.level.blocks) {
      add(this.add.image(k.x, k.y, blockTexture(this, k.w, k.h)).setOrigin(0).setScale(1 / S).setDepth(5));
    }
    this.sfx.startMusic(i);
  }

  private resetAmbient(a: Ambient, initial: boolean): void {
    a.x = Math.random() * W;
    switch (this.weather) {
      case 'stars':
        a.y = rand(CEILING, 300);
        a.size = rand(2.5, 6);
        a.vx = a.vy = 0;
        break;
      case 'rain':
        a.y = initial ? Math.random() * H : -12;
        a.vx = -90;
        a.vy = rand(520, 720);
        a.size = 1.5;
        break;
      case 'fireflies':
        a.y = rand(200, FLOOR - 20);
        a.vx = rand(-12, 12);
        a.vy = rand(-10, 10);
        a.size = rand(5, 9);
        break;
      case 'snow':
        a.y = initial ? Math.random() * H : -8;
        a.vx = 0;
        a.vy = rand(25, 60);
        a.size = rand(2.5, 5);
        break;
      case 'embers':
        a.y = initial ? rand(CEILING, FLOOR) : FLOOR + 6;
        a.vx = rand(-18, 18);
        a.vy = -rand(30, 100);
        a.size = rand(3, 6);
        break;
    }
  }

  private addScore(n: number): void {
    this.score += n;
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem('pang-best', String(this.best));
      } catch {
        /* storage unavailable */
      }
    }
  }

  // --------------------------------------------------------------- update

  update(_time: number, delta: number): void {
    const real = Math.min(100, delta) / 1000;
    if (this.state === 'dying') this.deathReal += real;
    this.acc += real;
    const scale = this.hitStop > 0 ? 0 : this.timeScale;
    if (this.hitStop > 0) this.hitStop -= real;
    while (this.acc >= STEP) {
      if (scale > 0) this.tick(STEP * scale);
      this.acc -= STEP;
    }
    this.render(real);
  }

  private tick(dt: number): void {
    // the game (and its music) is frozen while the settings dialog is open
    this.sfx.setMusicPaused(settingsUi.open || this.paused);
    if (settingsUi.open) return;

    const JD = Phaser.Input.Keyboard.JustDown;
    const k = this.keys;
    if (JD(k.M)) this.sfx.toggleMute();
    const pause = JD(k.P) || JD(k.ESC);
    const confirm = JD(k.SPACE) || JD(k.ENTER) || this.confirmPressed || touch.confirm;
    this.confirmPressed = false;
    touch.confirm = false;

    switch (this.state) {
      case 'gameOver':
      case 'win':
        this.stateTimer += dt;
        if (confirm && this.stateTimer > 0.8) this.scene.start('menu');
        return;
      case 'dying':
        this.stateTimer -= dt;
        this.stepWorld(dt, 1);
        if (this.stateTimer <= 0) {
          this.timeScale = 1;
          if (this.lives <= 0) {
            this.state = 'gameOver';
            this.stateTimer = 0;
            this.sfx.stopMusic();
          } else {
            this.loadLevel();
          }
        }
        return;
      case 'levelClear':
        this.stateTimer -= dt;
        this.updateParticles(dt);
        if (this.stateTimer <= 0) {
          this.levelIdx++;
          if (this.levelIdx >= levels.length) {
            this.state = 'win';
            this.stateTimer = 0;
            this.sfx.stopMusic();
            this.sfx.win();
          } else {
            this.loadLevel();
          }
        }
        return;
      case 'playing':
        break;
    }

    if (pause) {
      this.paused = !this.paused;
      this.sfx.setMusicPaused(this.paused);
    }
    if (this.paused) {
      if (confirm) {
        this.paused = false;
        this.sfx.setMusicPaused(false);
      }
      return;
    }
    this.updatePlaying(dt);
  }

  /** Bubbles, particles and falling pickups: everything that keeps moving while the player can't act. */
  private stepWorld(dt: number, bubbleScale: number): void {
    if (this.freezeTime <= 0) {
      for (const b of this.bubbles) stepBubble(b, dt * bubbleScale, BOUNDS, this.level.blocks);
    }
    for (const p of this.powerUps) {
      p.life -= dt;
      p.t += dt;
      p.y = Math.min(FLOOR - 16, p.y + 120 * dt);
    }
    this.powerUps = this.powerUps.filter((p) => p.life > 0);
    this.updateParticles(dt);
  }

  private updatePlaying(dt: number): void {
    const k = this.keys;
    const left = k.LEFT.isDown || k.A.isDown || touch.left;
    const right = k.RIGHT.isDown || k.D.isDown || touch.right;
    const fire = k.SPACE.isDown || k.UP.isDown || k.W.isDown || touch.fire;

    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    this.moving = dir !== 0;
    if (dir) this.facing = dir as 1 | -1;
    this.px = clamp(this.px + dir * PLAYER_SPEED * dt, PLAYER_W / 2, W - PLAYER_W / 2);
    this.invuln = Math.max(0, this.invuln - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    this.doubleTime = Math.max(0, this.doubleTime - dt);
    this.rapidTime = Math.max(0, this.rapidTime - dt);
    this.stickyTime = Math.max(0, this.stickyTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.freezeTime = Math.max(0, this.freezeTime - dt);

    const rapid = this.rapidTime > 0;
    const maxHarpoons = rapid ? 5 : this.doubleTime > 0 ? 2 : 1;
    if (fire && this.fireCooldown <= 0 && this.harpoons.length < maxHarpoons) {
      this.harpoons.push({ x: this.px, top: FLOOR, stuck: -1, dead: false });
      this.fireCooldown = rapid ? 0.09 : 0.18;
      this.shootTimer = 0.2;
      this.sfx.shoot();
    }

    this.updateHarpoons(dt);
    this.stepWorld(dt, this.slowTime > 0 ? SLOWMO_FACTOR : 1);

    // closest bubble, for the character's reactions
    const cy = FLOOR - PLAYER_H / 2;
    this.nearGap = Infinity;
    for (const b of this.bubbles) {
      const gap = Math.hypot(b.x - this.px, b.y - cy) - radius(b);
      if (gap < this.nearGap) {
        this.nearGap = gap;
        this.nearDir = b.x < this.px ? -1 : 1;
      }
    }

    // harpoon vs bubble
    const spawned: Bubble[] = [];
    for (const h of this.harpoons) {
      const idx = this.bubbles.findIndex((b) => circleVSegment({ x: b.x, y: b.y, r: radius(b) }, h.x, h.top, FLOOR));
      if (idx < 0) continue;
      const b = this.bubbles[idx];
      h.dead = true;
      if (!damage(b)) {
        this.crackBubble(b);
        continue;
      }
      this.bubbles.splice(idx, 1);
      this.popBubble(b, spawned);
    }
    this.harpoons = this.harpoons.filter((h) => !h.dead);
    this.bubbles.push(...spawned);

    // bubble vs player
    if (this.invuln <= 0) {
      const body: Rect = { x: this.px - PLAYER_W / 2, y: FLOOR - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
      if (this.bubbles.some((b) => circleRect({ x: b.x, y: b.y, r: radius(b) }, body))) {
        this.playerHit();
        return;
      }
    }

    // pickups
    this.powerUps = this.powerUps.filter((p) => {
      if (Math.abs(p.x - this.px) < PLAYER_W / 2 + 14 && p.y > FLOOR - PLAYER_H - 14) {
        this.collect(p);
        return false;
      }
      return true;
    });

    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.combo = 0;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.playerHit();
      return;
    }

    if (this.bubbles.length === 0) {
      this.levelBonus = Math.ceil(this.timeLeft) * 10;
      this.addScore(this.levelBonus);
      this.state = 'levelClear';
      this.stateTimer = 2.2;
      this.combo = 0;
      this.sfx.clear();
      for (let i = 0; i < 50; i++) {
        this.spawnParticle(Math.random() * W, FLOOR - Math.random() * 40, hex(TIER_COLOR[i % 4]), 1.6);
      }
    }
  }

  private updateHarpoons(dt: number): void {
    for (const h of this.harpoons) {
      if (h.stuck >= 0) {
        h.stuck -= dt;
        if (h.stuck <= 0) h.dead = true;
        continue;
      }
      h.top -= HARPOON_SPEED * dt;
      const block = this.level.blocks.find((b) => h.x >= b.x && h.x <= b.x + b.w && h.top < b.y + b.h);
      const limit = block ? block.y + block.h : CEILING;
      if (h.top <= limit) {
        if (this.stickyTime > 0) {
          h.top = limit;
          h.stuck = STICKY_HOLD;
        } else {
          h.dead = true;
        }
      }
    }
    this.harpoons = this.harpoons.filter((h) => !h.dead);
  }

  // -------------------------------------------------------------- effects

  private shake(duration: number, intensity: number): void {
    if (settings.shake) this.cameras.main.shake(duration, intensity);
  }

  private flash(duration: number, r: number, g: number, b: number): void {
    if (settings.shake) this.cameras.main.flash(duration, r, g, b);
  }

  private spawnParticle(x: number, y: number, color: number, speedMul = 1): void {
    const quality = settings.particles === 'off' ? 0 : settings.particles === 'low' ? 0.35 : 1;
    if (Math.random() >= quality) return;
    const a = Math.random() * Math.PI * 2;
    const s = (60 + Math.random() * 160) * speedMul;
    const max = 0.45 + Math.random() * 0.35;
    this.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 40,
      life: max,
      max,
      size: 5 + Math.random() * 6,
      color,
    });
  }

  private ring(x: number, y: number, r: number, color: number): void {
    if (settings.particles === 'off') return;
    const ring = this.img('ring', 11).setPosition(x, y).setBlendMode(Phaser.BlendModes.ADD).setTint(color);
    ring.setScale(r / 28 / S);
    this.tweens.add({
      targets: ring,
      scale: (r * 2.6) / 28 / S,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private floatText(x: number, y: number, text: string, color: string, size = 22): void {
    const t = this.add
      .text(clamp(x, 40, W - 40), Math.max(CEILING + 14, y), text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        stroke: STROKE,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(25)
      .setResolution(viewScale());
    this.tweens.add({
      targets: t,
      y: t.y - 46,
      alpha: 0,
      scale: { from: 0.7, to: 1.2 },
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private crackBubble(b: Bubble): void {
    this.sfx.crack();
    this.addScore(25);
    for (let i = 0; i < 10; i++) this.spawnParticle(b.x, b.y, 0xdfe6ee, 0.9);
    this.ring(b.x, b.y, radius(b), 0xdfe6ee);
    this.shake(70, 0.002);
  }

  private popBubble(b: Bubble, spawned: Bubble[]): void {
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = COMBO_WINDOW;
    this.addScore(50 * (b.tier + 1) * Math.min(this.combo, 10));
    this.sfx.pop(b.tier, this.combo);
    if (this.combo >= 2) {
      this.floatText(b.x, b.y - radius(b), `x${this.combo}`, COMBO_COLORS[Math.min(this.combo - 2, 4)], 20 + Math.min(this.combo, 8) * 2);
    }
    spawned.push(...split(b));
    const color = hex(TIER_COLOR[b.tier]);
    for (let i = 0; i < 12 + b.tier * 6; i++) this.spawnParticle(b.x, b.y, color);
    this.ring(b.x, b.y, radius(b), color);
    if (b.tier >= 2) {
      this.shake(110, 0.0035 * (b.tier - 1));
      this.hitStop = Math.max(this.hitStop, 0.04 + 0.02 * (b.tier - 2)); // short freeze for weight
      haptic(15);
    }
    if (Math.random() < 0.15) this.powerUps.push({ x: b.x, y: b.y, type: this.randomPower(), life: 9, t: 0 });
  }

  private randomPower(): PowerKind {
    const total = POWER_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [type, w] of POWER_WEIGHTS) {
      r -= w;
      if (r <= 0) return type;
    }
    return 'double';
  }

  private collect(p: PowerUp): void {
    this.sfx.power();
    haptic(12);
    this.addScore(100);
    this.ring(p.x, p.y, 14, 0xffffff);
    this.floatText(this.px, FLOOR - 70, POWER_LABEL[p.type], '#e8f4ff', 17);
    switch (p.type) {
      case 'double':
        this.doubleTime = POWER_DURATION.double;
        break;
      case 'machinegun':
        this.rapidTime = POWER_DURATION.machinegun;
        break;
      case 'sticky':
        this.stickyTime = POWER_DURATION.sticky;
        break;
      case 'slowmo':
        this.slowTime = POWER_DURATION.slowmo;
        break;
      case 'freeze':
        this.freezeTime = POWER_DURATION.freeze;
        break;
      case 'shield':
        this.shield = true;
        break;
      case 'dynamite':
        this.blast();
        break;
      case 'life':
        this.lives = Math.min(MAX_LIVES, this.lives + 1);
        this.sfx.life();
        break;
    }
  }

  /** Dynamite: pops every small bubble on screen without splitting it. */
  private blast(): void {
    this.sfx.boom();
    haptic(70);
    this.shake(380, 0.014);
    this.flash(240, 255, 200, 120);
    this.hitStop = 0.09;
    this.ring(this.px, FLOOR - 20, 140, 0xff9a3d);
    this.bubbles = this.bubbles.filter((b) => {
      if (b.tier > 1) return true;
      this.addScore(50 * (b.tier + 1));
      for (let i = 0; i < 12; i++) this.spawnParticle(b.x, b.y, hex(TIER_COLOR[b.tier]), 1.2);
      this.ring(b.x, b.y, radius(b), 0xffb347);
      return false;
    });
  }

  private playerHit(): void {
    this.sfx.hit();
    if (this.shield) {
      this.shield = false;
      this.invuln = 1.5;
      this.shake(180, 0.006);
      return;
    }
    this.sfx.die();
    haptic([120, 50, 90]);
    this.shake(260, 0.012);
    this.flash(220, 255, 70, 70);
    this.lives--;
    this.combo = 0;
    this.comboTimer = 0;
    this.state = 'dying';
    this.stateTimer = 0.35; // simulation seconds; at 0.25x speed this is ~1.4s of real time
    this.timeScale = DEATH_SLOWDOWN;
    this.deathReal = 0;
    this.deathDir = Math.random() < 0.5 ? -1 : 1;
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // --------------------------------------------------------------- render

  private sync<T extends Pooled>(pool: T[], n: number, factory: () => T): void {
    while (pool.length < n) pool.push(factory());
    for (let i = 0; i < pool.length; i++) pool[i].setVisible(i < n);
  }

  private render(dt: number): void {
    this.animT += dt;

    // parallax + drifting clouds
    this.far.tilePositionX = (this.px - W / 2) * 0.06 * BS;
    this.near.tilePositionX = (this.px - W / 2) * 0.16 * BS;
    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      if (c.img.x > W + 90) c.img.x = -90;
    }

    this.renderAmbient(dt);
    this.renderBubbles();
    this.renderHarpoons();
    this.renderPowerUps();
    this.renderParticles();
    this.renderPlayer();
    this.renderOverlay(dt);
    this.renderHud();
    this.renderBanner();
  }

  private renderAmbient(dt: number): void {
    const t = this.animT;
    const cfg = WEATHER[this.weather];
    const on = settings.weather;
    for (const a of this.ambient) a.spr.setVisible(on);
    if (!on) return;
    for (const a of this.ambient) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      let alpha = cfg.alpha;
      let sx = a.size / 12 / S;
      let sy = sx;
      switch (this.weather) {
        case 'stars':
          alpha *= 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + a.phase));
          break;
        case 'rain':
          sx = 1.3 / 12 / S;
          sy = 17 / 12 / S;
          if (a.y > FLOOR) this.resetAmbient(a, false);
          break;
        case 'fireflies':
          a.vx += Math.cos(t * 0.8 + a.phase) * 18 * dt;
          a.vy += Math.sin(t * 0.7 + a.phase * 2) * 18 * dt;
          a.vx = clamp(a.vx, -22, 22);
          a.vy = clamp(a.vy, -16, 16);
          a.y = clamp(a.y, 180, FLOOR - 12);
          alpha *= 0.15 + 0.85 * Math.max(0, Math.sin(t * 1.6 + a.phase));
          break;
        case 'snow':
          a.x += Math.sin(t + a.phase) * 14 * dt;
          if (a.y > FLOOR) this.resetAmbient(a, false);
          break;
        case 'embers':
          a.x += Math.sin(t * 2 + a.phase) * 16 * dt;
          alpha *= clamp((a.y - CEILING) / 160, 0, 1) * (0.6 + 0.4 * Math.sin(t * 9 + a.phase));
          if (a.y < CEILING) this.resetAmbient(a, false);
          break;
      }
      if (a.x < -10) a.x = W + 10;
      else if (a.x > W + 10) a.x = -10;
      a.spr.setPosition(a.x, a.y).setAlpha(alpha).setScale(sx, sy);
    }
  }

  private renderBubbles(): void {
    const n = this.bubbles.length;
    this.sync(this.bubbleSpr, n, () => this.img(bubbleKey('normal', 0), 10));
    const fx = settings.glow;
    this.sync(this.glowSpr, fx ? n : 0, () => this.img('glow', 9.5).setBlendMode(Phaser.BlendModes.ADD));
    this.sync(this.shadowSpr, n, () => this.img('shadow', 6));
    const frozen = this.freezeTime > 0;

    // light trails: recent positions per bubble, fading when a bubble stops moving
    const next = new Map<Bubble, TrailPoint[]>();
    let points = 0;
    for (const b of fx ? this.bubbles : []) {
      const trail = this.trails.get(b) ?? [];
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(b.x - last.x, b.y - last.y) > 3) trail.push({ x: b.x, y: b.y });
      else if (trail.length > 1) trail.shift();
      while (trail.length > 7) trail.shift();
      next.set(b, trail);
      points += trail.length;
    }
    this.trails = next;
    this.sync(this.trailSpr, points, () => this.img('dot', 9).setBlendMode(Phaser.BlendModes.ADD));
    let ti = 0;

    this.bubbles.forEach((b, i) => {
      const r = radius(b);
      const color = hex(TIER_COLOR[b.tier]);
      const near = clamp(1 - (FLOOR - (b.y + r)) / 8, 0, 1);
      const stretch = clamp(Math.abs(b.vy) / 1800, 0, 0.1);
      const sx = (1 + 0.16 * near - stretch * 0.5) / S;
      const sy = (1 - 0.16 * near + stretch) / S;
      const s = this.bubbleSpr[i].setTexture(bubbleKey(b.kind, b.tier)).setPosition(b.x, b.y + near * r * 0.1);
      s.setScale(sx, sy);
      if (frozen) s.setTint(0xcdeeff);
      else s.clearTint();

      this.glowSpr[i]
        ?.setPosition(b.x, b.y)
        .setTint(frozen ? 0xcdeeff : color)
        .setScale((r * 3.6) / 48 / S)
        .setAlpha(0.28 + Math.sin(this.animT * 3 + i) * 0.06);

      const height = FLOOR - b.y;
      const sh = (r * 2.4 * clamp(1 - height / 900, 0.4, 1)) / (64 * S);
      this.shadowSpr[i]
        .setPosition(b.x, FLOOR + 2)
        .setScale(sh, sh)
        .setAlpha(clamp(0.6 - height / 700, 0.12, 0.6));

      const trail = this.trails.get(b) ?? [];
      trail.forEach((p, j) => {
        const f = (j + 1) / trail.length;
        this.trailSpr[ti++]
          .setPosition(p.x, p.y)
          .setTint(color)
          .setAlpha(0.2 * f * f)
          .setScale((r * 2 * (0.3 + 0.55 * f)) / 12 / S);
      });
    });
  }

  private renderHarpoons(): void {
    const n = this.harpoons.length;
    this.sync(this.ropeSpr, n, () => this.add.tileSprite(0, 0, 6, 10, 'rope').setOrigin(0.5, 0).setTileScale(1 / S, 1 / S).setDepth(8));
    this.sync(this.tipSpr, n, () => this.img('tip', 8).setOrigin(0.5, 0));
    this.sync(this.tipGlow, n, () => this.img('glow', 8).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe28a));
    this.harpoons.forEach((h, i) => {
      const ropeTop = h.top + 18;
      this.ropeSpr[i].setPosition(h.x, ropeTop).setSize(6, Math.max(1, FLOOR - ropeTop));
      this.tipSpr[i].setPosition(h.x, h.top);
      const stuck = h.stuck >= 0;
      this.tipGlow[i]
        .setPosition(h.x, h.top + 8)
        .setScale((stuck ? 1.6 + Math.sin(this.animT * 18) * 0.2 : 1.1) / S)
        .setAlpha(stuck ? 0.9 : 0.7);
    });
  }

  private renderPowerUps(): void {
    this.sync(this.puSpr, this.powerUps.length, () => this.img('pu_double', 7));
    this.powerUps.forEach((p, i) => {
      const blink = p.life < 2 && Math.floor(p.life * 8) % 2 === 0;
      this.puSpr[i]
        .setTexture(`pu_${p.type}`)
        .setPosition(p.x, p.y + Math.sin(p.t * 6) * 2)
        .setScale((1 + Math.sin(p.t * 8) * 0.06) / S)
        .setAlpha(blink ? 0.3 : 1);
    });
  }

  private renderParticles(): void {
    this.sync(this.partSpr, this.particles.length, () => this.img('dot', 11).setBlendMode(Phaser.BlendModes.ADD));
    this.particles.forEach((p, i) => {
      const t = p.life / p.max;
      this.partSpr[i]
        .setPosition(p.x, p.y)
        .setTint(p.color)
        .setAlpha(clamp(t * 1.6, 0, 1))
        .setScale((p.size * (0.4 + t * 0.6)) / 12 / S);
    });
  }

  private renderPlayer(): void {
    const visible = this.state !== 'gameOver';
    this.playerSpr.setVisible(visible);
    this.playerShadow.setVisible(visible);
    this.shieldSpr.setVisible(visible && this.shield && this.state === 'playing');
    if (!visible) return;

    const baseY = FLOOR + 1;
    let frame: string;
    let x = this.px;
    let y = baseY;
    let rot = 0;
    let alpha = 1;
    let flip = this.facing < 0;
    let lift = 0;
    this.playerSpr.setOrigin(0.5, 1);

    if (this.state === 'dying') {
      // hop up, spin and fall away while the world is in slow motion
      const u = clamp(this.deathReal / 1.3, 0, 1);
      frame = 'dead';
      lift = 80 * 4 * u * (1 - u);
      y = baseY - lift + 34 * u * u - 24;
      rot = u * 5.5 * this.deathDir;
      alpha = u > 0.75 ? Math.max(0, 1 - (u - 0.75) * 4) : 1;
      this.playerSpr.setOrigin(0.5, 0.5);
    } else if (this.state === 'levelClear' || this.state === 'win') {
      frame = 'win';
      lift = Math.abs(Math.sin(this.animT * 7)) * 14;
      y = baseY - lift;
    } else if (this.shootTimer > 0) {
      frame = 'shoot';
    } else if (this.moving) {
      frame = `run${Math.floor(this.animT * 12) % 4}`;
    } else if (this.nearGap < 95) {
      frame = 'scared';
      x += Math.sin(this.animT * 45) * 1.1;
      flip = this.nearDir > 0; // leans away from the danger
    } else {
      frame = `idle${Math.floor(this.animT * 2.5) % 2}`;
      if (this.nearGap < 260) flip = this.nearDir < 0; // watches the closest bubble
    }
    if (this.state === 'playing' && this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) alpha = 0.35;

    this.playerSpr.setTexture(`pl_${frame}`).setPosition(x, y).setFlipX(flip).setRotation(rot).setAlpha(alpha);
    this.playerShadow
      .setPosition(this.px, FLOOR + 2)
      .setScale((40 * clamp(1 - lift / 160, 0.3, 1)) / (64 * S))
      .setAlpha(alpha);
    if (this.shieldSpr.visible) {
      this.shieldSpr
        .setPosition(this.px, FLOOR - PLAYER_H / 2)
        .setScale((0.9 + Math.sin(this.animT * 6) * 0.04) / S)
        .setAlpha(0.8);
    }
  }

  /** Screen tint: blue while time is slowed, red during the death slow-motion. */
  private renderOverlay(dt: number): void {
    let target = 0;
    if (this.state === 'dying') {
      this.overlayColor = 0xff2030;
      target = 0.22;
    } else if (this.slowTime > 0) {
      this.overlayColor = 0x3a6cff;
      target = 0.14;
    }
    this.overlayA += (target - this.overlayA) * Math.min(1, dt * 8);
    this.overlay.setFillStyle(this.overlayColor, this.overlayA);
  }

  private renderHud(): void {
    const h = this.hud;
    h.score.setText(`SCORE ${this.score}`);
    h.level.setText(`LEVEL ${this.levelIdx + 1}/${levels.length}`);
    const low = this.timeLeft < 10;
    h.time.setText(`TIME ${Math.ceil(this.timeLeft)}`).setColor(low ? '#ff6b6b' : '#ffffff');
    h.best.setText(`BEST ${this.best}`);
    this.heartSpr.forEach((s, i) =>
      s.setVisible(i < this.lives).setScale((1 + (i === this.lives - 1 ? Math.sin(this.animT * 5) * 0.06 : 0)) / S),
    );

    const lines: string[] = [];
    if (this.doubleTime > 0) lines.push(`2x SHOT  ${Math.ceil(this.doubleTime)}s`);
    if (this.rapidTime > 0) lines.push(`RAPID FIRE  ${Math.ceil(this.rapidTime)}s`);
    if (this.stickyTime > 0) lines.push(`STICKY  ${Math.ceil(this.stickyTime)}s`);
    if (this.slowTime > 0) lines.push(`SLOW-MO  ${Math.ceil(this.slowTime)}s`);
    if (this.freezeTime > 0) lines.push(`FREEZE  ${Math.ceil(this.freezeTime)}s`);
    if (this.shield) lines.push('SHIELD');
    h.powers.setText(lines.join('\n'));

    // combo meter
    const comboOn = this.combo >= 2 && this.comboTimer > 0;
    h.combo.setVisible(comboOn);
    if (comboOn) {
      h.combo.setText(`COMBO x${this.combo}`).setColor(COMBO_COLORS[Math.min(this.combo - 2, 4)]);
      if (this.combo !== this.shownCombo) {
        h.combo.setScale(1.45);
        this.tweens.add({ targets: h.combo, scale: 1, duration: 160, ease: 'Back.easeOut' });
      }
    }
    this.shownCombo = this.combo;

    const frac = clamp(this.timeLeft / this.level.time, 0, 1);
    this.barG.clear();
    this.barG.fillStyle(0xffffff, 0.12).fillRect(0, CEILING - 4, W, 4);
    this.barG.fillStyle(low ? 0xff5a5f : 0x4cc9f0, 1).fillRect(0, CEILING - 4, W * frac, 4);
    if (comboOn) {
      const cw = 120 * clamp(this.comboTimer / COMBO_WINDOW, 0, 1);
      this.barG.fillStyle(0xffffff, 0.15).fillRect(W / 2 - 60, CEILING + 42, 120, 4);
      this.barG.fillStyle(0xffd166, 1).fillRect(W / 2 - 60, CEILING + 42, cw, 4);
    }
  }

  private renderBanner(): void {
    let b: [string, string] | null = null;
    if (this.state === 'levelClear') b = ['LEVEL CLEAR!', `Time bonus +${this.levelBonus}`];
    else if (this.state === 'gameOver') b = ['GAME OVER', `Score ${this.score} — tap or press Space`];
    else if (this.state === 'win') b = ['YOU WIN!', `Final score ${this.score} — tap or press Space`];
    else if (this.paused) b = ['PAUSED', 'Press P or tap to resume'];
    else if (this.state === 'playing' && this.invuln > 1 && this.timeLeft > this.level.time - 1.5) {
      b = [`LEVEL ${this.levelIdx + 1}`, this.level.name];
    }

    const key = b ? b[0] + b[1] : '';
    if (key === this.bannerKey) return;
    this.bannerKey = key;
    this.banner.setVisible(!!b);
    if (!b) return;
    this.bannerTitle.setText(b[0]);
    this.bannerSub.setText(b[1]);
    this.tweens.killTweensOf(this.banner);
    this.banner.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  }
}
