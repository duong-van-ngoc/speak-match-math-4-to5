// Asset hình cho số phần đếm (khác số thang số)

import Phaser from 'phaser';

export const ASSET_ROOT = 'assets';

const assetPath = (subPath: string) => `${ASSET_ROOT}/${subPath}`;

export type PreloadImageAsset = {
  key: string;
  path: string;
};

export const BOARD_ASSET_KEYS = {
  frame: 'board_frame',
  bannerBg: 'banner_question',
  bannerText: 'connect_hint',
};

export const COUNT_CONNECT_ASSETS = {
  marbleTextures: ['count_marble_one', 'count_marble_two'],
  bagTextures: ['count_ball_one', 'count_ball_two'],
  // Nếu chưa có asset bóng, cần thêm vào phần COUNT_CONNECT_IMAGE_ASSETS bên dưới
  connectionLine: 'connect_line',
};

export const COLOR_SCENE_ASSETS = {
  paletteDotKeys: ['color_palette_dot_red', 'color_palette_dot_yellow'],
  ballTextures: ['count_ball_one', 'count_ball_two'],
  marbleTextures: ['count_marble_one', 'count_marble_two'],
};

export const NUMBER_ASSETS = {
  keys: ['number_1', 'number_2', 'number_3', 'number_4', 'number_5'],
};
export const COUNTING_NUMBER_ASSETS = {
  keys: [
    'counting_number_1',
    'counting_number_2',
  ],
};

export const COUNTING_NUMBER_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: COUNTING_NUMBER_ASSETS.keys[0], path: assetPath('number/1.png') },
  { key: COUNTING_NUMBER_ASSETS.keys[1], path: assetPath('number/2.png') },
];
export const UI_ASSET_KEYS = {
  answerCorrect: 'answer_correct',
  answerWrong: 'answer_wrong',
  btnNext: 'btn_next',
  answerDefault: 'answer_default',
  btnPrimaryPressed: 'btn_primary_pressed',
  btnReplay: 'btn_replay',
  nextEnd: 'next_end',
  pickX: 'pick_x',
  resultCorrect: 'result_correct',
  resultWrong: 'result_wrong',
  cornerCharacter: 'corner_character',
  char: 'char',
};

export const SHARED_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: BOARD_ASSET_KEYS.frame, path: assetPath('button/Rectangle 1.png') },
  { key: BOARD_ASSET_KEYS.bannerBg, path: assetPath('button/HTU.png') },
  { key: BOARD_ASSET_KEYS.bannerText, path: assetPath('text/add-text.png') },
  { key: 'question1', path: assetPath('text/Question (2).png') }, // Level 2
  { key: 'question2', path: assetPath('text/Question (1).png') }, // Level 3
  { key: 'bg1', path: assetPath('bg/bg1.jpg') },
];

export const COUNT_CONNECT_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: COUNT_CONNECT_ASSETS.marbleTextures[0], path: assetPath('icon/Frame 94.png') },
  { key: COUNT_CONNECT_ASSETS.marbleTextures[1], path: assetPath('icon/Frame 95.png') },
  { key: COUNT_CONNECT_ASSETS.bagTextures[0], path: assetPath('icon/Frame 96.png') },
  { key: COUNT_CONNECT_ASSETS.bagTextures[1], path: assetPath('icon/Frame 97.png') },
  { key: COUNT_CONNECT_ASSETS.connectionLine, path: assetPath('button/Line 2.png') },
];

export const COLOR_SCENE_IMAGE_ASSETS: PreloadImageAsset[] = [
  // empty, palette dots are generated, and object textures are from countConnect group
];

export const NUMBER_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: NUMBER_ASSETS.keys[0], path: assetPath('number/Frame 119.png') },
  { key: NUMBER_ASSETS.keys[1], path: assetPath('number/Frame 120.png') },
  { key: NUMBER_ASSETS.keys[2], path: assetPath('number/Frame 121.png') },
  { key: NUMBER_ASSETS.keys[3], path: assetPath('number/Frame 122.png') },
  { key: NUMBER_ASSETS.keys[4], path: assetPath('number/Frame 123.png') },
];

export const END_SCENE_ASSETS = {
  banner: 'banner_congrat',
  icon: 'icon_end',
  btnReset: 'btn_reset',
  btnExit: 'btn_exit',
};

export const END_SCENE_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: END_SCENE_ASSETS.banner, path: assetPath('bg_end/banner_congrat.png') },
  { key: END_SCENE_ASSETS.icon, path: assetPath('bg_end/icon.png') },
  { key: END_SCENE_ASSETS.btnReset, path: assetPath('bg_end/btn_reset.png') },
  { key: END_SCENE_ASSETS.btnExit, path: assetPath('bg_end/btn_exit.png') },
];

export const GAME_UI_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: UI_ASSET_KEYS.answerCorrect, path: assetPath('button/V.png') },
  { key: UI_ASSET_KEYS.answerWrong, path: assetPath('button/X.png') },
  { key: UI_ASSET_KEYS.btnNext, path: assetPath('button/next.png') },
  { key: UI_ASSET_KEYS.answerDefault, path: assetPath('button/Ellipse 17.png') },
  { key: UI_ASSET_KEYS.btnPrimaryPressed, path: assetPath('button/HTU.png') },
  { key: UI_ASSET_KEYS.btnReplay, path: assetPath('button/replay.png') },
  { key: UI_ASSET_KEYS.nextEnd, path: assetPath('button/next_end.png') },
  { key: UI_ASSET_KEYS.pickX, path: assetPath('button/X.png') },
  { key: UI_ASSET_KEYS.resultCorrect, path: assetPath('button/image 86.png') },
  { key: UI_ASSET_KEYS.resultWrong, path: assetPath('button/image 77.png') },
  { key: UI_ASSET_KEYS.cornerCharacter, path: assetPath('char/char.png') },
  { key: UI_ASSET_KEYS.char, path: assetPath('char/char.png') },
  { key: 'guide_hand', path: assetPath('icon/hand.png') },
];
// Voice guide audio asset keys for each scene
export const VOICE_GUIDE_ASSET_KEYS = {
  // Connect scene: 1 voice
  connect: 'voice_guide_connect',
  // Color scene: 2 voices
  color1: 'voice_guide_color1',
  color2: 'voice_guide_color2',
};

// Voice guide audio asset paths for each scene
export const VOICE_GUIDE_ASSETS = [
  { key: VOICE_GUIDE_ASSET_KEYS.connect, path: assetPath('audio/count.mp3') }, // ví dụ, thay bằng file bạn muốn
  { key: VOICE_GUIDE_ASSET_KEYS.color1, path: assetPath('audio/ball.mp3') },
  { key: VOICE_GUIDE_ASSET_KEYS.color2, path: assetPath('audio/marble.mp3') },
];

export const ASSET_GROUPS = {
  shared: SHARED_IMAGE_ASSETS,
  countConnect: COUNT_CONNECT_IMAGE_ASSETS,
  colorScene: COLOR_SCENE_IMAGE_ASSETS,
  numbers: NUMBER_IMAGE_ASSETS,
  countingNumbers: COUNTING_NUMBER_IMAGE_ASSETS,
  endScene: END_SCENE_IMAGE_ASSETS,
  ui: GAME_UI_IMAGE_ASSETS,
  audio: VOICE_GUIDE_ASSETS,
} as const;

export type AssetGroupKey = keyof typeof ASSET_GROUPS;

export function loadAssetGroups(scene: Phaser.Scene, ...groups: AssetGroupKey[]) {
  const toLoad: PreloadImageAsset[] = [];
  groups.forEach((group) => toLoad.push(...ASSET_GROUPS[group]));
  toLoad.forEach(({ key, path }) => {
    if (scene.textures.exists(key)) return;
    scene.load.image(key, path);
  });
}
