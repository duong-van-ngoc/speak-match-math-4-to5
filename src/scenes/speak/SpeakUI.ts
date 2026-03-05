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

    // Theo dõi bàn tay gợi ý hiện hành
    private currentHandHint: Phaser.GameObjects.Image | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.w = scene.scale.width;
        this.h = scene.scale.height;
    }

    // ==============================
    // TẠO TOÀN BỘ GIAO DIỆN
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

        // 4. NÚT LOA (Sẽ tương tác để đọc lại câu lệnh)
        const speakerBtn = this.scene.add.image(
            this.w * CFG.SPEAKER.X,
            this.h * CFG.SPEAKER.Y,
            TextureKeys.Speak_Speaker
        )
            .setScale(CFG.SPEAKER.SCALE)
            .setInteractive({ useHandCursor: true })
            .setDepth(50)
            .on('pointerdown', callbacks.onSpeakerClick);

        // 5. NÚT MIC (Hiện đang bị ẩn ở trạng thái ban đầu)
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

        // 6. THANH ÂM LƯỢNG (Dành cho hiệu ứng khi đang ghi âm)
        const volumeBar = this.scene.add.graphics().setDepth(50);

        // 7. CHỮ KẾT QUẢ (Thông báo đúng sai)
        const resultText = this.scene.add.text(this.w / 2, this.h * 0.25, '', {
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
    // HIỆU ỨNG CHO NÚT MIC
    // ==============================

    /**
     * Hiển thị nút mic kèm hiệu ứng nảy (bounce)
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
    // HIỆU ỨNG TÀU HỎA
    // ==============================

    /**
     * Hiển thị tàu hỏa trượt vào màn hình
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
            duration: 900,
            ease: 'Back.easeOut',
            onComplete: () => onComplete?.()
        });
    }

    // ==============================
    // CÁC HIỆU ỨNG BÀN TAY GỢI Ý
    // ==============================

    /**
     * Hiển thị bàn tay chỉ vào nút loa
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
     * Hiển thị bàn tay chỉ vào nút mic
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
     * Hiển thị bàn tay chỉ vào toa tàu đầu tiên
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

        // Không gán thành currentHandHint vì nó sẽ tự động bị hũy sau khi xong hiệu ứng
    }

    /**
     * Hủy bỏ quá trình hiển thị bàn tay gợi ý hiện tại
     */
    destroyCurrentHandHint(): void {
        if (this.currentHandHint) {
            this.scene.tweens.killTweensOf(this.currentHandHint);
            this.currentHandHint.destroy();
            this.currentHandHint = null;
        }
    }

    // ==============================
    // THÔNG BÁO KẾT QUẢ
    // ==============================

    /**
     * Hiển thị thông báo khi bé trả lời (đúng hay sai)
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
     * Ẩn thông báo kết quả
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
    // HIỆU ỨNG LOA SÓNG ÂM
    // ==============================

    private speakAnimSprite: Phaser.GameObjects.Image | null = null;
    private speakAnimTimer: Phaser.Time.TimerEvent | null = null;
    private speakAnimFrame: number = 0;

    /**
     * Bật sóng âm bay lơ lửng ngay cạnh nút Loa
     */
    startSpeakerAnimation(speakerBtn: Phaser.GameObjects.Image): void {
        this.stopSpeakerAnimation();

        const frames = [
            TextureKeys.Speak_AniSpeak1,
            TextureKeys.Speak_AniSpeak2,
            TextureKeys.Speak_AniSpeak3
        ];
        this.speakAnimFrame = 0;

        if (this.scene.textures.exists(frames[0])) {
            this.speakAnimSprite = this.scene.add.image(speakerBtn.x + 50, speakerBtn.y, frames[0])
                .setOrigin(0, 0.5)
                .setScale(speakerBtn.scale)
                .setDepth(speakerBtn.depth - 1)
                .setAlpha(1);
        }

        this.speakAnimTimer = this.scene.time.addEvent({
            delay: GameConstants.SPEAK_SCENE.SPEAK_ANIMATION.FRAME_DURATION,
            callback: () => {
                if (!this.speakAnimSprite) return;
                this.speakAnimFrame = (this.speakAnimFrame + 1) % frames.length;
                this.speakAnimSprite.setTexture(frames[this.speakAnimFrame]);
            },
            loop: true
        });
    }

    /**
     * Dừng hiệu ứng sóng âm đang văng ra
     */
    stopSpeakerAnimation(): void {
        if (this.speakAnimTimer) {
            this.speakAnimTimer.destroy();
            this.speakAnimTimer = null;
        }
        if (this.speakAnimSprite) {
            this.speakAnimSprite.destroy();
            this.speakAnimSprite = null;
        }
    }

    /**
     * Hiệu ứng khi em bé bấm vào nút loa (sẽ co nhẹ lại 1 xíu)
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
