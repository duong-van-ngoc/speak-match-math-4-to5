import Phaser from 'phaser';
import { TextureKeys, AudioKeys } from '../consts/Keys';
import { GameConstants } from '../consts/GameConstants';
import { GameUtils } from '../utils/GameUtils';
import { IdleManager } from '../utils/IdleManager';
import AudioManager from '../audio/AudioManager';
import { setGameSceneReference, resetVoiceState } from '../utils/rotateOrientation';
import { changeBackground } from '../utils/BackgroundManager';

/**
 * SceneBase - Lớp trừu tượng chứa logic chung giữa các scene
 * Giúp tránh duplicate code và dễ bảo trì
 */
export default abstract class SceneBase extends Phaser.Scene {
    // --- THUỘC TÍNH DÙNG CHUNG ---
    protected idleManager!: IdleManager;
    protected handHint!: Phaser.GameObjects.Image;
    protected isGameActive: boolean = false;
    protected bgm!: Phaser.Sound.BaseSound;
    protected isHintActive: boolean = false;

    // --- PHƯƠNG THỨC TRỪU TƯỢNG (Scene con phải implement) ---
    protected abstract createUI(): void;
    protected abstract initGameFlow(): void;
    protected abstract showIdleHint(): void;

    // === PHƯƠNG THỨC DÙNG CHUNG ===

    /** Khởi tạo hệ thống: reset voice, lưu reference, setup idle */
    protected setupSystem(): void {
        resetVoiceState();
        (window as any).gameScene = this;
        setGameSceneReference(this);

        this.idleManager = new IdleManager(GameConstants.IDLE.THRESHOLD, () => {
            this.showIdleHint();
        });

        this.input.on('pointerdown', () => {
            this.resetIdleState();
        });
    }

    /** Đổi ảnh nền và khởi tạo nhạc nền */
    protected setupBackgroundAndAudio(bgImagePath: string = 'assets/images/bg/background_speak.png'): void {
        changeBackground(bgImagePath);

        if (this.sound.get(AudioKeys.BgmNen)) {
            this.sound.stopByKey(AudioKeys.BgmNen);
        }
        this.bgm = this.sound.add(AudioKeys.BgmNen, { loop: true, volume: 0.25 });
    }

    /** Tạo hình ảnh bàn tay gợi ý (idle hint) */
    protected createHandHint(): void {
        this.handHint = this.add.image(0, 0, TextureKeys.HandHint)
            .setDepth(200)
            .setAlpha(0)
            .setScale(0.7);
    }

    /** Reset trạng thái idle (gọi khi người chơi chạm màn hình) */
    protected resetIdleState(): void {
        this.idleManager.reset();
        if (this.isHintActive && this.handHint) {
            this.isHintActive = false;
            this.tweens.killTweensOf(this.handHint);
            this.handHint.setAlpha(0).setPosition(-200, -200);
        }
    }

    /** Chạy animation bàn tay gợi ý đến vị trí mục tiêu */
    protected animateHandHintTo(targetX: number, targetY: number): void {
        if (!this.isGameActive || this.isHintActive) return;

        this.isHintActive = true;
        this.handHint.setPosition(GameUtils.getW(this) + 100, GameUtils.getH(this));
        this.handHint.setAlpha(0);

        const IDLE = GameConstants.IDLE;

        this.tweens.chain({
            targets: this.handHint,
            tweens: [
                {
                    alpha: 1,
                    x: targetX + IDLE.OFFSET_X,
                    y: targetY + IDLE.OFFSET_Y,
                    duration: IDLE.FADE_IN,
                    ease: 'Power2'
                },
                { scale: 0.5, duration: IDLE.SCALE, yoyo: true, repeat: 2 },
                {
                    alpha: 0,
                    duration: IDLE.FADE_OUT,
                    onComplete: () => {
                        this.isHintActive = false;
                        this.idleManager.reset();
                        this.handHint.setPosition(-200, -200);
                    }
                }
            ]
        });
    }

    /** Xử lý khi scene được đánh thức (wake) */
    protected handleWake(): void {
        this.idleManager.reset();
        if (this.input.keyboard) this.input.keyboard.enabled = true;
        if (this.bgm && !this.bgm.isPlaying) this.bgm.play();
    }

    /** Dọn dẹp scene khi kết thúc */
    protected cleanupScene(): void {
        this.events.off('wake', this.handleWake, this);
        if (this.bgm && this.bgm.isPlaying) this.bgm.stop();
        if (this.idleManager) this.idleManager.stop();
    }

    /** Khởi động game sau khi đảm bảo audio đã sẵn sàng */
    protected startWithAudio(onStart: () => void): void {
        AudioManager.loadAll().then(() => {
            // Tạm thời bỏ qua lock của Audio theo yêu cầu của user
            // Force unlock
            AudioManager.unlockAudio();

            // Xung kích sự kiện click ảo để lừa trình duyệt mở khóa AudioContext
            document.body.click();
            document.dispatchEvent(new MouseEvent('click'));

            onStart();
        });
    }

    /** Phát nhạc nền */
    protected playBgm(): void {
        if (this.bgm && !this.bgm.isPlaying) this.bgm.play();
    }

    /** Hiện các nút UI (reset, ...) */
    protected showButtons(): void {
        const reset = document.getElementById('btn-reset');
        if (reset) reset.style.display = 'block';
    }
}
