import Phaser from 'phaser';

export function createTopBanner(
    scene: Phaser.Scene,
    config: { bannerKey: string; textKey: string },
    opts: { yRatio: number; scale: number }
) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    const y = h * opts.yRatio;

    // Banner BG
    if (scene.textures.exists(config.bannerKey)) {
        scene.add.image(w / 2, y, config.bannerKey)
            .setOrigin(0.5, 0.5)
            .setScale(opts.scale);
    }

    // Title Text (Image)
    if (scene.textures.exists(config.textKey)) {
        scene.add.image(w / 2, y, config.textKey)
            .setOrigin(0.5, 0.5)
            .setScale(opts.scale); // Scale title theo banner?
    }
}
