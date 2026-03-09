import { Howl, Howler } from 'howler';

// 1. Định nghĩa Interface cho cấu hình âm thanh
interface SoundConfig {
    src: string;
    loop?: boolean;
    volume?: number;
}

// Đường dẫn gốc
const BASE_PATH = 'assets/audio/';

// Ánh xạ ID âm thanh và cấu hình chi tiết
const SOUND_MAP: Record<string, SoundConfig> = {

    // ---- SFX Chung ----
    'sfx-correct': { src: `${BASE_PATH}sfx/correct_answer.mp3`, volume: 1.0 },
    'sfx-correct_s2': { src: `${BASE_PATH}sfx/correct_color.mp3`, volume: 1.0 },
    'sfx-wrong': { src: `${BASE_PATH}sfx/wrong.mp3`, volume: 0.5 },
    'sfx-click': { src: `${BASE_PATH}sfx/click.mp3`, volume: 0.5 },
    'sfx-ting': { src: `${BASE_PATH}sfx/correct.mp3`, volume: 0.6 },

    // ---- Giọng hướng dẫn (Prompt Voice) ----
    'intro-speak': { src: `${BASE_PATH}prompt/intro-speak.mp3`, volume: 1.0 },
    'voice-dem-toa-tau': { src: `${BASE_PATH}prompt/con_hay_dem_so_toa_tau_trong_buc_tranh_cung_co_426daf0c-e8ca-416e-b0dd-742ec22fa969.mp3`, volume: 1.0 },
    'voice-toa-thu-nhat': { src: `${BASE_PATH}prompt/1_toa_tau.mp3`, volume: 1.0 },
    'voice-nhan-mic': { src: `${BASE_PATH}prompt/bay_gio_be_hay_nhan_vao_mic_de_doc_lai_nhe_23085126-98aa-4885-a80e-19013fb32617.mp3`, volume: 1.0 },

    // ---- Voice đếm toa tàu theo level ----
    'voice-count-1': { src: `${BASE_PATH}prompt/1_toa_tau.mp3`, volume: 1.0 },
    'voice-count-2': { src: `${BASE_PATH}prompt/1_2_toa_tau.mp3`, volume: 1.0 },
    'voice-count-3': { src: `${BASE_PATH}prompt/1_2_3_toa_tau.mp3`, volume: 1.0 },
    'voice-count-4': { src: `${BASE_PATH}prompt/1_2_3_4_toa_tau.mp3`, volume: 1.0 },
    'voice-count-5': { src: `${BASE_PATH}prompt/1_2_3_4_5_toa_tau.mp3`, volume: 1.0 },
    'intro-voice': { src: `${BASE_PATH}prompt/intro-speak.mp3`, volume: 1.0 },
    // 'voice-speaking': { src: `${BASE_PATH}prompt/Speak.mp3`, volume: 1.0 },


    // ---- Hướng dẫn từng dòng (Line Prompts) ----
    // Các file này chưa được cung cấp đủ nên comment ra để tránh tải lỗi
    // 'begin-line2': { src: `${BASE_PATH}prompt/begin_line2.mp3`, volume: 1.0 },
    // 'begin-line3': { src: `${BASE_PATH}prompt/begin_line3.mp3`, volume: 1.0 },
    // 'begin-line4': { src: `${BASE_PATH}prompt/begin_line4.mp3`, volume: 1.0 },
    // 'begin-line5': { src: `${BASE_PATH}prompt/begin_line5.mp3`, volume: 1.0 },
    // 'begin-line6': { src: `${BASE_PATH}prompt/begin_line6.mp3`, volume: 1.0 },
    // 'wait-grading': { src: `${BASE_PATH}prompt/wait_grading.mp3`, volume: 1.0 },
    // 'voice-rotate': { src: `${BASE_PATH}prompt/rotate.mp3`, volume: 1.0 },

    // ---- Âm thanh hoàn thành ----
    'complete': { src: `${BASE_PATH}sfx/complete.mp3`, volume: 1.0 },
    'fireworks': { src: `${BASE_PATH}sfx/fireworks.mp3`, volume: 1.0 },
    'applause': { src: `${BASE_PATH}sfx/applause.mp3`, volume: 1.0 },

    // ---- Âm thanh điểm số (4-10) ----
    // Cũng comment ra nếu chưa dùng đến ngay
    // 'score-4': { src: `${BASE_PATH}score/score_4.mp3`, volume: 1.0 },
    // 'score-5': { src: `${BASE_PATH}score/score_5.mp3`, volume: 1.0 },
    // 'score-6': { src: `${BASE_PATH}score/score_6.mp3`, volume: 1.0 },
    // 'score-7': { src: `${BASE_PATH}score/score_7.mp3`, volume: 1.0 },
    // 'score-8': { src: `${BASE_PATH}score/score_8.mp3`, volume: 1.0 },
    // 'score-9': { src: `${BASE_PATH}score/score_9.mp3`, volume: 1.0 },
    // 'score-10': { src: `${BASE_PATH}score/score_10.mp3`, volume: 1.0 },
};


class AudioManager {
    // Khai báo kiểu dữ liệu cho Map chứa các đối tượng Howl
    private sounds: Record<string, Howl> = {};
    private isLoaded: boolean = false;

    // ----- QUẢN LÝ KÊNH GIỌNG NÓI (VOICE CHANNEL) -----
    private activeVoiceKey: string | null = null;
    private activeVoiceId: number | null = null;

    constructor() {
        // Cấu hình quan trọng cho iOS
        Howler.autoUnlock = true;
        Howler.volume(1.0);
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
                    html5: false, // Sử dụng Web Audio API để tránh lỗi HTML5 Audio pool

                    onload: () => {
                        loadedCount++;
                        if (loadedCount === total) {
                            this.isLoaded = true;
                            resolve();
                        }
                    },
                    onloaderror: (id: number, error: unknown) => {
                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : String(error);

                        console.error(
                            `[Howler Lỗi Load] Key: ${key}, ID: ${id}, Msg: ${errorMessage}. Kiểm tra đường dẫn: ${config.src}`
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
            // Loại trừ 'voice-rotate' khỏi cảnh báo vì template hiện tại đang không tích hợp sẵn file này
            if (id !== 'voice-rotate') {
                console.warn(
                    `[AudioManager] Không tìm thấy hoặc chưa load: ${id}`
                );
            }
            return;
        }
        return this.sounds[id].play();
    }

    /**
     * Phát âm thanh ĐỘC QUYỀN (chỉ 1 voice tại 1 thời điểm).
     * Dùng cho hướng dẫn giọng nói để tránh bị chồng chéo.
     * @param {string} id - ID âm thanh
     * @param {Function} onEnd - Callback khi phát xong
     */
    playWithCallback(id: string, onEnd: () => void): void {
        // Nếu có 1 voice đang xếp hàng phát -> Tắt cuộc hội thoại đó đi định tuyến lại
        this.stopCurrentVoice();

        if (!this.isLoaded || !this.sounds[id]) {
            console.warn(`[AudioManager] Không tìm thấy: ${id}`);
            onEnd(); // Vẫn gọi callback để flow game không bị kẹt chết
            return;
        }

        const soundId = this.sounds[id].play();

        // Cập nhật thẻ Voice hiện tại
        this.activeVoiceKey = id;
        this.activeVoiceId = soundId as number;

        if (soundId !== undefined) {
            // Lắng nghe sự kiện end để dọn dẹp biến theo dõi
            this.sounds[id].once('end', () => {
                if (this.activeVoiceId === soundId) {
                    this.clearActiveVoice();
                    onEnd(); // Chỉ trigger callback nếu voice này KHÔNG bị ngắt ngang
                }
            }, soundId);
        } else {
            this.clearActiveVoice();
            onEnd();
        }
    }

    /**
     * Dừng ngay giọng nói đang phát
     */
    stopCurrentVoice(): void {
        if (this.activeVoiceKey && this.activeVoiceId !== null) {
            const currentHowl = this.sounds[this.activeVoiceKey];

            // Xóa bộ lắng nghe sự kiện 'end' cũ để nó không kích hoạt callback của luồng cũ
            currentHowl.off('end', undefined, this.activeVoiceId);
            currentHowl.stop(this.activeVoiceId);

            this.clearActiveVoice();
        }
    }

    private clearActiveVoice(): void {
        this.activeVoiceKey = null;
        this.activeVoiceId = null;
    }

    /**
     * Trả về true nếu đang có hướng dẫn giọng nói phát ra loa
     */
    isVoicePlaying(): boolean {
        if (this.activeVoiceKey && this.activeVoiceId !== null) {
            return this.sounds[this.activeVoiceKey].playing(this.activeVoiceId);
        }
        return false;
    }

    /**
     * Dừng một âm thanh
     * @param {string} id - ID âm thanh
     */
    stop(id: string): void {
        if (!this.isLoaded || !this.sounds[id]) return;
        this.sounds[id].stop();
    }

    /** Dừng một âm thanh cụ thể */
    stopSound(id: string): void {
        if (this.sounds[id]) {
            this.sounds[id].stop();
        }
    }

    /** Dừng TẤT CẢ âm thanh */
    stopAll(): void {
        Howler.stop();
    }

    /** Dừng tất cả Prompt và Feedback */
    stopAllVoicePrompts(): void {
        const voiceKeys = Object.keys(SOUND_MAP).filter(
            (key) =>
                key.startsWith('prompt_') || key.startsWith('correct_answer_')
        );

        voiceKeys.forEach((key) => {
            this.stopSound(key);
        });
    }

    /** Kiểm tra audio đã được unlock chưa */
    get isUnlocked(): boolean {
        return Howler.ctx && Howler.ctx.state === 'running';
    }

    /** Mở khóa audio context (cần cho iOS/mobile) */
    unlockAudio(): void {
        if (!Howler.usingWebAudio) return;

        // Tạo âm thanh dummy và play/stop ngay lập tức
        const dummySound = new Howl({
            src: ['data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA=='],
            volume: 0,
            html5: true
        });
        dummySound.once('play', () => {
            dummySound.stop();
            console.log('[Howler] Audio context đã được mở khóa.');
        });

        // Chỉ play nếu context đang ở trạng thái suspended/locked
        if (Howler.ctx && Howler.ctx.state !== 'running') {
            dummySound.play();
        }
    }

    /**
     * Lấy thời lượng của một âm thanh (giây)
     * @param {string} key - ID âm thanh
     */
    public getDuration(key: string): number {
        const sound = this.sounds[key];

        if (sound) {
            return sound.duration();
        }

        console.warn(`[AudioManager] Không tìm thấy duration cho key: "${key}"`);
        return 0;
    }
}

// Xuất phiên bản duy nhất (Singleton)
export default new AudioManager();
