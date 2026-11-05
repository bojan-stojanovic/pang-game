import Phaser from 'phaser';
import { openSettings } from '../settingsPanel';
import { S } from './art';

/** Gear icon that opens the settings dialog. Scenes must ignore pointer-downs that land on game objects. */
export function addSettingsButton(scene: Phaser.Scene, x: number, y: number, depth: number): Phaser.GameObjects.Image {
  const size = 30 * S;
  const btn = scene.add
    .image(x, y, 'gear')
    .setScale(1 / S)
    .setDepth(depth)
    .setAlpha(0.85)
    .setInteractive({
      hitArea: new Phaser.Geom.Circle(size / 2, size / 2, size * 0.8),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });
  btn.on('pointerover', () => btn.setTint(0xffe28a).setAlpha(1));
  btn.on('pointerout', () => btn.clearTint().setAlpha(0.85));
  btn.on('pointerdown', () => openSettings());
  return btn;
}
