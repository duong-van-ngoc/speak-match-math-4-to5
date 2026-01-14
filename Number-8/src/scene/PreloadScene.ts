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
    // Banner (same keys as Arrange High/Low games)
    this.load.image('banner', 'assets/button/HTU.png');
    this.load.image('text', 'assets/text/add-text.png');

    // =========================================================
    // ✅ Number-6 gameplay assets (PNG)
    // =========================================================
    // CountAndPaintScene objects
    this.load.image('square_cake', 'assets/icon/squareCake.png');
    this.load.image('watermelon', 'assets/icon/watermelon.png');
    this.load.image('red_envelope', 'assets/icon/red.png');
    this.load.image('lantern', 'assets/icon/lantern.png');
    this.load.image('sticky_roll', 'assets/icon/stickyRoll.png');
    this.load.image('hand_hint', 'assets/icon/hand.png');

    // Number assets (for CountAndPaintScene counting feedback)
    this.load.image('num_1', 'assets/number/1 (1).png');
    this.load.image('num_2', 'assets/number/2.png');
    this.load.image('num_3', 'assets/number/3.png');
    this.load.image('num_4', 'assets/number/4.png');
    this.load.image('num_5', 'assets/number/5.png');
    this.load.image('num_6', 'assets/number/6.png');
    this.load.image('num_7', 'assets/number/7.png');
    this.load.image('num_8', 'assets/number/8.png');

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
