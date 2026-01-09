    import Phaser from 'phaser';

    export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    create() {
        // setup chung nếu cần
        this.scale.scaleMode = Phaser.Scale.FIT;
        this.scale.autoCenter = Phaser.Scale.CENTER_BOTH;

        // chuyển sang preload
        this.scene.start('PreloadScene');
    }
    }
