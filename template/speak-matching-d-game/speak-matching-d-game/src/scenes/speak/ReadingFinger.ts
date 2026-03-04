/**
 * ReadingFinger - Quản lý hiệu ứng ngón tay chỉ đọc text
 * 
 * Hỗ trợ 2 mode:
 * 1. startFullAnimation() - Animate toàn bộ 6 dòng (khi nghe đồng dao)
 * 2. startSingleLineAnimation(lineIndex) - Animate 1 dòng (khi bé đọc từng dòng)
 */
import Phaser from 'phaser';
import { TextureKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';

export interface ReadingFingerCallbacks {
    onLineComplete?: (lineIndex: number) => void;
    onAllLinesComplete?: () => void;
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

        this.finger = scene.add.image(-200, -200, TextureKeys.HandHint)
            .setOrigin(0, 0)
            .setDepth(150)
            .setAlpha(0)
            .setScale(CFG.SCALE);
    }

    /**
     * Animation toàn bộ 6 dòng (dùng khi nghe đồng dao)
     * Không có callback per-line, chỉ callback khi hoàn thành tất cả
     */
    startFullAnimation(): void {
        const CFG = GameConstants.SPEAK_SCENE.READING_FINGER;

        if (!CFG.ENABLED || this.isActive) return;
        this.isActive = true;

        const w = this.scene.scale.width;
        const h = this.scene.scale.height;
        const lines = CFG.LINES;

        const tweenConfigs: object[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const startX = w * line.startX;
            const endX = w * line.endX;
            const lineY = h * line.y;

            if (i === 0) {
                // Dòng đầu tiên: fade in + di chuyển tới vị trí bắt đầu
                tweenConfigs.push({
                    alpha: 1,
                    x: startX,
                    y: lineY,
                    duration: 300,
                    ease: 'Power2'
                });
            } else {
                // Các dòng tiếp: di chuyển từ cuối dòng trước sang đầu dòng mới
                tweenConfigs.push({
                    x: startX,
                    y: lineY,
                    duration: CFG.TRANSITION_DURATION,
                    delay: CFG.LINE_DELAY,
                    ease: 'Power2'
                });
            }

            // Di chuyển dọc theo dòng từ trái sang phải
            tweenConfigs.push({
                x: endX,
                duration: line.duration,
                ease: 'Linear'
            });
        }

        // Fade out sau khi đọc xong
        tweenConfigs.push({
            alpha: 0,
            duration: 300,
            delay: 200,
            onComplete: () => {
                this.isActive = false;
                this.finger.setPosition(-200, -200);
                this.callbacks.onAllLinesComplete?.();
            }
        });

        // Chạy animation chain
        this.scene.tweens.chain({
            targets: this.finger,
            tweens: tweenConfigs
        });
    }

    /**
     * Animation 1 dòng đơn lẻ (dùng khi bé đọc từng dòng)
     * @param lineIndex - Index của dòng (0-5)
     */
    startSingleLineAnimation(lineIndex: number): void {
        const CFG = GameConstants.SPEAK_SCENE.READING_FINGER;
        const lines = CFG.LINES;

        if (!CFG.ENABLED || lineIndex >= lines.length) return;

        // Stop any existing animation before starting new one
        if (this.isActive) {
            console.log(`[ReadingFinger] Stopping previous animation before starting line ${lineIndex + 1}`);
            this.stopAnimation();
        }

        this.isActive = true;

        const w = this.scene.scale.width;
        const h = this.scene.scale.height;
        const line = lines[lineIndex];

        const startX = w * line.startX;
        const endX = w * line.endX;
        const lineY = h * line.y;

        console.log(`[ReadingFinger] Starting animation for line ${lineIndex + 1}, y=${line.y} (${lineY.toFixed(0)}px)`);

        // Animation chain cho 1 dòng
        this.scene.tweens.chain({
            targets: this.finger,
            tweens: [
                // Fade in + move to start
                {
                    alpha: 1,
                    x: startX,
                    y: lineY,
                    duration: 300,
                    ease: 'Power2'
                },
                // Move along the line
                {
                    x: endX,
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
                        this.callbacks.onLineComplete?.(lineIndex);
                    }
                }
            ]
        });
    }

    /**
     * Alias cho backward compatibility - Gọi startFullAnimation
     */
    startAnimation(): void {
        this.startFullAnimation();
    }

    /**
     * Dừng animation
     */
    stopAnimation(): void {
        if (this.finger) {
            this.scene.tweens.killTweensOf(this.finger);
            this.finger.setAlpha(0).setPosition(-200, -200);
            this.isActive = false;
        }
    }

    /**
     * Kiểm tra đang chạy animation không
     */
    get isAnimating(): boolean {
        return this.isActive;
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.stopAnimation();
        this.finger?.destroy();
    }
}
