export type AudioAssetConfig = {
  src: string;
  loop?: boolean;
  volume?: number;
  html5?: boolean;
  cooldownMs?: number;
};

const BASE_PATH = 'assets/audio/';

export const AUDIO_ASSETS: Record<string, AudioAssetConfig> = {
  sfx_correct: { src: `${BASE_PATH}correct.mp3`, volume: 0.7 },
  sfx_wrong: { src: `${BASE_PATH}wrong.mp3`, volume: 0.7 },
  sfx_click: { src: `${BASE_PATH}click.mp3`, volume: 0.7, cooldownMs: 200 },
  voice_rotate: { src: `${BASE_PATH}xoay.mp3`, volume: 0.8 },
  voice_wrong: { src: `${BASE_PATH}voice-wrong.mp3`, volume: 1.0, cooldownMs: 600 },

  correct_answer_1: { src: `${BASE_PATH}correct_answer_1.mp3`, volume: 1.0 },
  correct_answer_2: { src: `${BASE_PATH}correct_answer_2.mp3`, volume: 1.0 },
  correct_answer_3: { src: `${BASE_PATH}correct_answer_3.mp3`, volume: 1.0 },
  correct_answer_4: { src: `${BASE_PATH}correct_answer_4.mp3`, volume: 1.0 },

  bgm_main: { src: `${BASE_PATH}bgm_main.mp3`, loop: true, volume: 0.1, html5: false },

  complete: { src: `${BASE_PATH}vic_sound.mp3`, cooldownMs: 1500 },
  voice_need_finish: { src: `${BASE_PATH}voice_need_finish.mp3` },
  voice_end: { src: `${BASE_PATH}voice_end.mp3` },
  finish: { src: `${BASE_PATH}finish.mp3` },

  voice_complete: { src: `${BASE_PATH}complete.mp3`, volume: 0.5, cooldownMs: 1500 },
  fireworks: { src: `${BASE_PATH}fireworks.mp3`, volume: 1.0 },
  applause: { src: `${BASE_PATH}applause.mp3`, volume: 1.0 },

  // ===== Stage-specific voices (add/replace files as needed) =====
  voice_stage2_guide: { src: `${BASE_PATH}guide2.mp3` },
  voice_stage3_guide: { src: `${BASE_PATH}guide3.mp3` },

  // Stage 1: counting voices
  voice_count_1: { src: `${BASE_PATH}1.mp3` },
  voice_count_2: { src: `${BASE_PATH}2.mp3` },
  voice_count_3: { src: `${BASE_PATH}3.mp3` },
  voice_count_4: { src: `${BASE_PATH}4.mp3` },
  voice_count_5: { src: `${BASE_PATH}5.mp3` },
  voice_count_6: { src: `${BASE_PATH}6.mp3` },

  // Stage 1: per-object paint instructions + transition into counting
  voice_stage1_paint_car: { src: `${BASE_PATH}car1.mp3` },
  voice_stage1_paint_bicycle: { src: `${BASE_PATH}bicycle1.mp3` },
  voice_stage1_paint_airplane: { src: `${BASE_PATH}heli1.mp3` },
  voice_stage1_paint_boat: { src: `${BASE_PATH}boat1.mp3` },
  voice_stage1_paint_scooter: { src: `${BASE_PATH}scooter1.mp3` },
  voice_stage1_count_again: { src: `${BASE_PATH}count-again.mp3` },

  // Stage 2: praise / feedback for reading
  voice_stage2_correct: { src: `${BASE_PATH}correct.mp3`, cooldownMs: 600 },
  voice_stage2_wrong: { src: `${BASE_PATH}wrong.mp3`, cooldownMs: 600 },

  // Stage 2: per-item tap prompts (main screen)
  // Default variants (fallback)
  // Rule: stage1 uses *_1, stage2 uses *_2, detail speaker uses *_3.
  voice_stage2_tap_cars: { src: `${BASE_PATH}car2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_bikes: { src: `${BASE_PATH}bicycle2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_helis: { src: `${BASE_PATH}heli2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_boats: { src: `${BASE_PATH}boat2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_scooters: { src: `${BASE_PATH}scooter2.mp3`, cooldownMs: 1200 },
  // Additional variants (optional)
  voice_stage2_tap_cars_1: { src: `${BASE_PATH}car1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_cars_2: { src: `${BASE_PATH}car2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_cars_3: { src: `${BASE_PATH}car3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_bikes_1: { src: `${BASE_PATH}bicycle1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_bikes_2: { src: `${BASE_PATH}bicycle2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_bikes_3: { src: `${BASE_PATH}bicycle3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_boats_1: { src: `${BASE_PATH}boat1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_boats_2: { src: `${BASE_PATH}boat2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_boats_3: { src: `${BASE_PATH}boat3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_scooters_1: { src: `${BASE_PATH}scooter1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_scooters_2: { src: `${BASE_PATH}scooter2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_scooters_3: { src: `${BASE_PATH}scooter3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_helis_1: { src: `${BASE_PATH}heli1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_helis_2: { src: `${BASE_PATH}heli2.mp3`, cooldownMs: 1200 },

  // Stage 2: detail screen instructions (sub screen)
  voice_stage2_detail_enter: { src: `${BASE_PATH}guide4.mp3`, cooldownMs: 1500 },
  voice_stage2_detail_press_mic: { src: `${BASE_PATH}mic.mp3`, cooldownMs: 400 },

  // Stage 2: speaker button voices per item (CountGroupsDetailScene uses `voice_vehicle_${groupId}`)
  voice_vehicle_cars: { src: `${BASE_PATH}car3.mp3`, cooldownMs: 1500 },
  voice_vehicle_bikes: { src: `${BASE_PATH}bicycle3.mp3`, cooldownMs: 1500 },
  voice_vehicle_scooters: { src: `${BASE_PATH}scooter3.mp3`, cooldownMs: 1500 },
  voice_vehicle_helis: { src: `${BASE_PATH}heli3.mp3`, cooldownMs: 1500 },
  voice_vehicle_boats: { src: `${BASE_PATH}boat3.mp3`, cooldownMs: 1500 },
};
