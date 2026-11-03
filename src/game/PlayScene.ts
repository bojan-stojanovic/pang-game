import Phaser from 'phaser';
import { type Bubble, type Bounds, TIER_COLOR, createBubble, radius, split, stepBubble } from './bubble';
import { circleRect, circleVSegment, type Rect } from './collision';
import { levels, type LevelDef } from './levels';
import { BS, S, blockTexture } from './art';
import { H, W, setupView } from './view';
import { Sfx } from '../sfx';
import { touch } from '../touch';

const CEILING = 36;
const FLOOR = 470;
const BOUNDS: Bounds = { left: 0, right: W, floor: FLOOR, ceiling: CEILING };

const PLAYER_W = 30;
const PLAYER_H = 42;
const PLAYER_SPEED = 270;
const HARPOON_SPEED = 560;
const START_LIVES = 3;
const FREEZE_TIME = 5;
const POWER_TIME = 12;
const STEP = 1 / 60;
const FONT = 'system-ui, sans-serif';
const STROKE = '#0b1020';

type State = 'playing' | 'levelClear' | 'gameOver' | 'win';
type PowerType = 'double' | 'shield' | 'freeze';
type Obj = Phaser.GameObjects.GameObject;
type Pooled = { setVisible(v: boolean): unknown };

interface Harpoon {
  x: number;
  top: number;
}
interface PowerUp {
  x: number;
  y: number;
  type: PowerType;
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

const hex = (s: string): number => parseInt(s.slice(1), 16);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

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
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private bubbleSpr: Phaser.GameObjects.Image[] = [];
  private shadowSpr: Phaser.GameObjects.Image[] = [];
  private ropeSpr: Phaser.GameObjects.TileSprite[] = [];
  private tipSpr: Phaser.GameObjects.Image[] = [];
  private tipGlow: Phaser.GameObjects.Image[] = [];
  private puSpr: Phaser.GameObjects.Image[] = [];
  private partSpr: Phaser.GameObjects.Image[] = [];
  private heartSpr: Phaser.GameObjects.Image[] = [];
  private playerSpr!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  private shieldSpr!: Phaser.GameObjects.Image;
  private barG!: Phaser.GameObjects.Graphics;
  private hud!: Record<'score' | 'level' | 'time' | 'best' | 'powers', Phaser.GameObjects.Text>;
  private banner!: Phaser.GameObjects.Container;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerKey = '';
  private builtLevel = -1;

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
  private lives = START_LIVES;
  private score = 0;
  private best = 0;
  private invuln = 0;
  private fireCooldown = 0;
  private doubleTime = 0;
  private shield = false;
  private freezeTime = 0;
  private timeLeft = 0;
  private stateTimer = 0;
  private levelBonus = 0;
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
    this.bubbleSpr = [];
    this.shadowSpr = [];
    this.ropeSpr = [];
    this.tipSpr = [];
    this.tipGlow = [];
    this.puSpr = [];
    this.partSpr = [];
    this.heartSpr = [];
    this.builtLevel = -1;
    this.bannerKey = '';
    this.paused = false;
    this.acc = 0;

    this.sfx = this.registry.get('sfx') as Sfx;
    this.best = loadBest();
    this.input.addPointer(2);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,A,D,W,SPACE,ENTER,P,ESC,M') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
    this.input.on('pointerdown', () => (this.confirmPressed = true));

    this.createActors();
    this.createHud();
    setupView(this, () => [...Object.values(this.hud), this.bannerTitle, this.bannerSub]);

    this.lives = START_LIVES;
    this.score = 0;
    this.levelIdx = 0;
    this.loadLevel();
  }

  private img(key: string, depth: number): Phaser.GameObjects.Image {
    return this.add.image(0, 0, key).setScale(1 / S).setDepth(depth);
  }

  private createActors(): void {
    this.playerShadow = this.img('shadow', 6);
    this.playerSpr = this.img('pl_idle0', 9).setOrigin(0.5, 1).setScale(0.8 / S);
    this.shieldSpr = this.img('shield', 12).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
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
      best: txt(W - 12, 17, 1, 16, '#ffd166'),
      powers: txt(12, CEILING + 14, 0, 13, '#e8f4ff').setLineSpacing(4).setOrigin(0, 0),
    };
    for (let i = 0; i < START_LIVES; i++) {
      this.heartSpr.push(this.img('heart', 22).setPosition(210 + i * 24, 18));
    }

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
    this.bubbles = this.level.bubbles.map((s) => createBubble(s.x, s.y, s.tier, s.dir));
    this.harpoons = [];
    this.powerUps = [];
    this.particles = [];
    this.px = W / 2;
    this.invuln = 1.5;
    this.timeLeft = this.level.time;
    this.freezeTime = 0;
    this.doubleTime = 0;
    this.shield = false;
    this.fireCooldown = 0;
    this.state = 'playing';
  }

  private buildLevel(): void {
    for (const o of this.levelObjs) o.destroy();
    this.levelObjs = [];
    this.clouds = [];
    const i = this.levelIdx;
    this.builtLevel = i;
    const add = <T extends Obj>(o: T): T => {
      this.levelObjs.push(o);
      return o;
    };

    add(this.add.image(0, 0, `bg_${i}`).setOrigin(0).setScale(1 / BS).setDepth(0));
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
    const d = Math.min(100, delta) / 1000;
    this.acc += d;
    while (this.acc >= STEP) {
      this.tick(STEP);
      this.acc -= STEP;
    }
    this.render(d);
  }

  private tick(dt: number): void {
    const JD = Phaser.Input.Keyboard.JustDown;
    const k = this.keys;
    if (JD(k.M)) this.sfx.muted = !this.sfx.muted;
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
      case 'levelClear':
        this.stateTimer -= dt;
        this.updateParticles(dt);
        if (this.stateTimer <= 0) {
          this.levelIdx++;
          if (this.levelIdx >= levels.length) {
            this.state = 'win';
            this.stateTimer = 0;
          } else {
            this.loadLevel();
          }
        }
        return;
      case 'playing':
        break;
    }

    if (pause) this.paused = !this.paused;
    if (this.paused) {
      if (confirm) this.paused = false;
      return;
    }
    this.updatePlaying(dt);
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
    this.freezeTime = Math.max(0, this.freezeTime - dt);

    const maxHarpoons = this.doubleTime > 0 ? 2 : 1;
    if (fire && this.fireCooldown <= 0 && this.harpoons.length < maxHarpoons) {
      this.harpoons.push({ x: this.px, top: FLOOR });
      this.fireCooldown = 0.18;
      this.shootTimer = 0.2;
      this.sfx.shoot();
    }

    for (const h of this.harpoons) h.top -= HARPOON_SPEED * dt;
    this.harpoons = this.harpoons.filter((h) => {
      if (h.top <= CEILING) return false;
      return !this.level.blocks.some((b) => h.x >= b.x && h.x <= b.x + b.w && h.top < b.y + b.h);
    });

    if (this.freezeTime <= 0) {
      for (const b of this.bubbles) stepBubble(b, dt, BOUNDS, this.level.blocks);
    }

    const spawned: Bubble[] = [];
    for (let i = this.harpoons.length - 1; i >= 0; i--) {
      const h = this.harpoons[i];
      const idx = this.bubbles.findIndex((b) => circleVSegment({ x: b.x, y: b.y, r: radius(b) }, h.x, h.top, FLOOR));
      if (idx < 0) continue;
      const b = this.bubbles[idx];
      this.bubbles.splice(idx, 1);
      this.harpoons.splice(i, 1);
      this.popBubble(b, spawned);
    }
    this.bubbles.push(...spawned);

    if (this.invuln <= 0) {
      const body: Rect = { x: this.px - PLAYER_W / 2, y: FLOOR - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
      if (this.bubbles.some((b) => circleRect({ x: b.x, y: b.y, r: radius(b) }, body))) {
        this.playerHit();
        return;
      }
    }

    for (const p of this.powerUps) {
      p.life -= dt;
      p.t += dt;
      p.y = Math.min(FLOOR - 16, p.y + 120 * dt);
    }
    this.powerUps = this.powerUps.filter((p) => {
      if (p.life <= 0) return false;
      if (Math.abs(p.x - this.px) < PLAYER_W / 2 + 14 && p.y > FLOOR - PLAYER_H - 14) {
        this.collect(p);
        return false;
      }
      return true;
    });

    this.updateParticles(dt);

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
      this.sfx.clear();
      for (let i = 0; i < 50; i++) {
        this.spawnParticle(Math.random() * W, FLOOR - Math.random() * 40, hex(TIER_COLOR[i % 4]), 1.6);
      }
    }
  }

  private spawnParticle(x: number, y: number, color: number, speedMul = 1): void {
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

  private popBubble(b: Bubble, spawned: Bubble[]): void {
    this.addScore(50 * (b.tier + 1));
    this.sfx.pop(b.tier);
    spawned.push(...split(b));
    const color = hex(TIER_COLOR[b.tier]);
    for (let i = 0; i < 12 + b.tier * 6; i++) this.spawnParticle(b.x, b.y, color);
    this.ring(b.x, b.y, radius(b), color);
    if (b.tier >= 2) this.cameras.main.shake(110, 0.0035 * (b.tier - 1));
    if (Math.random() < 0.14) {
      const types: PowerType[] = ['double', 'shield', 'freeze'];
      this.powerUps.push({ x: b.x, y: b.y, type: types[Math.floor(Math.random() * 3)], life: 9, t: 0 });
    }
  }

  private collect(p: PowerUp): void {
    this.sfx.power();
    this.addScore(100);
    this.ring(p.x, p.y, 14, 0xffffff);
    if (p.type === 'double') this.doubleTime = POWER_TIME;
    else if (p.type === 'shield') this.shield = true;
    else this.freezeTime = FREEZE_TIME;
  }

  private playerHit(): void {
    this.sfx.hit();
    if (this.shield) {
      this.shield = false;
      this.invuln = 1.5;
      this.cameras.main.shake(180, 0.006);
      return;
    }
    this.cameras.main.shake(260, 0.012);
    this.cameras.main.flash(220, 255, 70, 70);
    this.lives--;
    if (this.lives <= 0) {
      this.state = 'gameOver';
      this.stateTimer = 0;
      return;
    }
    this.loadLevel();
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

    this.renderBubbles();
    this.renderHarpoons();
    this.renderPowerUps();
    this.renderParticles();
    this.renderPlayer();
    this.renderHud();
    this.renderBanner();
  }

  private renderBubbles(): void {
    this.sync(this.bubbleSpr, this.bubbles.length, () => this.img('bubble_0', 10));
    this.sync(this.shadowSpr, this.bubbles.length, () => this.img('shadow', 6));
    const frozen = this.freezeTime > 0;
    this.bubbles.forEach((b, i) => {
      const r = radius(b);
      const near = clamp(1 - (FLOOR - (b.y + r)) / 8, 0, 1);
      const stretch = clamp(Math.abs(b.vy) / 1800, 0, 0.1);
      const sx = (1 + 0.16 * near - stretch * 0.5) / S;
      const sy = (1 - 0.16 * near + stretch) / S;
      const s = this.bubbleSpr[i].setTexture(`bubble_${b.tier}`).setPosition(b.x, b.y + near * r * 0.1);
      s.setScale(sx, sy);
      if (frozen) s.setTint(0xcdeeff);
      else s.clearTint();
      const height = FLOOR - b.y;
      this.shadowSpr[i]
        .setPosition(b.x, FLOOR + 2)
        .setScale((r * 2.4 * clamp(1 - height / 900, 0.4, 1)) / (64 * S), (r * 2.4 * clamp(1 - height / 900, 0.4, 1)) / (64 * S))
        .setAlpha(clamp(0.6 - height / 700, 0.12, 0.6));
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
      this.tipGlow[i].setPosition(h.x, h.top + 8).setScale(1.1 / S).setAlpha(0.7);
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
    const visible = this.state === 'playing' || this.state === 'levelClear';
    this.playerSpr.setVisible(visible);
    this.playerShadow.setVisible(visible);
    this.shieldSpr.setVisible(visible && this.shield);
    if (!visible) return;

    let frame: string;
    if (this.shootTimer > 0) frame = 'shoot';
    else if (this.moving) frame = `run${Math.floor(this.animT * 12) % 4}`;
    else frame = `idle${Math.floor(this.animT * 2.5) % 2}`;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    this.playerSpr
      .setTexture(`pl_${frame}`)
      .setPosition(this.px, FLOOR + 1)
      .setFlipX(this.facing < 0)
      .setAlpha(blink ? 0.35 : 1);
    this.playerShadow.setPosition(this.px, FLOOR + 2).setScale(40 / (64 * S));
    if (this.shield) {
      this.shieldSpr
        .setPosition(this.px, FLOOR - PLAYER_H / 2)
        .setScale((0.9 + Math.sin(this.animT * 6) * 0.04) / S)
        .setAlpha(0.8);
    }
  }

  private renderHud(): void {
    const h = this.hud;
    h.score.setText(`SCORE ${this.score}`);
    h.level.setText(`LEVEL ${this.levelIdx + 1}/${levels.length}`);
    const low = this.timeLeft < 10;
    h.time.setText(`TIME ${Math.ceil(this.timeLeft)}`).setColor(low ? '#ff6b6b' : '#ffffff');
    h.best.setText(`BEST ${this.best}`);
    this.heartSpr.forEach((s, i) => s.setVisible(i < this.lives).setScale((1 + (i === this.lives - 1 ? Math.sin(this.animT * 5) * 0.06 : 0)) / S));
    const lines: string[] = [];
    if (this.doubleTime > 0) lines.push(`2x SHOT  ${Math.ceil(this.doubleTime)}s`);
    if (this.freezeTime > 0) lines.push(`FREEZE  ${Math.ceil(this.freezeTime)}s`);
    if (this.shield) lines.push('SHIELD');
    h.powers.setText(lines.join('\n'));

    const frac = clamp(this.timeLeft / this.level.time, 0, 1);
    this.barG.clear();
    this.barG.fillStyle(0xffffff, 0.12).fillRect(0, CEILING - 4, W, 4);
    this.barG.fillStyle(low ? 0xff5a5f : 0x4cc9f0, 1).fillRect(0, CEILING - 4, W * frac, 4);
  }

  private renderBanner(): void {
    let b: [string, string] | null = null;
    if (this.state === 'levelClear') b = ['LEVEL CLEAR!', `Time bonus +${this.levelBonus}`];
    else if (this.state === 'gameOver') b = ['GAME OVER', `Score ${this.score} — tap or press Space`];
    else if (this.state === 'win') b = ['YOU WIN!', `Final score ${this.score} — tap or press Space`];
    else if (this.paused) b = ['PAUSED', 'Press P or tap to resume'];
    else if (this.invuln > 1 && this.timeLeft > this.level.time - 1.5) b = [`LEVEL ${this.levelIdx + 1}`, this.level.name];

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
