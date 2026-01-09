import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // --- BACKGROUND ---
    this.load.image('bg1', 'assets/bg/bg1.jpg');

    // ===== UI & Banner (CŨ) =====
    this.load.image('banner_question', 'assets/button/Rectangle 1.png');
    // this.load.image('answer_correct', 'assets/button/V.png');
    // this.load.image('answer_wrong', 'assets/button/X.png');
    this.load.image('btn_next', 'assets/button/next.png');
    // this.load.image('answer_default', 'assets/button/Ellipse 17.png');
    this.load.image('btn_primary_pressed', 'assets/button/HTU.png');
    this.load.image('btn_replay', 'assets/button/replay.png');
    this.load.image('next_end', 'assets/button/next_end.png');
    // Line asset for connect game
    this.load.image('connect_line', 'assets/button/Line 2.png');

    // Banner (same keys as Arrange High/Low games)
    this.load.image('banner', 'assets/button/HTU.png');
    // Banner texts (Number-6 variants)
    this.load.image('text_read', 'assets/text/Question.png');
    this.load.image('text_connect', 'assets/text/add3.png');
    // CountGroupsDetailScene labels + score scale
    this.load.image('count_groups_text_oto', 'assets/text/text1.png');
    this.load.image('count_groups_text_xedap', 'assets/text/text2.png');
    this.load.image('count_groups_text_tructhang', 'assets/text/text3.png');
    this.load.image('count_groups_text_xemay', 'assets/text/text4.png');
    this.load.image('count_groups_text_thuyen', 'assets/text/text5.png');
    this.load.image('count_groups_detail_score_bar', 'assets/text/Frame 97.png');

    // =========================================================
    // ✅ Number-6 gameplay assets (PNG)
    // =========================================================
    // CountGroupsScene vehicles
    this.load.image('veh_car', 'assets/vehicles/image 2.png');
    this.load.image('veh_bike', 'assets/vehicles/image 80.png');
    this.load.image('veh_heli', 'assets/vehicles/image 81.png');
    this.load.image('veh_boat', 'assets/vehicles/image 83.png');
    this.load.image('veh_scooter', 'assets/vehicles/image 82.png');
    // ConnectSix dice (use vehicles assets pack)
    this.load.image('connect_six_dice', 'assets/vehicles/Frame 89.png');
    // ConnectSix composite group images (count baked into the art)
    this.load.image('connect_six_group_scooters_6', 'assets/vehicles/image 3.png');
    this.load.image('connect_six_group_bikes_5', 'assets/vehicles/image 4.png');
    this.load.image('connect_six_group_boats_6', 'assets/vehicles/image 5.png');
    this.load.image('connect_six_group_helis_4', 'assets/vehicles/image 6.png');
    // Hand hint
    this.load.image('hand_hint', 'assets/icon/hand.png');
    // CountGroupsDetail icons
    this.load.image('icon_mic', 'assets/button/Frame 86 (1).png');
    this.load.image('icon_speaker', 'assets/button/Group 287.png');

    // --- BG END ---
    this.load.image('banner_congrat', 'assets/bg_end/banner_congrat.png');
    this.load.image('btn_exit', 'assets/bg_end/btn_exit.png');
    this.load.image('btn_reset', 'assets/bg_end/btn_reset.png');
    this.load.image('icon_end', 'assets/bg_end/icon.png');
    this.load.image('ic_1', 'assets/bg_end/ic_1.png');
    this.load.image('ic_2', 'assets/bg_end/ic_2.png');
    this.load.image('ic_3', 'assets/bg_end/ic_3.png');
    this.load.image('ic_4', 'assets/bg_end/ic_4.png');
    this.load.image('ic_6', 'assets/bg_end/ic_6.png');
    this.load.image('ic_7', 'assets/bg_end/ic_7.png');
    this.load.image('ic_8', 'assets/bg_end/ic_8.png');

    // =========================================================
    // ✅ NEW: GAME "SNAIL / AQUARIUM"
    // =========================================================

    // --- Corner character (góc dưới-trái GameScene) ---
    // GameScene dùng key: corner_character
    this.load.image('corner_character', 'assets/char/char.png'); 

    // --- Pick X + result badges (UI mới GameScene) ---
    // GameScene dùng key: pick_x, result_correct, result_wrong
    // this.load.image('pick_x', 'assets/button/X.png');                   
    // this.load.image('result_correct', 'assets/button/image 86.png');   
    // this.load.image('result_wrong', 'assets/button/image 77.png');       

    // --- BalanceScene corner char (góc dưới-trái BalanceScene) ---
    // BalanceScene dùng key: 'char'
    this.load.image('char', 'assets/char/char.png'); 


    // =========================================================
    // ✅ CONNECT GAME: Big/Small matching (hands/feet/gloves/shoes)
    // =========================================================

  
  }

  create() {
    (async () => {
      // Ensure web fonts (e.g. Baloo 2) are loaded before scenes create text.
      try {
        const fonts = (typeof document !== 'undefined' && (document as any).fonts) || undefined;
        if (fonts?.load) {
          await Promise.race([fonts.load('400 16px \"Baloo 2\"'), new Promise((r) => setTimeout(r, 1200))]);
          await Promise.race([fonts.load('700 16px \"Baloo 2\"'), new Promise((r) => setTimeout(r, 1200))]);
          await Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
        }
      } catch {
        // ignore
      }

      // Gọi BGM trước, sau đó mới vào GameScene (question sẽ phát trong GameScene.startLevel)
      try {
        AudioManager.play('bgm_main');
      } catch {
        // nếu audio chưa load vẫn chuyển cảnh bình thường
      }
      this.scene.start('GameScene');
    })();
  }
}
