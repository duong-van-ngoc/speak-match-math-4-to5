export const UI_ASSET_KEYS = {
  // Shared banner (same naming as Arrange High/Low games)
  topBanner: 'banner',
  topBannerText: 'text',

  // Shared board frame used by Number-6 mini games
  board: 'banner_question',

  // Number images (assets/number)
  number1: 'num_1',
  number2: 'num_2',
  number3: 'num_3',
  number4: 'num_4',
  number5: 'num_5',
  number6: 'num_6',
  number7: 'num_7',
} as const;


export const COUNT_AND_PAINT_ASSET_KEYS = {
  ...UI_ASSET_KEYS,
  // Đổi tên các item thành asset mới
  sun: 'sun',        // ô tô -> mặt trời
  moon: 'moon',      // xe đạp -> mặt trăng
  rainbow: 'rainbow',// máy bay -> cầu vồng
  cloud: 'cloud',    // thuyền -> đám mây
  star: 'star',      // xe máy -> ngôi sao

  // Circle slots (generated if missing)
  circleEmpty: 'circle_empty',
  circleFilledRed: 'circle_filled_red',
  circleFilledGreen: 'circle_filled_green',
} as const;
