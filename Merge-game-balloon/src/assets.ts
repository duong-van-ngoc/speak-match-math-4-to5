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
};

export const OBJECT_ASSET_KEYS = {
  balloonYellow: 'icon_balloon_yellow',
  balloonRed: 'icon_balloon_red',
  boat: 'icon_boat',
  boatCircle: 'icon_boat_circle',
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
  btnNext: 'btn_next',
  answerDefault: 'answer_default',
  btnPrimaryPressed: 'btn_primary_pressed',
  btnReplay: 'btn_replay',
  nextEnd: 'next_end',
};

export const SHARED_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: BOARD_ASSET_KEYS.frame, path: assetPath('bg/board_scene_2.png') },
  { key: BOARD_ASSET_KEYS.bannerBg, path: assetPath('button/HTU.png') },
  { key: 'bg1', path: assetPath('bg/bg1.jpg') },
  { key: OBJECT_ASSET_KEYS.balloonYellow, path: assetPath('icon/Frame 105.png') },
  // Bộ asset hiện chỉ có 1 ảnh khinh khí cầu (có cả đỏ + vàng), nên dùng chung cho cả 2 level tô màu.
  { key: OBJECT_ASSET_KEYS.balloonRed, path: assetPath('icon/Frame 105.png') },
  { key: OBJECT_ASSET_KEYS.boat, path: assetPath('icon/Frame 106.png') },
  // Màn Circle dùng ảnh riêng (Frame 105 (1).png)
  { key: OBJECT_ASSET_KEYS.boatCircle, path: assetPath('icon/Frame 106.png') },
];
// Banner cho từng màn: 3 Color + 1 Circle + 1 Count
export const COLOR_SCENE_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: 'banner_title_1', path: assetPath('text/Question (8).png') }, // Color 1 (khinh khí cầu vàng)
  { key: 'banner_title_2', path: assetPath('text/Question (7).png') }, // Color 2 (khinh khí cầu đỏ)
  { key: 'banner_title_3', path: assetPath('text/Question (6).png') }, // Color 3 (thuyền - tô xanh)
  { key: 'banner_title_4', path: assetPath('text/Question (10).png') }, // Circle
  { key: 'banner_title_5', path: assetPath('text/Question (9).png') }, // Count
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

  { key: UI_ASSET_KEYS.btnNext, path: assetPath('button/next.png') },
  { key: UI_ASSET_KEYS.btnPrimaryPressed, path: assetPath('button/HTU.png') },
  { key: UI_ASSET_KEYS.btnReplay, path: assetPath('button/replay.png') },
  { key: UI_ASSET_KEYS.nextEnd, path: assetPath('button/next_end.png') },
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
