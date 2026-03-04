/**
 * VoiceHandler - Ghi âm giọng nói từ mic thật
 *
 * Sử dụng Web Audio API + MediaRecorder để:
 * 1. Xin quyền mic
 * 2. Ghi âm
 * 3. Tự động dừng khi hết thời gian hoặc im lặng
 * 4. Trả về Blob audio để gửi API
 */

import { GameConstants } from '../consts/GameConstants';

export interface VoiceResult {
    /** Có thành công không */
    success: boolean;
    /** Blob audio đã ghi */
    audioBlob?: Blob;
    /** Lỗi nếu có */
    error?: string;
}

export interface SpeechResult {
    /** Có thành công không */
    success: boolean;
    /** Số mà bé nói (nhận diện được) */
    spokenNumber?: number;
    /** Text gốc từ API */
    rawText?: string;
    /** Lỗi nếu có */
    error?: string;
}

export class VoiceHandler {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private isRecording: boolean = false;
    private silenceTimer: ReturnType<typeof setTimeout> | null = null;
    private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;

    // Callback khi ghi âm kết thúc
    private onRecordingComplete: ((blob: Blob) => void) | null = null;

    /**
     * Xin quyền truy cập microphone
     * @returns true nếu được cấp quyền
     */
    async requestPermission(): Promise<boolean> {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                }
            });
            console.log('[VoiceHandler] Đã được cấp quyền mic');
            return true;
        } catch (err) {
            console.error('[VoiceHandler] Không được cấp quyền mic:', err);
            return false;
        }
    }

    /**
     * Bắt đầu ghi âm
     * @returns Promise trả về Blob audio khi ghi xong
     */
    async startRecording(): Promise<VoiceResult> {
        // Xin quyền nếu chưa có stream
        if (!this.stream) {
            const granted = await this.requestPermission();
            if (!granted) {
                return { success: false, error: 'Không được cấp quyền mic' };
            }
        }

        return new Promise((resolve) => {
            this.audioChunks = [];
            this.isRecording = true;

            try {
                this.mediaRecorder = new MediaRecorder(this.stream!, {
                    mimeType: this.getSupportedMimeType(),
                });
            } catch (err) {
                console.error('[VoiceHandler] Không tạo được MediaRecorder:', err);
                resolve({ success: false, error: 'Không tạo được MediaRecorder' });
                return;
            }

            // Nhận data từ mic
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            // Khi ghi xong
            this.mediaRecorder.onstop = () => {
                this.isRecording = false;
                this.clearTimers();

                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                console.log(`[VoiceHandler] Ghi xong: ${(audioBlob.size / 1024).toFixed(1)}KB`);

                if (this.onRecordingComplete) {
                    this.onRecordingComplete(audioBlob);
                }

                resolve({ success: true, audioBlob });
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('[VoiceHandler] Lỗi ghi âm:', event);
                this.isRecording = false;
                this.clearTimers();
                resolve({ success: false, error: 'Lỗi ghi âm' });
            };

            // Bắt đầu ghi!
            this.mediaRecorder.start(100); // chunk mỗi 100ms
            console.log('[VoiceHandler] Bắt đầu ghi âm...');

            // Tự động dừng sau MAX_DURATION
            const config = GameConstants.VOICE_RECORDING;
            this.maxDurationTimer = setTimeout(() => {
                console.log('[VoiceHandler] Hết thời gian ghi âm');
                this.stopRecording();
            }, config.MAX_DURATION);
        });
    }

    /**
     * Dừng ghi âm
     */
    stopRecording(): void {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.clearTimers();
            console.log('[VoiceHandler] Đã dừng ghi âm');
        }
    }

    /**
     * Gửi audio lên API để nhận diện giọng nói
     * @param audioBlob Blob audio từ mic
     * @param expectedNumber Số đúng (để debug)
     * @returns Kết quả nhận diện
     */
    async sendToAPI(audioBlob: Blob, expectedNumber: number): Promise<SpeechResult> {
        const config = GameConstants.VOICE_RECORDING;

        // --- CHẾ ĐỘ TEST: Giả lập kết quả ---
        if (config.TEST_MODE) {
            console.log(`[VoiceHandler] TEST_MODE: Giả lập trả về số ${expectedNumber}`);
            return {
                success: true,
                spokenNumber: expectedNumber,
                rawText: `${expectedNumber}`,
            };
        }

        // --- CHẾ ĐỘ THẬT: Gửi API ---
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            formData.append('expected', String(expectedNumber));

            console.log(`[VoiceHandler] Gửi audio lên API: ${config.API_URL}`);

            const response = await fetch(config.API_URL, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[VoiceHandler] API trả về:', data);

            // Parse kết quả từ API
            // Tuỳ vào format API trả về, có thể cần điều chỉnh
            const spokenNumber = this.parseSpokenNumber(data);

            return {
                success: true,
                spokenNumber,
                rawText: data.text || data.transcript || JSON.stringify(data),
            };
        } catch (err) {
            console.error('[VoiceHandler] Lỗi gửi API:', err);
            return {
                success: false,
                error: `Lỗi kết nối: ${err}`,
            };
        }
    }

    /**
     * Parse số từ kết quả API
     * Hỗ trợ cả chữ viết (ba, bốn...) và số (3, 4...)
     */
    private parseSpokenNumber(data: any): number | undefined {
        // Lấy text từ nhiều field có thể
        const text = (data.text || data.transcript || data.result || '').toString().trim().toLowerCase();

        if (!text) return undefined;

        // Map chữ → số (tiếng Việt)
        const wordToNumber: Record<string, number> = {
            'một': 1, 'mot': 1, '1': 1,
            'hai': 2, '2': 2,
            'ba': 3, '3': 3,
            'bốn': 4, 'bon': 4, 'bón': 4, '4': 4,
            'năm': 5, 'nam': 5, '5': 5,
        };

        // Thử match trực tiếp
        if (wordToNumber[text] !== undefined) {
            return wordToNumber[text];
        }

        // Thử tìm số trong chuỗi
        for (const [word, num] of Object.entries(wordToNumber)) {
            if (text.includes(word)) {
                return num;
            }
        }

        // Thử parse số trực tiếp
        const parsed = parseInt(text, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
            return parsed;
        }

        return undefined;
    }

    /**
     * Lấy mime type hỗ trợ
     */
    private getSupportedMimeType(): string {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return 'audio/webm'; // fallback
    }

    /**
     * Xoá timers
     */
    private clearTimers(): void {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        if (this.maxDurationTimer) {
            clearTimeout(this.maxDurationTimer);
            this.maxDurationTimer = null;
        }
    }

    /**
     * Giải phóng tài nguyên
     */
    destroy(): void {
        this.stopRecording();
        this.clearTimers();
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    /** Kiểm tra đang ghi âm không */
    get recording(): boolean {
        return this.isRecording;
    }
}
