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

  // Stage 2: praise / feedback for reading
  voice_stage2_correct: { src: `${BASE_PATH}correct.mp3`, cooldownMs: 600 },
  voice_stage2_wrong: { src: `${BASE_PATH}wrong.mp3`, cooldownMs: 600 },

  // Stage 2: per-item tap prompts (main screen)
  // Default variants (fallback)
  // Rule: stage2 uses *_2, detail speaker uses *_3.
  voice_stage2_tap_sun: { src: `${BASE_PATH}sun2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_moon: { src: `${BASE_PATH}moon2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_rainbow: { src: `${BASE_PATH}rainbow2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_cloud: { src: `${BASE_PATH}cloud2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_star: { src: `${BASE_PATH}star2.mp3`, cooldownMs: 1200 },
  // Additional variants (optional)
  voice_stage2_tap_sun_1: { src: `${BASE_PATH}sun1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_sun_2: { src: `${BASE_PATH}sun2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_sun_3: { src: `${BASE_PATH}sun3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_moon_1: { src: `${BASE_PATH}moon1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_moon_2: { src: `${BASE_PATH}moon2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_moon_3: { src: `${BASE_PATH}moon3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_cloud_1: { src: `${BASE_PATH}cloud1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_cloud_2: { src: `${BASE_PATH}cloud2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_cloud_3: { src: `${BASE_PATH}cloud3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_star_1: { src: `${BASE_PATH}star1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_star_2: { src: `${BASE_PATH}star2.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_star_3: { src: `${BASE_PATH}star3.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_rainbow_1: { src: `${BASE_PATH}rainbow1.mp3`, cooldownMs: 1200 },
  voice_stage2_tap_rainbow_2: { src: `${BASE_PATH}rainbow2.mp3`, cooldownMs: 1200 },

  // Stage 2: detail screen instructions (sub screen)
  voice_stage2_detail_enter: { src: `${BASE_PATH}guide4.mp3`, cooldownMs: 1500 },
  voice_stage2_detail_press_mic: { src: `${BASE_PATH}mic.mp3`, cooldownMs: 400 },

  // Stage 2: speaker button voices per item (CountGroupsDetailScene uses `voice_vehicle_${groupId}`)
  voice_vehicle_sun: { src: `${BASE_PATH}sun3.mp3`, cooldownMs: 1500 },
  voice_vehicle_moon: { src: `${BASE_PATH}moon3.mp3`, cooldownMs: 1500 },
  voice_vehicle_star: { src: `${BASE_PATH}star3.mp3`, cooldownMs: 1500 },
  voice_vehicle_rainbow: { src: `${BASE_PATH}rainbow3.mp3`, cooldownMs: 1500 },
  voice_vehicle_cloud: { src: `${BASE_PATH}cloud3.mp3`, cooldownMs: 1500 },
};
