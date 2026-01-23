import Phaser from 'phaser';
import { loadAssetGroups } from './assets';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // Preload all visual assets used across the game so "replay" during early boot
    // can't land in a scene before its banner/question textures are available.
    loadAssetGroups(this, 'shared', 'ui', 'colorScene', 'endScene');
  }

  create() {
    this.scene.start('GameScene');
  }
}
