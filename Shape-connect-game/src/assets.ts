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
  bannerTextLevel1: 'banner_text_l1',
  bannerTextLevel2: 'banner_text_l2',
};




export const UI_ASSET_KEYS = {
  btnNext: 'btn_next',
  answerDefault: 'answer_default',
  btnPrimaryPressed: 'btn_primary_pressed',
  btnReplay: 'btn_replay',
  nextEnd: 'next_end',
};

export const SHAPE_ASSET_KEYS = {
  shape1: 'shape_1',
  shape2: 'shape_2',
  shape3: 'shape_3_swapped',
  shape4: 'shape_4_swapped',
  targetRect: 'target_rect',
  targetSquare: 'target_square',
  num1: 'shape_num_1',
  num2: 'shape_num_2',
  num3: 'shape_num_3',
  num4: 'shape_num_4',
} as const;

export const SHARED_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: BOARD_ASSET_KEYS.frame, path: assetPath('button/Rectangle 1.png') },
  { key: BOARD_ASSET_KEYS.bannerBg, path: assetPath('button/HTU.png') },
  { key: BOARD_ASSET_KEYS.bannerTextLevel1, path: assetPath('text/Question.png') },
  { key: BOARD_ASSET_KEYS.bannerTextLevel2, path: assetPath('text/1.png') },
  { key: 'bg1', path: assetPath('bg/bg1.jpg') },
];



export const SHAPE_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: SHAPE_ASSET_KEYS.shape1, path: assetPath('shape/Vector 9.png') }, // Big Tri
  { key: SHAPE_ASSET_KEYS.shape2, path: assetPath('shape/Vector 15.png') }, // Small Tri (Top Right?)
  { key: SHAPE_ASSET_KEYS.shape3, path: assetPath('shape/Vector 12.png') }, // Big Tri (Bot Left?)
  { key: SHAPE_ASSET_KEYS.shape4, path: assetPath('shape/Vector 11.png') },  // Small Tri (Bot Right?)
  { key: SHAPE_ASSET_KEYS.targetRect, path: assetPath('shape/Group 322.png') },
  { key: SHAPE_ASSET_KEYS.targetSquare, path: assetPath('shape/Group 323.png') },
  { key: SHAPE_ASSET_KEYS.num1, path: assetPath('number/1.png') },
  { key: SHAPE_ASSET_KEYS.num2, path: assetPath('number/2.png') },
  { key: SHAPE_ASSET_KEYS.num3, path: assetPath('number/3.png') },
  { key: SHAPE_ASSET_KEYS.num4, path: assetPath('number/4.png') },
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


export const ASSET_GROUPS = {
  shared: SHARED_IMAGE_ASSETS,
  ui: GAME_UI_IMAGE_ASSETS,
  shapes: SHAPE_IMAGE_ASSETS,
  endScene: END_SCENE_IMAGE_ASSETS,
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
