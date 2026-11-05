import Phaser from 'phaser';
import { touch } from '../touch';
import { BS, S, bubbleKey, setLevelArt } from './art';
import { TIER_RADIUS } from './bubble';
import { loadBest } from './PlayScene';
import { addSettingsButton } from './settingsButton';
import { H, W, setupView } from './view';

const FONT = 'system-ui, sans-serif';
const FLOOR = 470;

export class MenuScene extends Phaser.Scene {
  private startKeys!: Phaser.Input.Keyboard.Key[];
  private tip!: Phaser.GameObjects.Text;
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;

  constructor() {
    super('menu');
  }

  private texts: Phaser.GameObjects.Text[] = [];

  create(): void {
    this.texts = [];
    setLevelArt(this, 0); // returning from a later level: swap its backdrop back to level 0's
    this.add.image(0, 0, 'bg_0').setOrigin(0).setScale(1 / BS);
    this.far = this.add.tileSprite(0, FLOOR - 190, W, 190, 'far_0').setOrigin(0).setTileScale(1 / BS, 1 / BS);
    this.near = this.add.tileSprite(0, FLOOR - 120, W, 120, 'near_0').setOrigin(0).setTileScale(1 / BS, 1 / BS);
    this.add.tileSprite(0, FLOOR, W, H - FLOOR, 'floor').setOrigin(0).setTileScale(1 / S, 1 / S);

    // decorative bouncing bubbles
    for (let i = 0; i < 6; i++) {
      const tier = i % 4;
      const r = TIER_RADIUS[tier];
      const s = this.add.image(80 + i * 130, FLOOR - r, bubbleKey('normal', tier)).setScale(1 / S);
      this.tweens.add({
        targets: s,
        y: 140 + (i % 3) * 40,
        duration: 900 + tier * 160,
        ease: 'Quad.easeOut',
        yoyo: true,
        repeat: -1,
        delay: i * 140,
      });
      this.tweens.add({
        targets: s,
        x: s.x + (i % 2 ? 90 : -90),
        duration: 2600 + i * 200,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    this.add.rectangle(W / 2, 250, 620, 380, 0x050814, 0.55).setStrokeStyle(2, 0xffffff, 0.15);

    const title = this.add
      .text(W / 2, 120, 'PANG!', {
        fontFamily: FONT,
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#ffe28a',
        stroke: '#7a1b2a',
        strokeThickness: 12,
      })
      .setOrigin(0.5);
    this.texts.push(title);
    this.tweens.add({ targets: title, scale: 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const t = (y: number, s: string, size: number, color: string, bold = false) => {
      const text = this.add
        .text(W / 2, y, s, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color,
          fontStyle: bold ? 'bold' : 'normal',
          stroke: '#0b1020',
          strokeThickness: bold ? 5 : 3,
        })
        .setOrigin(0.5);
      this.texts.push(text);
      return text;
    };

    t(195, 'Pop all the bubbles before time runs out', 20, '#cfd8ff');
    t(250, 'Move: ← → / A D     Shoot: Space', 19, '#e8f4ff');
    t(278, 'Pause: P     Mute: M     Touch: on-screen buttons', 19, '#e8f4ff');
    const prompt = t(345, 'TAP or press SPACE to start', 28, '#ffd166', true);
    t(395, `Best score: ${loadBest()}`, 17, '#ffffff');
    this.tip = t(436, 'Tip: rotate your phone to landscape for a bigger view', 15, '#cfd8ff');
    this.tweens.add({ targets: prompt, alpha: 0.45, duration: 600, yoyo: true, repeat: -1 });

    const kb = this.input.keyboard!;
    this.startKeys = [kb.addKey('SPACE'), kb.addKey('ENTER')];
    // taps on the gear button (a game object) must not start the game
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.begin();
    });
    addSettingsButton(this, W - 26, 26, 10);
    this.scale.on('resize', this.updateTip, this);
    this.updateTip();
    setupView(this, () => this.texts);
  }

  private updateTip(): void {
    this.tip.setVisible(window.innerHeight > window.innerWidth * 1.1);
  }

  private begin(): void {
    this.scale.off('resize', this.updateTip, this);
    this.scene.start('play');
  }

  update(time: number): void {
    this.far.tilePositionX = time * 0.01 * BS;
    this.near.tilePositionX = time * 0.025 * BS;
    const confirm = touch.confirm;
    touch.confirm = false;
    if (confirm || this.startKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.begin();
  }
}
