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

  // --- BACKGROUND ---
  scene.load.image("bg1", "assets/bg/bg1.jpg");
  scene.load.image("bg2", "assets/bg/bg2.jpg");
  scene.load.image("bg3", "assets/bg/bg3.jpg");
  scene.load.image("bg4", "assets/bg/bg4.jpg");
  scene.load.image("bg5", "assets/bg/bg5.jpg");
  // --- CHARACTERS ---
  scene.load.image("char", "assets/char/char.png");

  // --- BUTTONS ---
  scene.load.image("replay_endgame", "assets/button/replay_endgame.png");
  scene.load.image("replay_svg", BUTTON_ASSET_URLS.replay_svg);
  scene.load.image("next_svg", BUTTON_ASSET_URLS.next_svg);
  scene.load.image("exit_endgame", "assets/button/exit.png");
  // --- CARDS ---
  scene.load.image("card", "assets/card/card.png");
  scene.load.image("card2", "assets/card/card2.png");
  scene.load.image("line_glow", "assets/card/line_glow.png");
  scene.load.image("board", "assets/card/board.png");
  scene.load.image('text', 'assets/card/text.png');
  scene.load.image('banner', 'assets/card/banner.png');

  // --- ICONS ---
  scene.load.image("hand", "assets/icon/hand.png");
  scene.load.image("cat", "assets/icon/cat.png");
  scene.load.image("dog", "assets/icon/dog.png");
  scene.load.image("pig", "assets/icon/pig.png");
  scene.load.image("chicken", "assets/icon/chicken.png");

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
