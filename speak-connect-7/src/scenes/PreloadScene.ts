// src/scenes/PreloadScene.ts
import Phaser from 'phaser';
import { SceneKeys, TextureKeys, AudioKeys } from '../consts/Keys';
import { GameConstants } from '../consts/GameConstants';
import { AnimationFactory } from '../utils/AnimationFactory';
import AudioManager from '../audio/AudioManager';

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
        // 2. UnderlineScene Assets (Gạch chân)
        // ========================================
        this.load.image(TextureKeys.Underline_Banner, 'assets/images/UnderlineScene/banner.png');

        // Mapping Items (Watermelon->Blossom, Coconut->Daisy, Strawberry->Banyan based on Audio)






        // ========================================
        // 3. VehicleScene Assets (Phương tiện)
        // ========================================
        this.load.image(TextureKeys.Speak_Banner, 'assets/images/UnderlineScene/banner.png');

        this.load.image(TextureKeys.Speak_Speaker, 'assets/images/SpeakScene/speaker.png');
        this.load.image(TextureKeys.Speak_Micro, 'assets/images/SpeakScene/micro.png');

        // Speak Animation (miệng nói)
        this.load.image(TextureKeys.Speak_AniSpeak1, 'assets/images/SpeakScene/ani_speak1.png');
        this.load.image(TextureKeys.Speak_AniSpeak2, 'assets/images/SpeakScene/ani_speak2.png');
        this.load.image(TextureKeys.Speak_AniSpeak3, 'assets/images/SpeakScene/ani_speak3.png');

        // Load hình ảnh hiện tượng thiên nhiên và chữ đi kèm từ config
        const NATURE = GameConstants.NATURE_PHENOMENA;
        NATURE.ITEMS.forEach((item) => {
            this.load.image(item.imageKey, item.imagePath);
            if (item.textKey && item.textPath) {
                this.load.image(item.textKey, item.textPath);
            }
        });

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
        // 4. End Game Assets
        // ========================================
        this.load.image(TextureKeys.End_Icon, 'assets/images/ui/icon_end.png');
        this.load.image(TextureKeys.End_BannerCongrat, 'assets/images/bg/banner_congrat.png');

        // ========================================
        // 5. Score Images
        // ========================================
        this.load.image(TextureKeys.Score_4, 'assets/images/score/4.png');
        this.load.image(TextureKeys.Score_5, 'assets/images/score/5.png');
        this.load.image(TextureKeys.Score_6, 'assets/images/score/6.png');
        this.load.image(TextureKeys.Score_7, 'assets/images/score/7.png');
        this.load.image(TextureKeys.Score_8, 'assets/images/score/8.png');
        this.load.image(TextureKeys.Score_9, 'assets/images/score/9.png');
        this.load.image(TextureKeys.Score_10, 'assets/images/score/10.png');

        // 6. Audio (Phaser)
        // ========================================
        this.load.audio(AudioKeys.BgmNen, 'assets/audio/sfx/nhac_nen.mp3');

        // ========================================
        // 7. Bắt đầu tải Voice & SFX sớm thông qua AudioManager
        // ========================================
        AudioManager.loadAll();

        // ========================================
        // 8. Connect Six Assets
        // ========================================
        // Board & Banner
        // Board & Banner
        this.load.image(TextureKeys.Connect_Board, 'assets/images/bg/board_white.png');
        this.load.image(TextureKeys.Connect_TopBanner, 'assets/connectScene/banner.png');
        // this.load.image(TextureKeys.Connect_TopBannerText, 'assets/connectScene/banner_text.png');
        // this.load.image(TextureKeys.Connect_TopBannerTextConnect, 'assets/connectScene/text_connect.png');

        // Nature Phenomena (Tải động từ cấu hình Groups)
        const CONNECT_GROUPS = GameConstants.CONNECT_SCENE.GROUPS;
        CONNECT_GROUPS.forEach(group => {
            const fileName = group.id;
            this.load.image(group.spriteKey, `assets/connectScene/${fileName}.png`);
        });

        this.load.image(TextureKeys.Connect_Dice, 'assets/connectScene/placeholder.png');
    }

    create() {
        // Đảm bảo âm thanh đã load xong (hoặc đang load) trước khi vào game
        if (GameConstants.IS_TEST_CONNECT_ONLY) {
            this.scene.start(SceneKeys.ConnectSixScene);
        } else {
            this.scene.start(SceneKeys.SpeakScene);
        }
    }
}