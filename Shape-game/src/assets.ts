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

// Asset cho các màn: vịt và chim
export const DUCK_ASSET = {
  icon: 'icon_duck',
  image: 'duck_elip',
  label: 'Vịt',
};
export const BIRD_ASSET = {
  icon: 'icon_bird',
  image: 'bird_elip',
  label: 'Chim',
};

export const SCENE_OBJECTS = {
  circleMark: [DUCK_ASSET, BIRD_ASSET],
  countConnect: [DUCK_ASSET, BIRD_ASSET],
  colorScene: [DUCK_ASSET, BIRD_ASSET],
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

export const SHAPE_ASSET_KEYS = {
  head: 'shape_head',
  hat: 'shape_hat',
  body: 'shape_body',
  neck: 'shape_neck',
  arm: 'shape_arm',
  leg: 'shape_leg',
  shoe: 'shape_shoe',
} as const;

export const PALETTE_ASSET_KEYS = {
  red: 'palette_red',
  yellow: 'palette_yellow',
  blue: 'palette_blue',
  brown: 'palette_brown',
  eraser: 'palette_eraser',
} as const;

export const LEVEL2_ASSET_KEYS = {
  picture: 'level2_picture',
  iconCircle: 'level2_icon_circle',
  iconTriangle: 'level2_icon_triangle',
  iconRectangle: 'level2_icon_rectangle',
  iconSquare: 'level2_icon_square',
} as const;

export const SHARED_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: BOARD_ASSET_KEYS.frame, path: assetPath('button/Rectangle 1.png') },
  { key: BOARD_ASSET_KEYS.bannerBg, path: assetPath('button/HTU.png') },
  { key: BOARD_ASSET_KEYS.bannerText, path: assetPath('text/add-text.png') },
  { key: 'bg1', path: assetPath('bg/bg1.jpg') },
  { key: 'icon_duck', path: assetPath('icon/Group 2.png') },
  { key: 'icon_bird', path: assetPath('icon/Frame 100.png') },
];
export const COUNT_CONNECT_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: 'duck_elip', path: assetPath('icon/Frame 102.png') },
  { key: 'bird_elip', path: assetPath('icon/Group 12.png') },
];
// Tiêu đề cho từng màn (1-6): 1-2 Color, 3-4 Circle, 5-6 Count
export const COLOR_SCENE_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: 'banner_title_1', path: assetPath('text/Question (2).png') }, // Level 1
  { key: 'banner_title_2', path: assetPath('text/Question.png') }, // Color 2
  { key: 'banner_title_3', path: assetPath('text/Question (4).png') }, // Circle 1 - Vịt
  { key: 'banner_title_4', path: assetPath('text/Question (3).png') }, // Circle 2 - Chim
  { key: 'banner_title_5', path: assetPath('text/Question (3).png') }, // Level 2
  { key: 'banner_title_6', path: assetPath('text/Question (2).png') }, // Count 2
];

export const NUMBER_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: NUMBER_ASSETS.keys[0], path: assetPath('number/Frame 119.png') },
  { key: NUMBER_ASSETS.keys[1], path: assetPath('number/Frame 120.png') },
  { key: NUMBER_ASSETS.keys[2], path: assetPath('number/Frame 121.png') },
  { key: NUMBER_ASSETS.keys[3], path: assetPath('number/Frame 122.png') },
  { key: NUMBER_ASSETS.keys[4], path: assetPath('number/Frame 123.png') },
];

export const SHAPE_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: SHAPE_ASSET_KEYS.head, path: assetPath('shape/Ellipse 11.png') },
  { key: SHAPE_ASSET_KEYS.hat, path: assetPath('shape/Polygon 1.png') },
  { key: SHAPE_ASSET_KEYS.body, path: assetPath('shape/Rectangle 116.png') },
  { key: SHAPE_ASSET_KEYS.neck, path: assetPath('shape/Rectangle 113.png') },
  { key: SHAPE_ASSET_KEYS.arm, path: assetPath('shape/Rectangle 114.png') },
  { key: SHAPE_ASSET_KEYS.leg, path: assetPath('shape/Rectangle 117.png') },
  { key: SHAPE_ASSET_KEYS.shoe, path: assetPath('shape/Polygon 2.png') },
];

export const PALETTE_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: PALETTE_ASSET_KEYS.red, path: assetPath('color/Ellipse 3.png') },
  { key: PALETTE_ASSET_KEYS.yellow, path: assetPath('color/Ellipse 4.png') },
  { key: PALETTE_ASSET_KEYS.blue, path: assetPath('color/Ellipse 6.png') },
  { key: PALETTE_ASSET_KEYS.brown, path: assetPath('color/Ellipse 9 (1).png') },
  { key: PALETTE_ASSET_KEYS.eraser, path: assetPath('color/image 276.png') },
];

export const LEVEL2_IMAGE_ASSETS: PreloadImageAsset[] = [
  { key: LEVEL2_ASSET_KEYS.picture, path: assetPath('icon/Frame 142.png') },
  { key: LEVEL2_ASSET_KEYS.iconCircle, path: assetPath('icon/Ellipse 12.png') },
  { key: LEVEL2_ASSET_KEYS.iconTriangle, path: assetPath('icon/Polygon 4.png') },
  { key: LEVEL2_ASSET_KEYS.iconRectangle, path: assetPath('icon/Rectangle 119.png') },
  { key: LEVEL2_ASSET_KEYS.iconSquare, path: assetPath('icon/Rectangle 119 (1).png') },
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
  countConnect: COUNT_CONNECT_IMAGE_ASSETS,
  colorScene: COLOR_SCENE_IMAGE_ASSETS,
  numbers: NUMBER_IMAGE_ASSETS,
  countingNumbers: COUNTING_NUMBER_IMAGE_ASSETS,
  endScene: END_SCENE_IMAGE_ASSETS,
  ui: GAME_UI_IMAGE_ASSETS,
  shapes: SHAPE_IMAGE_ASSETS,
  palette: PALETTE_IMAGE_ASSETS,
  level2: LEVEL2_IMAGE_ASSETS,
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
