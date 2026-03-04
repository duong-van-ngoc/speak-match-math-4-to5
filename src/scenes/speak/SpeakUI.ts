/**
 * SpeakUI - Tạo UI elements cho game đếm toa tàu
 *
 * Tạo và quản lý:
 * - Banner (tiêu đề)
 * - Board (bảng trắng)
 * - Train image
 * - Mic button + Speaker button
 * - Volume bar
 * - Result text (đúng/sai)
 * - Hand hint animations
 */
import Phaser from 'phaser';
import { TextureKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';

export interface SpeakUIElements {
    speakerBtn: Phaser.GameObjects.Image;
    microBtn: Phaser.GameObjects.Image;
    volumeBar: Phaser.GameObjects.Graphics;
    trainImage: Phaser.GameObjects.Image;
    bannerImage: Phaser.GameObjects.Image;
    resultText: Phaser.GameObjects.Text;
}

export interface SpeakUICallbacks {
    onSpeakerClick: () => void;
    onMicroClick: () => void;
}

export class SpeakUI {
    private scene: Phaser.Scene;
    private w: number;
    private h: number;

    // Hand hint tracking
    private currentHandHint: Phaser.GameObjects.Image | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.w = scene.scale.width;
        this.h = scene.scale.height;
    }

    // ==============================
    // CREATE ALL UI
    // ==============================

    /**
     * Tạo tất cả UI elements và trả về references
     */
    createAll(callbacks: SpeakUICallbacks): SpeakUIElements {
        const CFG = GameConstants.SPEAK_SCENE;

        // 1. BOARD (bảng trắng nền)
        this.scene.add.image(this.w * CFG.BOARD.X, this.h * CFG.BOARD.Y, TextureKeys.S1_Board)
            .setScale(CFG.BOARD.SCALE)
            .setAlpha(CFG.BOARD.ALPHA);

        // 2. BANNER (tiêu đề "Đếm số toa tàu trong bức tranh")
        const bannerImage = this.scene.add.image(this.w * CFG.BANNER.X, this.h * CFG.BANNER.Y, TextureKeys.Speak_Banner)
            .setOrigin(0.5, 0)
            .setScale(0.6)
            .setDepth(30);

        // 3. TRAIN IMAGE (hình tàu - sẽ đổi texture theo level)
        const trainImage = this.scene.add.image(this.w * CFG.TRAIN.X, this.h * CFG.TRAIN.Y, TextureKeys.Train_1)
            .setScale(CFG.TRAIN.SCALE)
            .setDepth(10);

        // 4. SPEAKER BUTTON
        const speakerBtn = this.scene.add.image(
            this.w * CFG.SPEAKER.X,
            this.h * CFG.SPEAKER.Y,
            TextureKeys.Speak_Speaker
        )
            .setScale(CFG.SPEAKER.SCALE)
            .setInteractive({ useHandCursor: true })
            .setDepth(50)
            .on('pointerdown', callbacks.onSpeakerClick);

        // 5. MICRO BUTTON (ẩn ban đầu)
        const microBtn = this.scene.add.image(
            this.w * CFG.MICRO.X,
            this.h * CFG.MICRO.Y,
            TextureKeys.Speak_Micro
        )
            .setScale(CFG.MICRO.SCALE)
            .setAlpha(0)
            .setInteractive({ useHandCursor: true })
            .setDepth(50)
            .on('pointerdown', callbacks.onMicroClick);

        // 6. VOLUME BAR (for recording visual)
        const volumeBar = this.scene.add.graphics().setDepth(50);

        // 7. RESULT TEXT
        const resultText = this.scene.add.text(this.w / 2, this.h * 0.6, '', {
            fontSize: CFG.RESULT.FONT_SIZE,
            fontFamily: 'Fredoka, sans-serif',
            color: CFG.RESULT.CORRECT_COLOR,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        })
            .setOrigin(0.5)
            .setDepth(100)
            .setAlpha(0);

        return { speakerBtn, microBtn, volumeBar, trainImage, bannerImage, resultText };
    }

    // ==============================
    // MIC ANIMATION
    // ==============================

    /**
     * Show mic with animation (fade in + bounce)
     */
    showMicAnimation(microBtn: Phaser.GameObjects.Image): void {
        const CFG = GameConstants.SPEAK_SCENE;
        this.scene.tweens.add({
            targets: microBtn,
            alpha: 1,
            scale: { from: 0.2, to: CFG.MICRO.SCALE },
            duration: 400,
            ease: 'Back.out'
        });
    }

    // ==============================
    // TRAIN ANIMATION
    // ==============================

    /**
     * Show train with slide-in animation
     */
    showTrainAnimation(trainImage: Phaser.GameObjects.Image, trainKey: string, onComplete?: () => void): void {
        const CFG = GameConstants.SPEAK_SCENE;
        const targetX = this.w * CFG.TRAIN.X;

        trainImage.setTexture(trainKey);
        trainImage.setPosition(targetX + 200, this.h * CFG.TRAIN.Y);
        trainImage.setScale(CFG.TRAIN.SCALE);
        trainImage.setAlpha(0);

        this.scene.tweens.add({
            targets: trainImage,
            alpha: 1,
            x: targetX,
            duration: 800,
            ease: 'Back.easeOut',
            onComplete: () => onComplete?.()
        });
    }

    // ==============================
    // HAND HINT ANIMATIONS
    // ==============================

    /**
     * Show hand pointing to speaker button
     */
    showHandToSpeaker(speakerBtn: Phaser.GameObjects.Image): void {
        this.destroyCurrentHandHint();

        const handImg = this.scene.add.image(speakerBtn.x + 30, speakerBtn.y + 50, TextureKeys.Hand)
            .setScale(0.4)
            .setOrigin(0.5)
            .setDepth(200)
            .setAlpha(0);

        this.scene.tweens.add({
            targets: handImg,
            alpha: 1,
            y: speakerBtn.y + 40,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: handImg,
                    y: { from: speakerBtn.y + 40, to: speakerBtn.y + 25 },
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            }
        });

        this.currentHandHint = handImg;
    }

    /**
     * Show hand pointing to mic button
     */
    showHandToMic(microBtn: Phaser.GameObjects.Image): void {
        this.destroyCurrentHandHint();

        const handImg = this.scene.add.image(microBtn.x + 30, microBtn.y + 40, TextureKeys.Hand)
            .setScale(0.35)
            .setOrigin(0.5)
            .setDepth(200)
            .setAlpha(0);

        this.scene.tweens.add({
            targets: handImg,
            alpha: 1,
            y: microBtn.y + 30,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: handImg,
                    y: { from: microBtn.y + 30, to: microBtn.y + 15 },
                    duration: 500,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            }
        });

        this.currentHandHint = handImg;
    }

    /**
     * Show hand pointing to first train car
     */
    showHandToTrain(): void {
        this.destroyCurrentHandHint();

        const trainX = this.w * 0.55;
        const trainY = this.h * 0.50;

        const handImg = this.scene.add.image(trainX, trainY + 40, TextureKeys.Hand)
            .setScale(0.35)
            .setOrigin(0.5)
            .setDepth(200)
            .setAlpha(0);

        this.scene.tweens.add({
            targets: handImg,
            alpha: 1,
            y: trainY + 30,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: handImg,
                    y: { from: trainY + 30, to: trainY + 15 },
                    duration: 600,
                    yoyo: true,
                    repeat: 2,
                    ease: 'Sine.easeInOut',
                    onComplete: () => {
                        this.scene.tweens.add({
                            targets: handImg,
                            alpha: 0,
                            duration: 300,
                            onComplete: () => handImg.destroy(),
                        });
                    }
                });
            }
        });

        // Don't save as currentHandHint since it auto-destroys
    }

    /**
     * Destroy current hand hint
     */
    destroyCurrentHandHint(): void {
        if (this.currentHandHint) {
            this.scene.tweens.killTweensOf(this.currentHandHint);
            this.currentHandHint.destroy();
            this.currentHandHint = null;
        }
    }

    // ==============================
    // RESULT DISPLAY
    // ==============================

    /**
     * Show result text (correct/wrong)
     */
    showResult(resultText: Phaser.GameObjects.Text, isCorrect: boolean, message: string): void {
        const CFG = GameConstants.SPEAK_SCENE.RESULT;

        resultText.setText(message);
        resultText.setColor(isCorrect ? CFG.CORRECT_COLOR : CFG.WRONG_COLOR);
        resultText.setAlpha(0);
        resultText.setScale(0.5);

        this.scene.tweens.add({
            targets: resultText,
            alpha: 1,
            scale: 1,
            duration: 400,
            ease: 'Back.out',
        });
    }

    /**
     * Hide result text
     */
    hideResult(resultText: Phaser.GameObjects.Text): void {
        this.scene.tweens.add({
            targets: resultText,
            alpha: 0,
            scale: 0.5,
            duration: 300,
            ease: 'Back.in',
        });
    }

    // ==============================
    // SPEAKER ANIMATION
    // ==============================

    /**
     * Speaker button press effect
     */
    speakerPressEffect(speakerBtn: Phaser.GameObjects.Image): void {
        const CFG = GameConstants.SPEAK_SCENE;
        this.scene.tweens.add({
            targets: speakerBtn,
            scale: { from: CFG.SPEAKER.SCALE * 0.85, to: CFG.SPEAKER.SCALE },
            duration: 300,
        });
    }
}
