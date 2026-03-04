/**
 * AnimationFactory - Tiện ích tạo animation từ Sprite Sheet
 * 
 * Sử dụng một ảnh duy nhất chứa nhiều frame, tự động cắt theo kích thước khung hình.
 * Config được định nghĩa trong GameConstants.ts
 * 
 * @example
 * // Config trong GameConstants.ts:
 * EXAMPLE_ANIMATION: {
 *     X: 0.5,
 *     Y: 0.5,
 *     SCALE: 1.0,
 *     SPRITE_SHEET: {
 *         KEY: 'example_anim',
 *         PATH: 'assets/images/example_spritesheet.png',
 *         FRAME_WIDTH: 100,
 *         FRAME_HEIGHT: 100,
 *         START_FRAME: 0,
 *         END_FRAME: 7,
 *     },
 *     FRAME_DURATION: 100,
 *     REPEAT: -1,
 * }
 * 
 * // Trong PreloadScene:
 * AnimationFactory.preload(this, GameConstants.EXAMPLE_ANIMATION);
 * 
 * // Trong Scene:
 * const anim = new AnimationFactory(this, GameConstants.EXAMPLE_ANIMATION);
 * anim.play();
 */
import Phaser from 'phaser';

/**
 * Cấu hình Sprite Sheet
 */
export interface SpriteSheetConfig {
    KEY: string;           // Texture key (định danh duy nhất)
    PATH: string;          // Đường dẫn file ảnh
    FRAME_WIDTH: number;   // Chiều rộng mỗi frame (px)
    FRAME_HEIGHT: number;  // Chiều cao mỗi frame (px)
    START_FRAME: number;   // Frame bắt đầu (từ 0)
    END_FRAME: number;     // Frame kết thúc (bao gồm)
}

/**
 * Cấu hình đầy đủ cho Animation (đặt trong GameConstants.ts)
 */
export interface AnimationConfig {
    // --- Vị trí (tỉ lệ màn hình 0-1) ---
    X: number;
    Y: number;

    // --- Kích thước ---
    SCALE: number;

    // --- Sprite Sheet ---
    SPRITE_SHEET: SpriteSheetConfig;

    // --- Thời gian animation ---
    FRAME_DURATION: number;  // Thời gian mỗi frame (ms)
    REPEAT?: number;         // -1 = lặp vô hạn, 0 = chạy 1 lần

    // --- Cấu hình hiển thị (tuỳ chọn) ---
    ORIGIN?: { x: number; y: number };
    DEPTH?: number;
}

/**
 * AnimationFactory class - Quản lý animation từ sprite sheet
 */
export class AnimationFactory {
    private scene: Phaser.Scene;
    private config: AnimationConfig;
    private sprite: Phaser.GameObjects.Sprite | null = null;
    private animationKey: string;

    /**
     * Preload sprite sheet - Gọi trong preload() của scene
     * @param scene Phaser scene
     * @param config Animation config từ GameConstants
     */
    static preload(scene: Phaser.Scene, config: AnimationConfig): void {
        const sheet = config.SPRITE_SHEET;
        scene.load.spritesheet(sheet.KEY, sheet.PATH, {
            frameWidth: sheet.FRAME_WIDTH,
            frameHeight: sheet.FRAME_HEIGHT,
        });
    }

    /**
     * Constructor - Tạo animation instance
     * @param scene Phaser scene
     * @param config Animation config từ GameConstants
     */
    constructor(scene: Phaser.Scene, config: AnimationConfig) {
        this.scene = scene;
        this.config = config;
        this.animationKey = `${config.SPRITE_SHEET.KEY}_anim`;

        this.createAnimation();
        this.createSprite();
    }

    /** Tạo Phaser animation definition */
    private createAnimation(): void {
        const sheet = this.config.SPRITE_SHEET;

        // Chỉ tạo animation nếu chưa tồn tại
        if (!this.scene.anims.exists(this.animationKey)) {
            this.scene.anims.create({
                key: this.animationKey,
                frames: this.scene.anims.generateFrameNumbers(sheet.KEY, {
                    start: sheet.START_FRAME,
                    end: sheet.END_FRAME,
                }),
                frameRate: 1000 / this.config.FRAME_DURATION,
                repeat: this.config.REPEAT ?? -1,
            });
        }
    }

    /** Tạo sprite và đặt vị trí */
    private createSprite(): void {
        const w = this.scene.scale.width;
        const h = this.scene.scale.height;
        const sheet = this.config.SPRITE_SHEET;

        // Tạo sprite
        this.sprite = this.scene.add.sprite(
            w * this.config.X,
            h * this.config.Y,
            sheet.KEY
        );

        // Áp dụng config
        this.sprite.setScale(this.config.SCALE);

        if (this.config.ORIGIN) {
            this.sprite.setOrigin(this.config.ORIGIN.x, this.config.ORIGIN.y);
        }

        if (this.config.DEPTH !== undefined) {
            this.sprite.setDepth(this.config.DEPTH);
        }

        // Ẩn ban đầu
        this.sprite.setVisible(false);
    }

    /** Bắt đầu animation */
    play(): void {
        if (this.sprite) {
            this.sprite.setVisible(true);
            this.sprite.play(this.animationKey);
        }
    }

    /** Dừng animation */
    stop(): void {
        if (this.sprite) {
            this.sprite.stop();
            this.sprite.setVisible(false);
        }
    }

    /** Tạm dừng animation (giữ frame hiện tại) */
    pause(): void {
        if (this.sprite && this.sprite.anims) {
            this.sprite.anims.pause();
        }
    }

    /** Tiếp tục animation từ tạm dừng */
    resume(): void {
        if (this.sprite && this.sprite.anims) {
            this.sprite.anims.resume();
        }
    }

    /** Hiện/ẩn sprite */
    setVisible(visible: boolean): void {
        if (this.sprite) {
            this.sprite.setVisible(visible);
        }
    }

    /** Đặt vị trí (tỉ lệ màn hình 0-1) */
    setPosition(x: number, y: number): void {
        if (this.sprite) {
            const w = this.scene.scale.width;
            const h = this.scene.scale.height;
            this.sprite.setPosition(w * x, h * y);
        }
    }

    /** Đặt kích thước */
    setScale(scale: number): void {
        if (this.sprite) {
            this.sprite.setScale(scale);
        }
    }

    /** Lấy tham chiếu sprite (dùng nâng cao) */
    getSprite(): Phaser.GameObjects.Sprite | null {
        return this.sprite;
    }

    /** Kiểm tra đang chạy animation không */
    isPlaying(): boolean {
        return this.sprite?.anims?.isPlaying ?? false;
    }

    /** Dọn dẹp - Gọi khi không dùng nữa */
    destroy(): void {
        this.sprite?.destroy();
        this.sprite = null;
    }
}
