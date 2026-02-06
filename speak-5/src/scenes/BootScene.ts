import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Load Game Config JSON
        this.load.json('game_config', 'assets/data/game_config.json');
    }

    create() {
        this.scene.start('PreloadScene');
    }
}
