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
  vehWatermelon: 'veh_watermelon',
  vehSquareCake: 'veh_square_cake',
  vehRedPacket: 'veh_red_packet',
  vehLantern: 'veh_lantern',
  vehStickyRoll: 'veh_sticky_roll',
  handHint: 'hand_hint',
  micIcon: 'icon_mic',
  speakerIcon: 'icon_speaker',
  // CountGroupsDetailScene label images + score scale
  detailTextWatermelon: 'count_groups_text_watermelon',
  detailTextSquareCake: 'count_groups_text_square_cake',
  detailTextRedPacket: 'count_groups_text_red_packet',
  detailTextLantern: 'count_groups_text_lantern',
  detailTextStickyRoll: 'count_groups_text_sticky_roll',
  detailScoreBar: 'count_groups_detail_score_bar',
} as const;

export const CONNECT_SIX_ASSET_KEYS = {
  ...UI_ASSET_KEYS,
  // Banner text image for ConnectSix stage.
  topBannerTextConnect: 'text_connect',
  // Dice image in the center of ConnectSixScene (fallback is generated if missing).
  dice: 'connect_six_dice',
  // Composite group images that already encode the count (assets/vehicles).
  groupStickyRoll6: 'connect_six_group_sticky_roll_6',
  groupLantern6: 'connect_six_group_lantern_6',
  groupSquareCake5: 'connect_six_group_square_cake_5',
  groupRedPacket4: 'connect_six_group_red_packet_4',
} as const;
