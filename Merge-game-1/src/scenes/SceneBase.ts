import * as Phaser from 'phaser';

export default abstract class SceneBase extends Phaser.Scene {
    protected boardImage?: Phaser.GameObjects.Image;
    protected boardFallbackGfx?: Phaser.GameObjects.Graphics;
    protected bannerBg?: Phaser.GameObjects.Image;
    protected bannerTextImage?: Phaser.GameObjects.Image;

    protected boardRect = new Phaser.Geom.Rectangle();
    protected boardInnerRect = new Phaser.Geom.Rectangle();
    protected boardScaleFactor = 1;

    constructor(config: string | Phaser.Types.Scenes.SettingsConfig) {
        super(config);
    }

    protected abstract get boardAssetKey(): string;
    protected abstract get bannerBgKey(): string;

    protected applyLayout() {
        const { width, height } = this.scale;

        // Logical board size
        const maxW = Math.min(1500, width * 0.85);
        const maxH = Math.min(850, height * 0.85);

        // Aspect ratio (approx 1100/800 based on board_scene_2.png)
        const ratio = 1100 / 800;

        let boardW = maxW;
        let boardH = boardW / ratio;

        if (boardH > maxH) {
            boardH = maxH;
            boardW = boardH * ratio;
        }

        const boardX = (width - boardW) / 2;
        const boardY = Math.max(90, height * 0.18);

        this.boardRect.setTo(boardX, boardY, boardW, boardH);
        this.boardScaleFactor = boardW / 1100;

        const padX = boardW * 0.05;
        const padTop = boardH * 0.15;
        const padBottom = boardH * 0.18;

        this.boardInnerRect.setTo(
            boardX + padX,
            boardY + padTop,
            boardW - padX * 2,
            boardH - padTop - padBottom
        );

        this.updateBoardVisuals();
        this.syncBannerVisuals();
    }

    protected updateBoardVisuals() {
        if (!this.boardImage && this.textures.exists(this.boardAssetKey)) {
            this.boardImage = this.add.image(0, 0, this.boardAssetKey).setOrigin(0.5).setDepth(0);
        }

        if (this.boardImage) {
            this.boardImage.setPosition(this.boardRect.centerX, this.boardRect.centerY);
            this.boardImage.setDisplaySize(this.boardRect.width, this.boardRect.height);
            this.boardFallbackGfx?.clear();
        } else if (this.boardFallbackGfx) {
            this.drawFallbackFrame();
        }
    }

    protected syncBannerVisuals() {
        if (!this.bannerBg && this.textures.exists(this.bannerBgKey)) {
            this.bannerBg = this.add.image(0, 0, this.bannerBgKey).setOrigin(0.5).setDepth(35);
        }

        if (this.bannerBg) {
            const bgRatio = 1000 / 200;
            const targetW = this.boardRect.width * 1.05;
            const targetH = targetW / bgRatio;

            const x = this.boardRect.centerX;
            const y = Math.max(targetH / 2 + 8, this.boardRect.y - targetH / 2 - 25);

            this.bannerBg.setDisplaySize(targetW, targetH);
            this.bannerBg.setPosition(x, y);

            if (this.bannerTextImage) {
                const textRatio = 1000 / 180;
                const textW = targetW * 0.85;
                const textH = textW / textRatio;
                this.bannerTextImage.setDisplaySize(textW, textH);
                this.bannerTextImage.setPosition(x, y);
            }
        }
    }

    private drawFallbackFrame() {
        const gfx = this.boardFallbackGfx!;
        gfx.clear();
        const corner = 32;
        gfx.fillStyle(0xffffff, 1).fillRoundedRect(this.boardRect.x, this.boardRect.y, this.boardRect.width, this.boardRect.height, corner);
        gfx.lineStyle(6, 0x1d4ed8, 1).strokeRoundedRect(this.boardRect.x, this.boardRect.y, this.boardRect.width, this.boardRect.height, corner);
    }
}
