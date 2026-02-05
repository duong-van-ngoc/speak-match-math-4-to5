import Phaser from 'phaser';
import { TextureKeys, AudioKeys } from '../consts/Keys';
import { GameConstants } from '../consts/GameConstants';
import { GameUtils } from '../utils/GameUtils';
import { IdleManager } from '../utils/IdleManager';
import AudioManager from '../audio/AudioManager';
import { showGameButtons, gameSDK, sdk } from '../main';
import { setGameSceneReference, resetVoiceState } from '../utils/rotateOrientation';
import { changeBackground } from '../utils/BackgroundManager';

/**
 * SceneBase - Abstract class chứa logic chung giữa các scene
 * Giúp tránh duplicate code và dễ bảo trì
 */
export default abstract class SceneBase extends Phaser.Scene {
    // --- SHARED PROPERTIES ---
    protected idleManager!: IdleManager;
    protected handHint!: Phaser.GameObjects.Image;
    protected isGameActive: boolean = false;
    protected bgm!: Phaser.Sound.BaseSound;
    protected isHintActive: boolean = false;

    // --- ABSTRACT METHODS (Subclasses must implement) ---
    protected abstract createUI(): void;
    protected abstract initGameFlow(): void;
    protected abstract showIdleHint(): void;

    // === SHARED METHODS ===

    protected setupSystem(): void {
        resetVoiceState();
        (window as any).gameScene = this;
        setGameSceneReference(this);

        this.idleManager = new IdleManager(GameConstants.IDLE.THRESHOLD, () => {
            this.showIdleHint();
        });

        this.input.on('pointerdown', () => {
            this.idleManager.reset();
        });
    }

    protected setupBackgroundAndAudio(bgImagePath: string = 'assets/images/bg/backgroug_game.png'): void {
        changeBackground(bgImagePath);

        if (this.sound.get(AudioKeys.BgmNen)) {
            this.sound.stopByKey(AudioKeys.BgmNen);
        }
        this.bgm = this.sound.add(AudioKeys.BgmNen, { loop: true, volume: 0.25 });
    }

    protected createHandHint(): void {
        this.handHint = this.add.image(0, 0, TextureKeys.HandHint)
            .setDepth(1000)
            .setAlpha(0)
            .setVisible(false)
            .setScale(0.7);
    }

    protected resetIdleState(): void {
        this.idleManager.reset();
        if (this.isHintActive && this.handHint) {
            this.isHintActive = false;
            this.tweens.killTweensOf(this.handHint);
            this.handHint.setAlpha(0).setVisible(false).setPosition(-200, -200);
        }
    }

    protected animateHandHintTo(targetX: number, targetY: number): void {
        if (!this.isGameActive || this.isHintActive) return;

        // Bỏ qua nếu tọa độ không hợp lệ (tránh race condition khi button chưa render)
        if (targetX <= 0 || targetY <= 0) return;

        this.isHintActive = true;
        gameSDK.addHint();
        sdk.score(gameSDK.prepareSubmitData().finalScore); // Cập nhật score vì hint có thể làm giảm accuracy (tùy config SDK)

        this.handHint.setDepth(1000);
        this.handHint.setVisible(true);
        this.handHint.setPosition(GameUtils.getW(this) + 100, GameUtils.getH(this));
        this.handHint.setAlpha(0);
        this.handHint.setScale(0.7);

        const IDLE = GameConstants.IDLE;

        // Di chuyển đến vị trí và bắt đầu loop animation
        this.tweens.add({
            targets: this.handHint,
            alpha: 1,
            x: targetX + IDLE.OFFSET_X,
            y: targetY + IDLE.OFFSET_Y,
            duration: IDLE.FADE_IN,
            ease: 'Power2',
            onComplete: () => {
                if (!this.isHintActive) return;
                // Loop animation clicking/scaling
                this.tweens.add({
                    targets: this.handHint,
                    scale: 0.5,
                    duration: IDLE.SCALE,
                    yoyo: true,
                    repeat: -1
                });
            }
        });
    }

    protected handleWake(): void {
        this.idleManager.reset();
        if (this.input.keyboard) this.input.keyboard.enabled = true;
        if (this.bgm && !this.bgm.isPlaying) this.bgm.play();
    }

    protected cleanupScene(): void {
        this.events.off('wake', this.handleWake, this);
        if (this.bgm && this.bgm.isPlaying) this.bgm.stop();
        if (this.idleManager) this.idleManager.stop();
    }

    protected startWithAudio(onStart: () => void): void {
        AudioManager.loadAll().then(async () => {
            // 1. Gửi lệnh bắt đầu game ngay lập tức (hiển thị UI/Mascot)
            onStart();

            // 2. Cố gắng mở khóa âm thanh ngay (nếu trình duyệt không chặn Autoplay)
            try {
                // Resume Howler (cho Voice)
                await AudioManager.ensureContextRunning();

                // Resume Phaser (cho BGM)
                const soundManager = this.sound as any;
                if (soundManager && soundManager.context && soundManager.context.state === 'suspended') {
                    soundManager.context.resume().catch(() => { });
                }
            } catch (e) {
                console.warn('[SceneBase] Autoplay might be blocked by browser');
            }

            // 3. Đăng ký listener để Unlock khi có tương tác (nếu bước 2 bị chặn)
            const unlockHandler = async () => {
                console.log('[SceneBase] User interaction detected, unlocking audio...');

                // Unlock Howler
                await AudioManager.unlockAudioAsync();

                // Unlock Phaser
                const soundManager = this.sound as any;
                if (soundManager && soundManager.context && soundManager.context.state === 'suspended') {
                    await soundManager.context.resume();
                }

                // Đảm bảo nhạc nền được phát nếu trước đó bị chặn
                if (this.bgm && !this.bgm.isPlaying) {
                    this.bgm.play();
                }

                // Sau khi unlock thành công thì gỡ listener
                this.input.off('pointerdown', unlockHandler);
            };

            this.input.on('pointerdown', unlockHandler);

            // Thử chạy unlock không cần gesture ngay lập tức (một số trình duyệt cho phép nếu điểm uy tín web cao)
            AudioManager.unlockAudioAsync().catch(() => { });
        });
    }

    protected playBgm(): void {
        if (this.bgm && !this.bgm.isPlaying) this.bgm.play();
    }

    protected showButtons(): void {
        showGameButtons();
    }
}
