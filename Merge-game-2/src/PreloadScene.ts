import Phaser from 'phaser';
import { loadAssetGroups } from './assets';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    loadAssetGroups(this, 'shared', 'ui');
  }

  create() {
    this.scene.start('GameScene');
  }
}
