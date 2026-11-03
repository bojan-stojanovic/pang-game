import Phaser from 'phaser';
import './style.css';
import { BootScene } from './game/BootScene';
import { MenuScene } from './game/MenuScene';
import { PlayScene } from './game/PlayScene';
import { H, W, viewScale } from './game/view';
import { Sfx } from './sfx';
import { initTouchControls } from './touch';

initTouchControls();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: Math.round(W * viewScale()),
  height: Math.round(H * viewScale()),
  backgroundColor: '#05070f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, roundPixels: false },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, PlayScene],
});

game.registry.set('sfx', new Sfx());
