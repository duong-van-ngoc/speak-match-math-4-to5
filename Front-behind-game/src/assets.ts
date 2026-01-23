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
};

export const COLOR_SCENE_ASSETS = {
  // Palette dots from `public/assets/color/*`
  // Order: red, yellow, green, blue, purple, pink, cream, black, eraser
  paletteDotKeys: [
    'palette_red',
    'palette_yellow',
    'palette_green',
    'palette_blue',
    'palette_purple',
    'palette_pink',
    'palette_cream',
    'palette_black',
    'palette_eraser',
  ],
};

export const FRONT_BEHIND_SCENE_ASSETS = {
  girl: 'front_behind_girl',
  catFront: 'front_behind_cat_front',
  catBehind: 'front_behind_cat_behind',
};

export const UI_ASSET_KEYS = {
  btnPrimaryPressed: 'btn_primary_pressed',
  btnReplay: 'btn_replay',
  nextEnd: 'next_end',
  resultCorrect: 'result_correct',
  resultWrong: 'result_wrong',
};

export const SHARED_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: BOARD_ASSET_KEYS.frame, path: assetPath('button/Rectangle 1.png') },
  { key: BOARD_ASSET_KEYS.bannerBg, path: assetPath('button/HTU.png') },
  { key: 'question1', path: assetPath('text/Question.png') }, // Level 1
  { key: 'question2', path: assetPath('text/Question (1).png') }, // Level 2
  { key: 'bg1', path: assetPath('bg/bg1.jpg') },
];


export const COLOR_SCENE_IMAGE_ASSETS: PreloadImageAsset[] = [
  // Girl + cats
  { key: FRONT_BEHIND_SCENE_ASSETS.catFront, path: assetPath('icon/Group 1.png') },
  { key: FRONT_BEHIND_SCENE_ASSETS.catBehind, path: assetPath('icon/Group 2.png') },
  { key: FRONT_BEHIND_SCENE_ASSETS.girl, path: assetPath('icon/Group 3.png') },

  // Palette dots (assets/color)
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[0], path: assetPath('color/Ellipse 3.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[1], path: assetPath('color/Ellipse 4.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[2], path: assetPath('color/Ellipse 5.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[3], path: assetPath('color/Ellipse 6.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[4], path: assetPath('color/Ellipse 7.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[5], path: assetPath('color/Ellipse 8.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[6], path: assetPath('color/Ellipse 9.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[7], path: assetPath('color/Ellipse 10.png') },
  { key: COLOR_SCENE_ASSETS.paletteDotKeys[8], path: assetPath('color/image 276.png') },
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
  { key: UI_ASSET_KEYS.btnPrimaryPressed, path: assetPath('button/HTU.png') },
  { key: UI_ASSET_KEYS.btnReplay, path: assetPath('button/replay.png') },
  { key: UI_ASSET_KEYS.nextEnd, path: assetPath('button/next_end.png') },
  { key: UI_ASSET_KEYS.resultCorrect, path: assetPath('button/image 86.png') },
  { key: UI_ASSET_KEYS.resultWrong, path: assetPath('button/image 77.png') },
  { key: 'guide_hand', path: assetPath('icon/hand.png') },
];
// Voice guide audio asset keys for each scene
export const VOICE_GUIDE_ASSET_KEYS = {
  // Connect scene: 1 voice
  connect: 'voice_guide_connect',
  // Color scene: 2 voices
  color1: 'voice_guide_color_1',
  color2: 'voice_guide_color_2',
};

// Voice guide audio asset paths for each scene
export const VOICE_GUIDE_ASSETS = [
  { key: VOICE_GUIDE_ASSET_KEYS.connect, path: assetPath('audio/count.mp3') }, // ví dụ, thay bằng file bạn muốn
  { key: VOICE_GUIDE_ASSET_KEYS.color1, path: assetPath('audio/color.mp3') },
  { key: VOICE_GUIDE_ASSET_KEYS.color2, path: assetPath('audio/cricle.mp3') },
];

export const ASSET_GROUPS = {
  shared: SHARED_IMAGE_ASSETS,
  colorScene: COLOR_SCENE_IMAGE_ASSETS,
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
