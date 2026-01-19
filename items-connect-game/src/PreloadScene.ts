import Phaser from 'phaser';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // --- BACKGROUND ---
    this.load.image('bg1', 'assets/bg/bg1.jpg');

    // ===== UI & Banner (CŨ) =====
    this.load.image('banner_question', 'assets/button/Rectangle 1.png');
    this.load.image('answer_correct', 'assets/button/V.png');
    this.load.image('answer_wrong', 'assets/button/X.png');
    this.load.image('btn_next', 'assets/button/next.png');
    this.load.image('answer_default', 'assets/button/Ellipse 17.png');
    this.load.image('btn_primary_pressed', 'assets/button/HTU.png');
    this.load.image('btn_replay', 'assets/button/replay.png');
    this.load.image('next_end', 'assets/button/next_end.png');
    // Line asset for connect game
    this.load.image('connect_line_v4', 'assets/button/Line 3.png');

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
    this.load.image('pick_x', 'assets/button/X.png');                   
    this.load.image('result_correct', 'assets/button/image 86.png');   
    this.load.image('result_wrong', 'assets/button/image 77.png');       

    // --- BalanceScene corner char (góc dưới-trái BalanceScene) ---
    // BalanceScene dùng key: 'char'
    this.load.image('char', 'assets/char/char.png'); 


    // =========================================================
    // ✅ CONNECT GAME: Big/Small matching (hands/feet/gloves/shoes)
    // =========================================================

    // 14 item assets in board (10 objects around + 4 shape targets in the middle)
    this.load.image('obj_clock', 'assets/icon/image 286.png');
    this.load.image('obj_ring', 'assets/icon/image 285.png');
    this.load.image('obj_plate', 'assets/icon/image 279.png');

    this.load.image('obj_flag', 'assets/icon/image 282.png');
    this.load.image('obj_postcard', 'assets/icon/image 283.png');
    this.load.image('obj_landscape', 'assets/icon/image 277.png');

    this.load.image('obj_warning', 'assets/icon/image 284.png');
    this.load.image('obj_setsquare', 'assets/icon/image 280.png');

    this.load.image('obj_tile', 'assets/icon/image 281.png');
    this.load.image('obj_gift', 'assets/icon/image 287.png');

    this.load.image('shape_square', 'assets/icon/Rectangle 126.png');
    this.load.image('shape_rectangle', 'assets/icon/Rectangle 127.png');
    this.load.image('shape_circle', 'assets/icon/Ellipse 13.png');
    this.load.image('shape_triangle', 'assets/icon/Polygon 7.png');
    this.load.image('guide_hand', 'assets/icon/hand.png');

    // Hint banner (fallback to text if missing)
    this.load.image('connect_hint', 'assets/text/Question.png');
  }

  create() {
    this.scene.start('GameScene');
  }
}
