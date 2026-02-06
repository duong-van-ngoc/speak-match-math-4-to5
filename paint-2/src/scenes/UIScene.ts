import Phaser from 'phaser';
import { SceneKeys, TextureKeys } from '../consts/Keys';
import { GameConstants } from '../consts/GameConstants';
import { GameUtils } from '../utils/GameUtils';
import { PaintManager } from '../utils/PaintManager';

export default class UIScene extends Phaser.Scene {
    private paintManager!: PaintManager;
    private sceneKey!: string;
    private paletteButtons: Phaser.GameObjects.Image[] = [];
    private firstColorBtn!: Phaser.GameObjects.Image;
    public handHint!: Phaser.GameObjects.Image;
    constructor() {
        super(SceneKeys.UI);
    }

    init(data: { paintManager: PaintManager; sceneKey: string }) {
        this.paintManager = data.paintManager;
        this.sceneKey = data.sceneKey; // Lưu sceneKey để dùng
        this.paletteButtons = [];
    }

    create() {
        this.createUI();
    }

    private bannerImage!: Phaser.GameObjects.Image;
    private bannerText!: Phaser.GameObjects.Image;
    private decorImage!: Phaser.GameObjects.Image;
    private so1Image!: Phaser.GameObjects.Image;
    private diceImage!: Phaser.GameObjects.Image;

    private createUI() {
        const UI = GameConstants.SCENE1.UI;
        const cx = GameUtils.pctX(this, 0.5);

        // Tính toán vị trí Board dựa trên Banner
        const bannerY = GameUtils.pctY(this, UI.BANNER_Y);
        const bX = GameUtils.pctX(this, UI.BOARD_OFFSET);
        // Xác định TextureKeys dựa trên SceneKey
        let bannerKey = TextureKeys.S1_Banner;
        let textBannerKey = TextureKeys.S1_BannerText;

        // Hiển thị Banner và Text
        this.bannerImage = this.add.image(cx, bannerY, bannerKey).setScale(0.7).setOrigin(0.5, -0.1);

        // Tính toán tâm của Banner để đặt Text vào giữa
        // Origin Y = -0.1 => Điểm neo nằm trên đỉnh ảnh 10% chiều cao
        // => Top ảnh = bannerY + (0.1 * height)
        // => Center ảnh = Top + (0.5 * height) = bannerY + (0.6 * height)
        const bannerHeight = this.textures.get(bannerKey).getSourceImage().height * 0.7;
        const bannerCenterY = bannerY + (0.6 * bannerHeight);

        this.bannerText = this.add.image(cx, bannerCenterY, textBannerKey).setScale(0.9).setOrigin(0.5, 0.5);

        // Hiển thị Decor
        // Hiển thị Decor
        // this.decorImage = this.add.image(cx * 1.79, bannerY + 290, TextureKeys.Decor).setScale(1).setOrigin(0.5, 0.5);
        // this.so1Image = this.add.image(cx * 0.125, bannerY + 180, TextureKeys.So1).setScale(1).setOrigin(0.5, -0.1);
        // this.diceImage = this.add.image(cx * 0.255, bannerY + 170, TextureKeys.Dice).setScale(1).setOrigin(0.5, -0.1);

        // Tạo bàn tay gợi ý (ẩn đi, set depth cao nhất để đè lên mọi thứ)
        this.handHint = this.add
            .image(0, 0, TextureKeys.HandHint)
            .setDepth(2000) // Đảm bảo nó nằm trên các phần tử UI khác
            .setAlpha(0)
            .setScale(0.7);

        this.createPalette();
    }

    private createPalette() {
        const UI = GameConstants.SCENE1.UI;
        // Chọn bộ màu dựa trên SceneKey
        const paletteData = GameConstants.PALETTE_DATA;

        const spacingX = GameUtils.pctX(this, UI.PALETTE_SPACING_X);
        const paletteY = GameUtils.pctY(this, UI.PALETTE_Y);

        // Tính toán vị trí bắt đầu để căn giữa
        const totalItems = paletteData.length + 1; // +1 cho Eraser
        const totalWidth = (totalItems - 1) * spacingX;
        const startX = (GameUtils.getW(this) - totalWidth) / 2;

        paletteData.forEach((item, i) => {
            const btnX = startX + i * spacingX;
            const btnY = paletteY;

            const btn = this.add.image(btnX, btnY, item.key).setInteractive().setDepth(1);

            // Logic visual: Nút đầu tiên to hơn (đang chọn)
            if (i === 0) {
                this.firstColorBtn = btn;
                btn.setScale(0.9).setAlpha(1);
                this.paintManager.setColor(item.color); // ✅ Sync màu cọ với nút đầu tiên
            } else {
                btn.setAlpha(0.8).setScale(0.7);
            }

            btn.on('pointerdown', () => {
                this.updatePaletteVisuals(btn);
                this.paintManager.setColor(item.color); // Đổi màu cọ
            });
            this.paletteButtons.push(btn);
        });

        // Tạo nút Tẩy (Eraser) - Nằm tiếp theo trong hàng ngang
        const eraserIndex = paletteData.length;
        const eraserX = startX + eraserIndex * spacingX;
        const eraserY = paletteY;

        const eraser = this.add
            .image(eraserX, eraserY, TextureKeys.BtnEraser)
            .setInteractive()
            .setAlpha(0.8)
            .setScale(0.7)
            .setDepth(1);
        eraser.on('pointerdown', () => {
            this.updatePaletteVisuals(eraser);
            this.paintManager.setEraser();
        });
        this.paletteButtons.push(eraser);
    }

    // Cập nhật hiệu ứng to/nhỏ của các nút màu khi được chọn
    private updatePaletteVisuals(activeBtn: Phaser.GameObjects.Image) {
        this.paletteButtons.forEach((b) => b.setScale(0.7).setAlpha(0.8));
        activeBtn.setScale(0.9).setAlpha(1);
    }

    public hidePalette() {
        this.tweens.add({
            targets: this.paletteButtons,
            scale: 0,
            alpha: 0,
            duration: 500,
            ease: 'Back.In'
        });
    }

    public hideBanners() {
        if (this.bannerImage) this.bannerImage.destroy();
        if (this.bannerText) this.bannerText.destroy();
        if (this.decorImage) this.decorImage.destroy();
        if (this.so1Image) this.so1Image.destroy();
        if (this.diceImage) this.diceImage.destroy();
    }
}
