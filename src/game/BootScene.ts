import Phaser from 'phaser';
import { ART_STEPS, generateArt } from './art';
import { markReady, setProgress } from '../loader';

/** Builds all textures one group per frame so the HTML loader keeps animating, then starts the menu. */
export class BootScene extends Phaser.Scene {
  private steps?: Generator<void, void, void>;
  private done = 0;

  constructor() {
    super('boot');
  }

  create(): void {
    this.steps = generateArt(this);
    this.done = 0;
    setProgress(0);
  }

  update(): void {
    if (!this.steps) return;
    if (this.steps.next().done) {
      this.steps = undefined;
      setProgress(1);
      this.scene.start('menu');
      // let the menu render a frame before the loader fades out
      setTimeout(markReady, 60); // not a scene timer: this scene is shut down by scene.start
      return;
    }
    this.done++;
    setProgress(this.done / ART_STEPS);
  }
}
