import Phaser from 'phaser';
import { loadAssetGroups } from './assets';
import { CURRENT_GAME_MODE, GameMode } from './gameConfig';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    loadAssetGroups(this, 'shared', 'ui');
  }

  create() {
    this.scene.start('GameSceneBalloon');
  }
}
