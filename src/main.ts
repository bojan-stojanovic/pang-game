import Phaser from 'phaser';
import './style.css';
import { BootScene } from './game/BootScene';
import { MenuScene } from './game/MenuScene';
import { PlayScene } from './game/PlayScene';
import { H, W, viewScale } from './game/view';
import { Sfx } from './sfx';
import { hooks } from './settings';
import { initSettingsPanel } from './settingsPanel';
import { initTouchControls } from './touch';

initTouchControls();
initSettingsPanel();

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
  // antialiasGL off: skips the multisampled backbuffer (several times the canvas memory at high
  // resolution); sprites still get smooth edges from linear texture filtering.
  render: { antialias: true, antialiasGL: false, roundPixels: false },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, PlayScene],
});

const sfx = new Sfx();
game.registry.set('sfx', sfx);
hooks.previewSfx = () => sfx.pop(1, 1);

if (import.meta.env.DEV) {
  // Dev-only: lets the console measure texture memory (see `textureMemoryMB`).
  Object.assign(window, {
    __pang: {
      game,
      textureMemoryMB: () => {
        let bytes = 0;
        let count = 0;
        for (const key of game.textures.getTextureKeys()) {
          if (key.startsWith('__')) continue;
          const src = game.textures.get(key).getSourceImage() as { width: number; height: number };
          bytes += src.width * src.height * 4;
          count++;
        }
        return { textures: count, mb: Math.round((bytes / 1048576) * 10) / 10 };
      },
    },
  });
}
