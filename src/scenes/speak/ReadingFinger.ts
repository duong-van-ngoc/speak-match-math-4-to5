/**
 * ReadingFinger - Ngón tay chỉ đếm toa tàu
 *
 * Dùng LINES config: mỗi toa có startX → endX, ngón tay quét ngang qua toa
 * Level N → ngón tay chạy qua N dòng (N toa tàu)
 */
import Phaser from 'phaser';
import { TextureKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';

export interface ReadingFingerCallbacks {
    onCountComplete?: (totalCars: number) => void;
}

export class ReadingFinger {
    private scene: Phaser.Scene;
    private finger: Phaser.GameObjects.Image;
    private isActive: boolean = false;
    private callbacks: ReadingFingerCallbacks;

    constructor(scene: Phaser.Scene, callbacks?: ReadingFingerCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks || {};
        const CFG = GameConstants.SPEAK_SCENE.READING_FINGER;

        this.finger = scene.add.image(-200, -200, TextureKeys.Hand)
            .setOrigin(0.5, 0)
            .setDepth(150)
            .setAlpha(0)
            .setScale(CFG.SCALE);
    }

    /**
     * Đếm toa tàu cho 1 level cụ thể
     * Dùng LINES[levelIndex] để quét ngang qua tàu
     * @param levelIndex - Index của level (0-4)
     */
    countForLevel(levelIndex: number): void {
        const CFG = GameConstants.SPEAK_SCENE.READING_FINGER;
        if (!CFG.ENABLED || this.isActive) return;

        const lines = CFG.LINES;
        if (levelIndex < 0 || levelIndex >= lines.length) {
            console.warn(`[ReadingFinger] Invalid levelIndex: ${levelIndex}`);
            return;
        }

        this.isActive = true;

        const w = this.scene.scale.width;
        const h = this.scene.scale.height;
        const line = lines[levelIndex];

        const startX = w * line.startX;
        const endX = w * line.endX;
        const lineY = h * line.y;

        // Animation: fade in → sweep from startX to endX → fade out
        this.scene.tweens.chain({
            targets: this.finger,
            tweens: [
                // Fade in at start position
                {
                    alpha: 1,
                    x: startX,
                    y: lineY,
                    duration: 300,
                    ease: 'Power2'
                },
                // Sweep across train (startX → endX)
                {
                    x: endX,
                    y: lineY,
                    duration: line.duration,
                    ease: 'Linear'
                },
                // Fade out
                {
                    alpha: 0,
                    duration: 300,
                    delay: 200,
                    onComplete: () => {
                        this.isActive = false;
                        this.finger.setPosition(-200, -200);
                        this.callbacks.onCountComplete?.(levelIndex);
                    }
                }
            ]
        });
    }

    /**
     * Stop any running animation
     */
    stopAnimation(): void {
        if (this.finger) {
            this.scene.tweens.killTweensOf(this.finger);
            this.finger.setAlpha(0).setPosition(-200, -200);
            this.isActive = false;
        }
    }

    get isAnimating(): boolean {
        return this.isActive;
    }

    destroy(): void {
        this.stopAnimation();
        this.finger?.destroy();
    }
}
