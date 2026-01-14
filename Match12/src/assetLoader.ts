import Phaser from "phaser";

// Các URL gốc cho nút UI – dùng chung cho preload và HTML button
export const BUTTON_ASSET_URLS = {
  replay_svg: "assets/button/replay.png",
  next_svg: "assets/button/next.png",
};

// Chỉ load những asset cần cho màn intro
export function preloadIntroAssets(scene: Phaser.Scene): void {
  // // AUDIO: chỉ cần nhạc nền + voice_intro
  // scene.load.audio("voice_intro", "assets/audio/voice_intro.ogg");
  // scene.load.audio("bgm_main", "assets/audio/bgm_main.ogg");
}


// Load toàn bộ asset dùng trong game (GameScene + EndGameScene)
export function preloadGameAssets(scene: Phaser.Scene): void {
  // // --- AUDIO ---
  // scene.load.audio("voice_intro", "assets/audio/voice_intro.mp3");
  // scene.load.audio("voice_complete", "assets/audio/complete.mp3");
  // scene.load.audio("voice_need_finish", "assets/audio/voice_need_finish.mp3");
  // scene.load.audio("sfx_correct", "assets/audio/correct.mp3");
  // scene.load.audio("sfx_wrong", "assets/audio/wrong.mp3");
  // scene.load.audio("bgm_main", "assets/audio/bgm_main.mp3");
  // scene.load.audio("voice_end", "assets/audio/voice_end.mp3");
  // scene.load.audio("voice_rotate", "assets/audio/xoay.mp3");
  // scene.load.audio("correct_1", "assets/audio/correct_answer_1.mp3");
  // scene.load.audio("correct_2", "assets/audio/correct_answer_2.mp3");
  // scene.load.audio("correct_3", "assets/audio/correct_answer_3.mp3");
  // scene.load.audio("correct_4", "assets/audio/correct_answer_4.mp3");
  // scene.load.audio("complete", "assets/audio/vic_sound.mp3");
  // scene.load.audio("fireworks", "assets/audio/fireworks.mp3");
  // scene.load.audio("applause", "assets/audio/applause.mp3");
  // scene.load.audio("sfx_click", "assets/audio/click.mp3");
  // --- BACKGROUND ---
  scene.load.image("bg1", "assets/bg/bg1.jpg");
  scene.load.image("bg2", "assets/bg/bg2.jpg");
  scene.load.image("bg3", "assets/bg/bg3.jpg");
  scene.load.image("bg4", "assets/bg/bg4.jpg");
  scene.load.image("bg5", "assets/bg/bg5.jpg");
  // --- CHARACTERS ---
  scene.load.image("char1", "assets/char/char1.png");
  scene.load.image("char2", "assets/char/char2.png");

  // --- BUTTONS ---
  scene.load.image("replay_endgame", "assets/button/replay_endgame.png");
  scene.load.image("replay_svg", BUTTON_ASSET_URLS.replay_svg);
  scene.load.image("next_svg", BUTTON_ASSET_URLS.next_svg);
  scene.load.image("exit_endgame", "assets/button/exit.png");
  // --- CARDS ---
  scene.load.image("card", "assets/card/Group 13.png");
  scene.load.image("card2", "assets/card/Group 17.png");
  scene.load.image("line_glow", "assets/card/line_glow.png");
  scene.load.image("board", "assets/card/board.png");
  scene.load.image('text', 'assets/card/text.png');
  scene.load.image('banner', 'assets/card/banner.png');

  // --- ICONS ---
  scene.load.image("hand", "assets/icon/hand.png");
  scene.load.image("babie", "assets/icon/babie.png");
  scene.load.image("bear", "assets/icon/bear.png");
  scene.load.image("marble", "assets/icon/marble.png");
  scene.load.image("ball", "assets/icon/ball.png");
  scene.load.image("flower", "assets/icon/flower.png");
  scene.load.image("drum", "assets/icon/drum.png");
  scene.load.image("clock", "assets/icon/clock.png");
  scene.load.image("yellow", "assets/icon/yellow.png");
  scene.load.image("red", "assets/icon/red.png");
  scene.load.image("rabbit", "assets/icon/rabbit.png");

  // --- BG END ---
      scene.load.image("banner_congrat", "assets/bg_end/banner_congrat.png");
      scene.load.image("btn_exit", "assets/bg_end/btn_exit.png");
      scene.load.image("btn_reset", "assets/bg_end/btn_reset.png");
      scene.load.image("icon_end", "assets/bg_end/icon.png");
      scene.load.image("ic_1", "assets/bg_end/ic_1.png");
      scene.load.image("ic_2", "assets/bg_end/ic_2.png");
      scene.load.image("ic_3", "assets/bg_end/ic_3.png");
      scene.load.image("ic_4", "assets/bg_end/ic_4.png");
      scene.load.image("ic_6", "assets/bg_end/ic_6.png");
      scene.load.image("ic_7", "assets/bg_end/ic_7.png");
      scene.load.image("ic_8", "assets/bg_end/ic_8.png");
}

// Giữ hàm cũ cho tương thích, nếu đâu đó vẫn gọi preloadAssets
export function preloadAssets(scene: Phaser.Scene): void {
  preloadGameAssets(scene);
}
