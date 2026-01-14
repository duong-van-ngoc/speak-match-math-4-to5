// src/audio/AudioManager.ts

import { Howl, Howler } from 'howler';

// 1. Định nghĩa Interface cho cấu hình âm thanh
interface SoundConfig {
    src: string;
    loop?: boolean;
    volume?: number;
    html5?: boolean; // thêm dòng này
}

// 2. Đường dẫn gốc tới thư mục audio (tương đối so với index.html trong dist)
// Dùng 'assets/...' thay vì '/assets/...' để khi nhúng game vào sub-folder vẫn load đúng.
const BASE_PATH = 'assets/audio/';

// 3. Ánh xạ ID âm thanh (key) và cấu hình chi tiết
const SOUND_MAP: Record<string, SoundConfig> = {
    // ---- SFX Chung ----
    'sfx_correct': { src: `${BASE_PATH}correct.mp3`, volume: 0.7 },
    'sfx_wrong': { src: `${BASE_PATH}wrong.mp3`, volume: 0.7 },
    'sfx_click': { src: `${BASE_PATH}click.mp3`, volume: 0.7 },
    'voice_rotate': { src: `${BASE_PATH}xoay.mp3`, volume: 0.8 },

    // ---- Correct Answers Voice Prompts ----
    'correct_answer_1': {
        src: `${BASE_PATH}correct_answer_1.mp3`,
        volume: 1.0,
    },
    'correct_answer_2': {
        src: `${BASE_PATH}correct_answer_2.mp3`,
        volume: 1.0,
    },
    'correct_answer_3': {
        src: `${BASE_PATH}correct_answer_3.mp3`,
        volume: 1.0,
    },
    'correct_answer_4': {
        src: `${BASE_PATH}correct_answer_4.mp3`,
        volume: 1.0,
    },

    // ---- Prompt/Voice Prompts (ví dụ) ----
    "bgm_main": {
        src: `${BASE_PATH}bgm_main.mp3`,
        loop: true,
        volume: 0.2, // nhỏ hơn voice đọc
        html5: false,
        },
        
    "complete": { src: `${BASE_PATH}vic_sound.mp3` },
    "voice_intro": { src: `${BASE_PATH}voice_intro.mp3` },
    // ... Thêm các cặp còn lại vào SOUND_MAP ...
    "voice_need_finish": { src: `${BASE_PATH}voice_need_finish.mp3` },

    "voice_complete": { src: `${BASE_PATH}complete.mp3`, volume: 0.5 },
    "fireworks": { src: `${BASE_PATH}fireworks.mp3`, volume: 1.0 },
    "applause": { src: `${BASE_PATH}applause.mp3`, volume: 1.0 },
};

const BGM_ID = "bgm_main";
const PRIORITY_KEYS = [BGM_ID, "voice_intro"];

class AudioManager {
    // Khai báo kiểu dữ liệu cho Map chứa các đối tượng Howl
    private sounds: Record<string, Howl> = {};
    private retryTimers: Record<string, number | undefined> = {};
    private duckCount = 0;
    private readonly bgmBaseVolume = SOUND_MAP[BGM_ID]?.volume ?? 1.0;
    private readonly bgmDuckVolume = Math.max(0, Math.min(1, this.bgmBaseVolume * 0.35));
    private loadStarted = false;
    private loadPromise: Promise<void> | null = null;

    
    constructor() {
        // Cấu hình quan trọng cho iOS
        Howler.autoUnlock = true;
        Howler.volume(1.0);
        (Howler as any).html5PoolSize = 100;
    }

    /**
     * Tải tất cả âm thanh
     * @returns {Promise<void>}
     */
    loadAll(): Promise<void> {
        if (this.loadPromise) return this.loadPromise;
        if (this.loadStarted) return Promise.resolve();
        this.loadStarted = true;

        const keys = Object.keys(SOUND_MAP);
        const total = keys.length;
        if (total === 0) {
            this.loadPromise = Promise.resolve();
            return this.loadPromise;
        }

        this.loadPromise = new Promise((resolve) => {
            let loadedCount = 0;

            const onLoaded = () => {
                loadedCount++;
                if (loadedCount === total) resolve();
            };

            const createHowl = (key: string) => {
                if (this.sounds[key]) return;
                const config = SOUND_MAP[key];
                const isPriority = PRIORITY_KEYS.includes(key);
                this.sounds[key] = new Howl({
                    src: [config.src],
                    loop: config.loop ?? false,
                    volume: config.volume ?? 1.0,
                    html5: config.html5 ?? true,
                    preload: isPriority,
                    onload: onLoaded,
                    onloaderror: (id: number, error: unknown) => {
                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : String(error);

                        console.error(
                            `[Howler Load Error] Key: ${key}, ID: ${id}, Msg: ${errorMessage}. Check file path: ${config.src}`
                        );
                        onLoaded();
                    },
                });
            };

            // Tạo tất cả Howl ngay để có thể play ngay sau 1 lần chạm.
            // Chỉ preload ngay 2 key ưu tiên (bgm_main + voice_intro).
            keys.forEach(createHowl);

            // Chủ động bắt đầu load sớm các âm ưu tiên
            PRIORITY_KEYS.forEach((k) => this.sounds[k]?.load());

            // Nạp dần các âm còn lại sau 1 nhịp để ưu tiên intro/bgm trước
            window.setTimeout(() => {
                keys
                    .filter((k) => !PRIORITY_KEYS.includes(k))
                    .forEach((k) => this.sounds[k]?.load());
            }, 0);
        });

        return this.loadPromise;
    }

    /**
     * Phát một âm thanh
     * @param {string} id - ID âm thanh
     * @returns {number | undefined} - Sound ID của Howler
     */
   // src/AudioManager.ts

play(id: string): number | undefined {
  if (!this.sounds[id]) {
    console.warn(`[AudioManager] Sound ID not found: ${id}`);
    return;
  }

  const isVoice =
    id.startsWith("voice_") || id.startsWith("prompt_") || id.startsWith("correct_answer_");

  if (isVoice) this.duckBgmStart();

  let soundId: number | undefined;
  try {
    soundId = this.sounds[id].play();
  } catch (e) {
    if (isVoice) this.duckBgmEnd();
    throw e;
  }

  if (isVoice) {
    this.sounds[id].once("end", () => this.duckBgmEnd());
    this.sounds[id].once("stop", () => this.duckBgmEnd());
  }

  return soundId;
}

isPlaying(id: string): boolean {
  const sound = this.sounds[id];
  return !!sound && sound.playing();
}

private setBgmVolume(volume: number) {
  const bgm = this.sounds[BGM_ID];
  if (!bgm) return;
  bgm.volume(Math.max(0, Math.min(1, volume)));
}

private duckBgmStart() {
  if (!this.sounds[BGM_ID]) return;
  this.duckCount++;
  if (this.duckCount === 1) this.setBgmVolume(this.bgmDuckVolume);
}

private duckBgmEnd() {
  if (!this.sounds[BGM_ID]) return;
  if (this.duckCount > 0) this.duckCount--;
  if (this.duckCount === 0) this.setBgmVolume(this.bgmBaseVolume);
}

unlock(): void {
  const anyHowler = Howler as any;
  const ctx: AudioContext | undefined = anyHowler.ctx || anyHowler._audioContext || anyHowler.context;
  if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
    try {
      ctx.resume();
    } catch {}
  }
}

cancelRetry(id: string): void {
  const timer = this.retryTimers[id];
  if (timer !== undefined) {
    window.clearTimeout(timer);
    delete this.retryTimers[id];
  }
}

playWithRetry(
  id: string,
  options?: { retries?: number; delayMs?: number }
): void {
  const retries = options?.retries ?? 8;
  const delayMs = options?.delayMs ?? 120;

  this.cancelRetry(id);
  const howl = this.sounds[id];
  if (!howl) {
    console.warn(`[AudioManager] Sound ID not found: ${id}`);
    return;
  }

  let attemptsLeft = retries;
  const tryPlay = () => {
    this.unlock();
    try {
      howl.stop();
    } catch {}
    try {
      howl.play();
    } catch {}
  };

  const scheduleRetry = () => {
    if (attemptsLeft <= 0) return;
    attemptsLeft--;
    this.retryTimers[id] = window.setTimeout(() => {
      tryPlay();
      scheduleRetry();
    }, delayMs);
  };

  howl.once("playerror", () => scheduleRetry());
  tryPlay();
}



    /**
     * Dừng một âm thanh
     * @param {string} id - ID âm thanh
     */
    stop(id: string): void {
        if (!this.sounds[id]) return;
        this.cancelRetry(id);
        if (id.startsWith("voice_") || id.startsWith("prompt_") || id.startsWith("correct_answer_")) {
          this.duckBgmEnd();
        }
        this.sounds[id].stop();
    }

    stopSound(id: string): void {
        if (this.sounds[id]) {
            this.sounds[id].stop();
        }
    }

    stopAll(): void {
        Object.keys(this.retryTimers).forEach((key) => this.cancelRetry(key));
        this.duckCount = 0;
        this.setBgmVolume(this.bgmBaseVolume);
        Howler.stop();
    }

    /**
     * Dừng TẤT CẢ các Prompt và Feedback để tránh chồng chéo giọng nói.
     */
    stopAllVoicePrompts(): void {
        // Cần liệt kê tất cả các ID giọng nói/prompt có thể chạy cùng lúc
        const voiceKeys = Object.keys(SOUND_MAP).filter(
            (key) =>
                key.startsWith('prompt_') || key.startsWith('correct_answer_')
        );

        voiceKeys.forEach((key) => {
            this.stopSound(key);
        });

        // Hoặc bạn có thể dùng: Howler.stop(); để dừng TẤT CẢ âm thanh (thận trọng khi dùng)
    }

    // Hàm tiện ích: Dùng để lấy ngẫu nhiên một trong 4 câu trả lời đúng
    playCorrectAnswer(): void {
        // Phaser.Math.Between(min, max) -> thay thế bằng hàm Math.random thuần túy hoặc import từ Phaser
        const randomIndex = Math.floor(Math.random() * 4) + 1;
        this.play(`correct_answer_${randomIndex}`);
    }

    // Hàm tiện ích: Dùng để phát lời nhắc (ví dụ: 'prompt_more_cat')
    playPrompt(type: 'less' | 'more', animal: string): void {
        const id = `prompt_${type}_${animal}`;
        this.play(id);
    }
}

// Xuất phiên bản duy nhất (Singleton)
export default new AudioManager();
