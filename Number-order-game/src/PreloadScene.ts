import Phaser from 'phaser';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // --- BACKGROUND ---
    this.load.image('bg1', 'assets/bg/bg1.jpg');

    // ===== UI & Banner (CŨ) =====
    this.load.image('banner_question', 'assets/text/Question.png');
    this.load.image('game_board', 'assets/button/Rectangle 1.png');
    this.load.image('answer_correct', 'assets/button/image 77.png');
    this.load.image('answer_wrong', 'assets/button/image 86.png');
    this.load.image('btn_next', 'assets/button/next.png');
    this.load.image('answer_default', 'assets/button/Ellipse 14.png');
    this.load.image('btn_primary_pressed', 'assets/button/HTU.png');
    this.load.image('btn_replay', 'assets/button/replay.png');
    this.load.image('next_end', 'assets/button/next_end.png');
    // Line asset for connect game
    this.load.image('connect_line_v6', 'assets/button/Line 3.png');

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
    // ✅ NEW: PATH GAME ASSETS
    // =========================================================

    // Stations (Rabbit Scenes)
    this.load.image('station_1', 'assets/icon/image 290.png');
    this.load.image('station_2', 'assets/icon/image 293.png');
    this.load.image('station_3', 'assets/icon/image 293-1.png');
    this.load.image('station_4', 'assets/icon/image 293 (1).png');
    this.load.image('station_5', 'assets/icon/image 293 (2).png');

    // Numbers
    this.load.image('number_1', 'assets/number/1.png');
    this.load.image('number_2', 'assets/number/2.png');
    this.load.image('number_3', 'assets/number/3.png');
    this.load.image('number_4', 'assets/number/4.png');
    this.load.image('number_5', 'assets/number/5.png');

    // Fallback/Aliases
    this.load.image('rabbit', 'assets/icon/image 290.png');
    this.load.image('mushroom', 'assets/icon/image 293.png');

    this.load.image('dot', 'assets/button/Ellipse 14.png');
    this.load.image('dashed_line', 'assets/button/Vector 1.png');
    this.load.image('paint_brush', 'assets/icon/hand.png');
  }

  create() {
    this.scene.start('GameScene');
  }
}
