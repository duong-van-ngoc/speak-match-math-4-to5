import Phaser from "phaser";
import AudioManager from "../audio/AudioManager";
import { ensureBgmStarted } from "../main";
import { buildReplayStartData, getReplayMode } from "../config/replayMode";

function hideGameButtons() {
    (window as any).setGameButtonsVisible?.(false);
}


type DifficultyLevel = 1 | 2 | 3;

export default class EndGameScene extends Phaser.Scene {
    private lessonId!: string;
    private difficulty: DifficultyLevel = 3;
    private containerEl: HTMLElement | null = null;
    private confettiEvent?: Phaser.Time.TimerEvent;

    constructor() {
        super('EndGameScene');
    }

    private clearDimBackground() {
        if (this.containerEl) {
            this.containerEl.classList.remove('dim-overlay');
            this.containerEl.classList.remove('dim-filter');
        }
    }

    init(data: {
        lessonId?: string;
        score: number;
        total: number;
        difficulty?: DifficultyLevel;
    }) {
        this.lessonId = data.lessonId ?? '';
        this.difficulty = data.difficulty ?? 3;
    }

    create() {
        const w = this.scale.width;
        const h = this.scale.height;

        try {
            const compare = this.scene.get('CompareScene') as any;
            compare?.stopAllVoices?.();
        } catch {
            // Scene may not exist in this build.
        }

        AudioManager.play("complete");

        this.containerEl = document.getElementById('game-container');
        if (this.containerEl) {
            this.containerEl.classList.add('dim-overlay');
        }

        this.time.delayedCall(2000, () => {
            AudioManager.play("fireworks");
            AudioManager.play("applause");
        });

        this.add
            .image(w / 2, h / 2 - h * 0.12, 'banner_congrat')
            .setOrigin(0.5)
            .setDepth(100)
            .setDisplaySize(w * 0.9, h * 0.9);

        if (this.textures.exists('icon_end')) {
            const icon = this.add.image(w / 2, h / 2 - 150, 'icon_end');
            icon.setScale(0.5);
            icon.setDepth(1005);
            this.tweens.add({
                targets: icon,
                y: icon.y - 10,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
            this.tweens.add({
                targets: icon,
                angle: { from: -5, to: 5 },
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }

        const btnScale = Math.min(w, h) / 1280;
        const spacing = 250 * btnScale;

        const replayBtn = this.add
            .image(w / 2 - spacing, h / 2 + h * 0.2, 'btn_reset')
            .setOrigin(0.5)
            .setScale(btnScale)
            .setDepth(101)
            .setInteractive({ useHandCursor: true });

        replayBtn.on('pointerdown', () => {
            // Dừng toàn bộ âm thanh đang chạy trước khi chơi lại
            AudioManager.stopAll();
            AudioManager.play("sfx_click");
            this.clearDimBackground();
            this.stopConfetti();
            this.scene.stop('EndGameScene');
            const mode = getReplayMode();
            const data = buildReplayStartData({ mode });
            this.scene.start('GameScene', { ...data, lessonId: this.lessonId, difficulty: this.difficulty });
            // Bật lại BGM sau khi chơi lại
            ensureBgmStarted();
        });

        const exitBtn = this.add
            .image(w / 2 + spacing, h / 2 + h * 0.2, 'btn_exit')
            .setOrigin(0.5)
            .setScale(btnScale)
            .setDepth(101)
            .setInteractive({ useHandCursor: true });

        exitBtn.on('pointerdown', () => {
            // Dừng toàn bộ âm thanh (kể cả BGM) khi thoát
            AudioManager.stopAll();
            AudioManager.play("sfx_click");
            this.clearDimBackground();
            this.stopConfetti();
            this.scene.start('LessonSelectScene');
            const host = (window as any).irukaHost;
            const state = (window as any).irukaGameState || {};
            if (host && typeof host.complete === 'function') {
                const timeMs = state.startTime
                    ? Date.now() - state.startTime
                    : 0;
                const score = state.currentScore || 0;
                host.complete({
                    score,
                    timeMs,
                    extras: {
                        reason: 'user_exit',
                    },
                });
            } else {
                this.scene.start('LessonSelectScene');
            }
        });

        [replayBtn, exitBtn].forEach((btn) => {
            btn.on('pointerover', () => btn.setScale(btnScale * 1.1));
            btn.on('pointerout', () => btn.setScale(btnScale));
        });

        hideGameButtons();
        this.createConfettiEffect();
    }

    private createConfettiEffect(): void {
        const width = this.cameras.main.width;
        const colors = [
            0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da,
        ];
        const shapes: Array<'circle' | 'rect'> = ['circle', 'rect'];
        this.confettiEvent = this.time.addEvent({
            delay: 100,
            callback: () => {
                if (!this.scene.isActive()) return;
                for (let i = 0; i < 3; i++) {
                    this.createConfettiPiece(
                        Phaser.Math.Between(0, width),
                        -20,
                        Phaser.Utils.Array.GetRandom(colors),
                        Phaser.Utils.Array.GetRandom(shapes)
                    );
                }
            },
            loop: true,
        });
    }

    private createConfettiPiece(
        x: number,
        y: number,
        color: number,
        shape: 'circle' | 'rect'
    ): void {
        let confetti: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
        if (shape === 'circle') {
            confetti = this.add.circle(
                x,
                y,
                Phaser.Math.Between(4, 8),
                color,
                1
            );
        } else {
            confetti = this.add.rectangle(
                x,
                y,
                Phaser.Math.Between(6, 12),
                Phaser.Math.Between(10, 20),
                color,
                1
            );
        }
        confetti.setDepth(999);
        confetti.setRotation((Phaser.Math.Between(0, 360) * Math.PI) / 180);
        const duration = Phaser.Math.Between(3000, 5000);
        const targetY = this.cameras.main.height + 50;
        const drift = Phaser.Math.Between(-100, 100);
        this.tweens.add({
            targets: confetti,
            y: targetY,
            x: x + drift,
            rotation: confetti.rotation + Phaser.Math.Between(2, 4) * Math.PI,
            duration,
            ease: 'Linear',
            onComplete: () => confetti.destroy(),
        });
        this.tweens.add({
            targets: confetti,
            alpha: { from: 1, to: 0.3 },
            duration,
            ease: 'Cubic.easeIn',
        });
    }

    private stopConfetti(): void {
        if (this.confettiEvent) {
            this.confettiEvent.remove(false);
            this.confettiEvent = undefined;
        }
    }
}
