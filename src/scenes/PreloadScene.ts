// src/scenes/PreloadScene.ts
import Phaser from 'phaser';
import { SceneKeys, TextureKeys, AudioKeys } from '../consts/Keys';
import { GameConstants } from '../consts/GameConstants';
import { AnimationFactory } from '../utils/AnimationFactory';

export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super(SceneKeys.Preload);
    }

    preload() {
        // ========================================
        // 1. UI Dùng Chung
        // ========================================
        this.load.image(TextureKeys.BtnReset, 'assets/images/ui/reload.png');
        this.load.image(TextureKeys.S1_Board, 'assets/images/board/board.png');
        this.load.image(TextureKeys.Ui_Mic, 'assets/images/ui/mic.png');
        this.load.image(TextureKeys.Ui_Speaker, 'assets/images/ui/speaker.png');
        this.load.image(TextureKeys.Ui_Score, 'assets/images/ui/score.png');
        this.load.image(TextureKeys.Speak_Banner, 'assets/images/ui/banner.png');
        this.load.image(TextureKeys.Hand, 'assets/images/ui/hand.png');
        this.load.image(TextureKeys.HandHint, 'assets/images/ui/hand.png'); // Same image as Hand

        // ========================================
        // 2. Hình tàu hỏa (5 levels)
        // ========================================
        this.load.image(TextureKeys.Train_1, 'assets/images/SpeakScene/train_speak_1.png');
        this.load.image(TextureKeys.Train_2, 'assets/images/SpeakScene/image 291.png');
        this.load.image(TextureKeys.Train_3, 'assets/images/SpeakScene/image 292.png');
        this.load.image(TextureKeys.Train_4, 'assets/images/SpeakScene/image 293.png');
        this.load.image(TextureKeys.Train_5, 'assets/images/SpeakScene/image 294.png');

        // ========================================
        // 3. SpeakScene UI
        // ========================================
        this.load.image(TextureKeys.Speak_Speaker, 'assets/images/SpeakScene/speaker.png');
        this.load.image(TextureKeys.Speak_Micro, 'assets/images/SpeakScene/micro.png');
        this.load.image(TextureKeys.Speak_AniSpeak1, 'assets/images/SpeakScene/ani_speak1.png');
        this.load.image(TextureKeys.Speak_AniSpeak2, 'assets/images/SpeakScene/ani_speak2.png');
        this.load.image(TextureKeys.Speak_AniSpeak3, 'assets/images/SpeakScene/ani_speak3.png');

        // ========================================
        // 4. Hoạt hình Mascot (Sprite Sheets)
        // ========================================
        const MASCOT = GameConstants.MASCOT_ANIMATIONS;
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.RECORDING });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.PROCESSING });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.RESULT_HAPPY });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.RESULT_SAD });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.IDLE });

        // ========================================
        // 5. UnderlineScene
        // ========================================
        this.load.image(TextureKeys.Underline_Banner, 'assets/images/UnderlineScene/BAN.png');

        // ========================================
        // 6. Ảnh Điểm Số (4-10)
        // ========================================
        this.load.image(TextureKeys.Score_4, 'assets/images/score/4.png');
        this.load.image(TextureKeys.Score_5, 'assets/images/score/5.png');
        this.load.image(TextureKeys.Score_6, 'assets/images/score/6.png');
        this.load.image(TextureKeys.Score_7, 'assets/images/score/7.png');
        this.load.image(TextureKeys.Score_8, 'assets/images/score/8.png');
        this.load.image(TextureKeys.Score_9, 'assets/images/score/9.png');
        this.load.image(TextureKeys.Score_10, 'assets/images/score/10.png');

        // ========================================
        // 7. Âm thanh
        // ========================================
        this.load.audio(AudioKeys.BgmNen, 'assets/audio/sfx/nhac_nen.mp3');
    }

    create() {
        // Bắt đầu từ SpeakScene
        this.scene.start(SceneKeys.SpeakScene);
    }
}
