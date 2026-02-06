import { Howl, Howler } from 'howler';

// 1. Định nghĩa Interface cho cấu hình âm thanh
interface SoundConfig {
    src: string;
    loop?: boolean;
    volume?: number;
}

//Đường dẫn gốc 
const BASE_PATH = 'assets/audio/';

// Ánh xạ ID âm thanh và cấu hình chi tiết
const SOUND_MAP: Record<string, SoundConfig> = {

    // ---- SFX Chung ----
    'sfx-correct': { src: `${BASE_PATH}sfx/correct_answer.mp3`, volume: 1.0 },
    'sfx-correct_s2': { src: `${BASE_PATH}sfx/correct_color.mp3`, volume: 1.0 },
    'sfx-wrong': { src: `${BASE_PATH}sfx/wrong.mp3`, volume: 0.5 },
    'sfx-click': { src: `${BASE_PATH}sfx/click.mp3`, volume: 0.5 },
    'sfx-ting': { src: `${BASE_PATH}sfx/correct.mp3`, volume: 0.6 },

    // ---- Prompt Voice (Game D) ----


    'voice-rotate': { src: `${BASE_PATH}prompt/rotate.mp3`, volume: 1.0 },


    // ---- Line Prompts (trước khi ghi âm mỗi dòng) ----



    // ---- Correct Answer Variations ----
    'complete': { src: `${BASE_PATH}sfx/complete.mp3`, volume: 1.0 },
    'fireworks': { src: `${BASE_PATH}sfx/fireworks.mp3`, volume: 1.0 },
    'applause': { src: `${BASE_PATH}sfx/applause.mp3`, volume: 1.0 },

    // ---- Score Audio (điểm 4-10) ----
    'score-4': { src: `${BASE_PATH}score/score_4.mp3`, volume: 1.0 },
    'score-5': { src: `${BASE_PATH}score/score_5.mp3`, volume: 1.0 },
    'score-6': { src: `${BASE_PATH}score/score_6.mp3`, volume: 1.0 },
    'score-7': { src: `${BASE_PATH}score/score_7.mp3`, volume: 1.0 },
    'score-8': { src: `${BASE_PATH}score/score_8.mp3`, volume: 1.0 },
    'score-9': { src: `${BASE_PATH}score/score_9.mp3`, volume: 1.0 },
    'score-10': { src: `${BASE_PATH}score/score_10.mp3`, volume: 1.0 },

    // ---- Vehicle Scene Audio ----
    'intro-instruction': { src: `${BASE_PATH}prompt/guide_intro.mp3`, volume: 1.0 },
    'mic-instruction': { src: `${BASE_PATH}prompt/guide_mic.mp3`, volume: 1.0 },

};



class AudioManager {
    // Khai báo kiểu dữ liệu cho Map chứa các đối tượng Howl
    private sounds: Record<string, Howl> = {};
    private isLoaded: boolean = false;

    constructor() {
        // Cấu hình quan trọng cho iOS
        Howler.autoUnlock = true;
        Howler.volume(1.0);
    }

    addSound(key: string, config: SoundConfig) {
        SOUND_MAP[key] = config;
    }

    /**
     * Tải tất cả âm thanh
     * @returns {Promise<void>}
     */
    loadAll(): Promise<void> {

        if (this.isLoaded) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const keys = Object.keys(SOUND_MAP);
            let loadedCount = 0;
            const total = keys.length;

            if (total === 0) return resolve();

            keys.forEach((key) => {
                const config = SOUND_MAP[key];

                this.sounds[key] = new Howl({
                    src: [config.src],
                    loop: config.loop || false,
                    volume: config.volume || 1.0,
                    html5: false, // Sử dụng Web Audio API để phát tức thì, không độ trễ (latency-free)

                    onload: () => {
                        loadedCount++;
                        if (loadedCount === total) {
                            this.isLoaded = true;
                            resolve();
                        }
                    },
                    onloaderror: (id: number, error: unknown) => {
                        // Chúng ta vẫn có thể chuyển nó sang string để ghi log nếu muốn
                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : String(error);

                        console.error(
                            `[Howler Load Error] Key: ${key}, ID: ${id}, Msg: ${errorMessage}. Check file path: ${config.src}`
                        );

                        loadedCount++;
                        if (loadedCount === total) {
                            this.isLoaded = true;
                            resolve();
                        }
                    },
                });
            });
        });
    }

    /**
     * Phát một âm thanh
     * @param {string} id - ID âm thanh
     * @returns {number | undefined} - Sound ID của Howler
     */
    play(id: string): number | undefined {
        if (!this.isLoaded || !this.sounds[id]) {
            console.warn(
                `[AudioManager] Sound ID not found or not loaded: ${id}`
            );
            return;
        }
        return this.sounds[id].play();
    }

    /**
     * Dừng một âm thanh
     * @param {string} id - ID âm thanh
     */
    stop(id: string): void {
        if (!this.isLoaded || !this.sounds[id]) return;
        this.sounds[id].stop();
    }

    stopSound(id: string): void {
        if (this.sounds[id]) {
            this.sounds[id].stop();
        }
    }

    stopAll(): void {
        Howler.stop();
    }

    /**
     * Pause tất cả audio đang phát (dùng khi chuyển tab)
     */
    pauseAll(): void {
        Object.values(this.sounds).forEach(sound => {
            if (sound.playing()) {
                sound.pause();
            }
        });
    }

    /**
     * Resume tất cả audio đã bị pause (dùng khi quay lại tab)
     */
    resumeAll(): void {
        Object.values(this.sounds).forEach(sound => {
            // Howler tracks pause state internally
            // Calling play() on a paused sound will resume it
            if (sound.state() === 'loaded') {
                // Check if sound was paused (seek > 0 means it was playing)
                const seek = sound.seek();
                if (typeof seek === 'number' && seek > 0) {
                    sound.play();
                }
            }
        });
    }

    // Dừng TẤT CẢ các Prompt và Feedback 

    stopAllVoicePrompts(): void {
        const voiceKeys = Object.keys(SOUND_MAP).filter(
            (key) =>
                key.startsWith('prompt_') || key.startsWith('correct_answer_')
        );

        voiceKeys.forEach((key) => {
            this.stopSound(key);
        });

        // Hoặc dùng: Howler.stop(); để dừng TẤT CẢ âm thanh (thận trọng khi dùng)
    }

    // Kiểm tra nếu audio đã được unlock
    get isUnlocked(): boolean {
        return Howler.ctx && Howler.ctx.state === 'running';
    }

    /**
     * Đảm bảo AudioContext đang running
     * Cần gọi sau user gesture để resume context nếu bị suspended
     */
    async ensureContextRunning(): Promise<void> {
        if (!Howler.ctx) return;

        if (Howler.ctx.state === 'suspended') {
            console.log('[AudioManager] Resuming suspended AudioContext...');
            try {
                await Howler.ctx.resume();
                console.log('[AudioManager] AudioContext resumed successfully');
            } catch (e) {
                console.error('[AudioManager] Failed to resume AudioContext:', e);
            }
        }
    }

    unlockAudio(): void {
        if (!Howler.usingWebAudio) return;

        // Resume context nếu bị suspended
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume();
        }

        // Tạo một âm thanh dummy và play/stop ngay lập tức
        const dummySound = new Howl({
            src: ['data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA=='], // 1-frame silent WAV
            volume: 0,
        });
        dummySound.once('play', () => {
            dummySound.stop();
            console.log('[Howler] Audio context unlocked manually.');
        });

        // Chỉ play nếu context đang ở trạng thái suspended/locked
        if (Howler.ctx && Howler.ctx.state !== 'running') {
            dummySound.play();
        }
    }

    /**
     * Unlock audio và đợi cho đến khi AudioContext thực sự running
     * Dùng cho iOS/Safari để đảm bảo audio sẵn sàng trước khi phát
     */
    async unlockAudioAsync(): Promise<void> {
        if (!Howler.usingWebAudio) return;

        // Resume context nếu bị suspended
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            console.log('[AudioManager] unlockAudioAsync: Resuming suspended context...');
            try {
                await Howler.ctx.resume();
            } catch (e) {
                console.warn('[AudioManager] unlockAudioAsync: Resume failed', e);
            }
        }

        // Tạo và phát một silent sound để đảm bảo audio system hoạt động
        return new Promise((resolve) => {
            const dummySound = new Howl({
                src: ['data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA=='],
                volume: 0,
                html5: false, // Web Audio API
                onplay: () => {
                    dummySound.stop();
                    console.log('[AudioManager] unlockAudioAsync: Audio unlocked successfully');
                    // Thêm delay nhỏ để đảm bảo audio system ổn định
                    setTimeout(resolve, 50);
                },
                onloaderror: () => {
                    console.warn('[AudioManager] unlockAudioAsync: Dummy sound load error');
                    resolve();
                },
                onplayerror: () => {
                    console.warn('[AudioManager] unlockAudioAsync: Dummy sound play error');
                    resolve();
                }
            });
            dummySound.play();

            // Timeout fallback nếu audio không phát được
            setTimeout(() => {
                console.warn('[AudioManager] unlockAudioAsync: Timeout, resolving anyway');
                resolve();
            }, 500);
        });
    }

    /**
     * Safari Audio Fix: Restore audio volume after microphone usage
     * Safari reduces audio volume when microphone is active (ducking behavior).
     * Call this method after stopping recording to restore normal audio volume.
     */
    restoreAudioAfterRecording(): void {
        try {
            // 1. Resume AudioContext nếu bị suspended
            if (Howler.ctx && Howler.ctx.state === 'suspended') {
                console.log('[AudioManager] Safari fix: Resuming AudioContext...');
                Howler.ctx.resume();
            }

            // 2. Reset global volume để force Safari refresh audio routing
            const currentVolume = Howler.volume();
            Howler.volume(0);

            // Small delay before restoring volume
            setTimeout(() => {
                Howler.volume(currentVolume || 1.0);
                console.log('[AudioManager] Safari fix: Volume restored to', currentVolume || 1.0);
            }, 50);

            // 3. Play silent sound to "wake up" Safari audio
            const silentSound = new Howl({
                src: ['data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA=='],
                volume: 0.001, // Nearly silent
                html5: true,
            });
            silentSound.once('end', () => {
                silentSound.unload();
            });
            silentSound.play();

        } catch (e) {
            console.warn('[AudioManager] Safari fix error:', e);
        }
    }

    public getDuration(key: string): number {
        const sound = this.sounds[key];

        if (sound) {
            // Howler trả về duration (giây). 
            // Cần đảm bảo file đã load xong (state 'loaded'), nếu không nó trả về 0.
            return sound.duration();
        }

        console.warn(`[AudioManager] Không tìm thấy duration cho key: "${key}"`);
        return 0; // Trả về 0 để an toàn
    }

    /**
     * Gọi callback khi sound kết thúc (chỉ 1 lần).
     * Dùng để đợi sound kết thúc trước khi thực hiện hành động tiếp theo.
     */
    onceEnd(key: string, cb: () => void): void {
        const sound = this.sounds[key];
        if (!sound) return;
        sound.once('end', cb);
    }
}

// Xuất phiên bản duy nhất (Singleton)
export default new AudioManager();