export const UI_ASSET_KEYS = {
  // Shared banner (same naming as Arrange High/Low games)
  topBanner: 'banner',
  topBannerText: 'text',

  // Shared board frame used by Number-6 mini games
  board: 'banner_question',
} as const;

export const COUNT_GROUPS_ASSET_KEYS = {
  ...UI_ASSET_KEYS,
  // Banner text image for "reading" stages.
  topBannerTextRead: 'text_read',
  vehSun: 'veh_sun',
  vehMoon: 'veh_moon',
  vehRainbow: 'veh_rainbow',
  vehCloud: 'veh_cloud',
  vehStar: 'veh_star',
  handHint: 'hand_hint',
  micIcon: 'icon_mic',
  speakerIcon: 'icon_speaker',
  // CountGroupsDetailScene label images + score scale
  detailTextSun: 'count_groups_text_sun',
  detailTextMoon: 'count_groups_text_moon',
  detailTextRainbow: 'count_groups_text_rainbow',
  detailTextCloud: 'count_groups_text_cloud',
  detailTextStar: 'count_groups_text_star',
  detailScoreBar: 'count_groups_detail_score_bar',
} as const;

export const CONNECT_SIX_ASSET_KEYS = {
  ...UI_ASSET_KEYS,
  // Banner text image for ConnectSix stage.
  topBannerTextConnect: 'text_connect',
  // Dice image in the center of ConnectSixScene (fallback is generated if missing).
  dice: 'connect_six_dice',
  // Composite group images that already encode the count (assets/vehicles).
  groupMoon7: 'connect_six_group_moon_7',
  groupCloud5: 'connect_six_group_cloud_5',
  groupRainbow4: 'connect_six_group_rainbow_4',
  groupStar7: 'connect_six_group_star_7',
} as const;
