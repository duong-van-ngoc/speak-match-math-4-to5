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
        // 1. UI Chung
        // ========================================
        this.load.image(TextureKeys.BtnExit, 'assets/images/ui/btn_exit.png');
        this.load.image(TextureKeys.BtnReset, 'assets/images/ui/btn_reset.png');
        this.load.image(TextureKeys.HandHint, 'assets/images/ui/hand.png');
        this.load.image(TextureKeys.BgPopup, 'assets/images/bg/board_pop_up.png');
        this.load.image(TextureKeys.S1_Board, 'assets/images/bg/board_white.png');

        // ========================================
        // 2. SpeakScene Assets
        // ========================================
        this.load.image(TextureKeys.Speak_Banner, 'assets/images/SpeakScene/banner.png');
        this.load.image(TextureKeys.Speak_Title, 'assets/images/SpeakScene/title.png');
        this.load.image(TextureKeys.Speak_Content, 'assets/images/SpeakScene/content.png');
        this.load.image(TextureKeys.Speak_Illustration, 'assets/images/SpeakScene/speak_illustration.png');
        this.load.image(TextureKeys.Speak_Speaker, 'assets/images/SpeakScene/speaker.png');
        this.load.image(TextureKeys.Speak_Micro, 'assets/images/SpeakScene/micro.png');
        this.load.image(TextureKeys.Speak_SmileD, 'assets/images/SpeakScene/smile_wth_d.png');
        // Speak Animation (hiệu ứng miệng nói khi chờ chấm điểm)
        this.load.image(TextureKeys.Speak_AniSpeak1, 'assets/images/SpeakScene/ani_speak1.png');
        this.load.image(TextureKeys.Speak_AniSpeak2, 'assets/images/SpeakScene/ani_speak2.png');
        this.load.image(TextureKeys.Speak_AniSpeak3, 'assets/images/SpeakScene/ani_speak3.png');

        // ========================================
        // 3. Mascot Animations (Sprite Sheets)
        // ========================================
        const MASCOT = GameConstants.MASCOT_ANIMATIONS;
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.RECORDING });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.PROCESSING });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.RESULT_HAPPY });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.RESULT_SAD });
        AnimationFactory.preload(this, { ...MASCOT, ...MASCOT.IDLE });

        // ========================================
        // 4. UnderlineCharScene Assets
        // ========================================
        this.load.image(TextureKeys.Underline_Banner, 'assets/images/UnderlineScene/banner.png');

        // Items (trái cây)
        this.load.image(TextureKeys.Underline_ItemWatermelon, 'assets/images/UnderlineScene/item_watermelon.png');
        this.load.image(TextureKeys.Underline_ItemCoconut, 'assets/images/UnderlineScene/item_coconut.png');
        this.load.image(TextureKeys.Underline_ItemStrawberry, 'assets/images/UnderlineScene/item_strawberry.png');

        // Text labels (normal & correct)
        this.load.image(TextureKeys.Underline_TextWatermelon, 'assets/images/UnderlineScene/text_watermelon.png');
        this.load.image(TextureKeys.Underline_TextWatermelon_Correct, 'assets/images/UnderlineScene/text_watermelon_correct.png');
        this.load.image(TextureKeys.Underline_TextCoconut, 'assets/images/UnderlineScene/text_coconut.png');
        this.load.image(TextureKeys.Underline_TextCoconut_Correct, 'assets/images/UnderlineScene/text_coconut_correct.png');
        this.load.image(TextureKeys.Underline_TextStrawberry, 'assets/images/UnderlineScene/text_strawberry.png');
        this.load.image(TextureKeys.Underline_TextStrawberry_Correct, 'assets/images/UnderlineScene/text_strawberry_correct.png');

        // ========================================
        // 5. End Game Assets
        // ========================================
        this.load.image(TextureKeys.End_Icon, 'assets/images/ui/icon_end.png');
        this.load.image(TextureKeys.End_BannerCongrat, 'assets/images/bg/banner_congrat.png');

        // ========================================
        // 5b. Score Images (New Request)
        // ========================================
        this.load.image(TextureKeys.Score_4, 'assets/images/score/4.png');
        this.load.image(TextureKeys.Score_5, 'assets/images/score/5.png');
        this.load.image(TextureKeys.Score_6, 'assets/images/score/6.png');
        this.load.image(TextureKeys.Score_7, 'assets/images/score/7.png');
        this.load.image(TextureKeys.Score_8, 'assets/images/score/8.png');
        this.load.image(TextureKeys.Score_9, 'assets/images/score/9.png');
        this.load.image(TextureKeys.Score_10, 'assets/images/score/10.png');

        // ========================================
        // 6. Audio (Phaser)
        // ========================================
        this.load.audio(AudioKeys.BgmNen, 'assets/audio/sfx/nhac_nen.mp3');

        // Line prompts (trước khi ghi âm mỗi dòng)
        this.load.audio('begin-line2', 'assets/audio/prompt/begin_line2.mp3');
        this.load.audio('begin-line3', 'assets/audio/prompt/begin_line3.mp3');
        this.load.audio('begin-line4', 'assets/audio/prompt/begin_line4.mp3');
        this.load.audio('begin-line5', 'assets/audio/prompt/begin_line5.mp3');
        this.load.audio('begin-line6', 'assets/audio/prompt/begin_line6.mp3');
        this.load.audio('wait-grading', 'assets/audio/prompt/wait_grading.mp3');
    }

    create() {
        // SceneKeys.SpeakScene khi lên production
        this.scene.start(SceneKeys.SpeakScene);
    }
}