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

  // Stage 1: counting voices
  voice_count_1: { src: `${BASE_PATH}1.mp3` },
  voice_count_2: { src: `${BASE_PATH}2.mp3` },
  voice_count_3: { src: `${BASE_PATH}3.mp3` },
  voice_count_4: { src: `${BASE_PATH}4.mp3` },
  voice_count_5: { src: `${BASE_PATH}5.mp3` },
  voice_count_6: { src: `${BASE_PATH}6.mp3` },
  voice_count_7: { src: `${BASE_PATH}7.mp3` },
  voice_count_8: { src: `${BASE_PATH}8.mp3` },

  // Stage 1: per-object paint instructions + transition into counting
  voice_stage1_paint_watermelon: { src: `${BASE_PATH}watermelon1.mp3` },
  voice_stage1_paint_square_cake: { src: `${BASE_PATH}squareCake1.mp3` },
  voice_stage1_paint_red_envelope: { src: `${BASE_PATH}red1.mp3` },
  voice_stage1_paint_lantern: { src: `${BASE_PATH}lantern1.mp3` },
  voice_stage1_paint_sticky_roll: { src: `${BASE_PATH}stickyRoll1.mp3` },
  voice_stage1_count_again: { src: `${BASE_PATH}count-again.mp3` },
};
