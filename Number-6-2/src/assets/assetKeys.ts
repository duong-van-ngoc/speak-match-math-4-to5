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
} as const;

export const COUNT_AND_PAINT_ASSET_KEYS = {
  ...UI_ASSET_KEYS,
  // Objects shown on top
  bicycle: 'bicycle',
  car: 'car',
  airplane: 'airplane',
  boat: 'boat',
  scooter: 'scooter',

  // Circle slots (generated if missing)
  circleEmpty: 'circle_empty',
  circleFilledRed: 'circle_filled_red',
  circleFilledGreen: 'circle_filled_green',
} as const;

export const COUNT_GROUPS_ASSET_KEYS = {
  ...UI_ASSET_KEYS,
  // Banner text image for "reading" stages.
  topBannerTextRead: 'text_read',
  vehCar: 'veh_car',
  vehBike: 'veh_bike',
  vehHeli: 'veh_heli',
  vehBoat: 'veh_boat',
  vehScooter: 'veh_scooter',
  handHint: 'hand_hint',
  micIcon: 'icon_mic',
  speakerIcon: 'icon_speaker',
  // CountGroupsDetailScene label images + score scale
  detailTextCar: 'count_groups_text_oto',
  detailTextBike: 'count_groups_text_xedap',
  detailTextHeli: 'count_groups_text_tructhang',
  detailTextBoat: 'count_groups_text_thuyen',
  detailTextScooter: 'count_groups_text_xemay',
  detailScoreBar: 'count_groups_detail_score_bar',
} as const;

export const CONNECT_SIX_ASSET_KEYS = {
  ...UI_ASSET_KEYS,
  // Banner text image for ConnectSix stage.
  topBannerTextConnect: 'text_connect',
  // Dice image in the center of ConnectSixScene (fallback is generated if missing).
  dice: 'connect_six_dice',
  // Composite group images that already encode the count (assets/vehicles).
  groupScooters6: 'connect_six_group_scooters_6',
  groupBoats6: 'connect_six_group_boats_6',
  groupBikes5: 'connect_six_group_bikes_5',
  groupHelis4: 'connect_six_group_helis_4',
} as const;
