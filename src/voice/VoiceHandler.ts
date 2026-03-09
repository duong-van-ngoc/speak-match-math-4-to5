/**
 * VoiceHandler - Xử lý ghi âm giọng nói cho trẻ em
 * 
 * Tính năng:
 * - Toggle start/stop bằng nút mic
 * - Timeout tự động dừng (configurable)
 * - Phát hiện im lặng -> tự động dừng
 * - Lọc tạp âm: 5s đầu phân tích baseline, chỉ ghi âm thanh trên ngưỡng
 * - Export WAV và gửi về BE (hiện tại save local để test)
 */

import { GameConstants } from '../consts/GameConstants';

export interface VoiceEvalResponse {
    status: 'perfect' | 'good' | 'almost' | 'retry';
    score: number;
    transcript: string;
    matched_keyword?: string;
    latency_seconds: number;
}

export interface RecordingCompleteResult {
    audioBlob: Blob;
    durationMs: number;
}

export type RecordingState = 'idle' | 'starting' | 'calibrating' | 'recording' | 'processing';

// ===== TEST MODE CONFIG =====
// Đường dẫn hardcode cho file test audio (sử dụng khi TEST_MODE=true)
const TEST_AUDIO_PATH = 'assets/test_mode/NoiNgong.wav';

export class VoiceHandler {
    // ========================================================================
    // REGION: PROPERTIES
    // ========================================================================
    private mediaRecorder: MediaRecorder | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private mediaStream: MediaStream | null = null;

    // Các bộ lọc âm thanh để giảm thiểu tiếng ồn
    private audioFilterNodes: BiquadFilterNode[] = [];
    private highpassFilter: BiquadFilterNode | null = null;
    private lowpassFilter: BiquadFilterNode | null = null;
    private notchFilter: BiquadFilterNode | null = null;

    private audioChunks: Blob[] = [];
    private state: RecordingState = 'idle';
    private timeDomainBuffer?: Uint8Array;
    private recordingStartedAtMs: number | null = null;
    private recordingFinishedAtMs: number | null = null;

    // ===== ADAPTIVE VAD (Voice Activity Detection) =====
    // Sử dụng Exponential Moving Average thay vì baseline cố định
    private adaptiveBaseline: number = 0; // EMA của noise floor
    private calibrationSamples: number[] = [];
    private calibrationTimeout: number | null = null;

    // VAD Config - Cân bằng (Dễ kích hoạt hơn, duy trì tốt hơn)
    private static readonly VAD_CONFIG = {
        EMA_ALPHA: 0.05,            // Hệ số làm mượt baseline
        SPEECH_THRESHOLD: 1.15,     // Trigger: Volume gấp 1.15 lần baseline (Dễ kích hoạt hơn)
        SUSTAIN_FACTOR: 0.5,        // Sustain: Chỉ cần volume >= 50% ngưỡng trigger là giữ được (Duy trì tốt)
        BASELINE_UPDATE_DOWN: 0.03, // Cập nhật baseline xuống CHẬM
        BASELINE_UPDATE_UP: 0.001,  // Cập nhật baseline lên CỰC CHẬM
        MIN_BASELINE: 18,           // Baseline tối thiểu (Giảm chút để nhạy hơn)
        MAX_BASELINE: 50,           // Baseline tối đa
        HOLD_DELAY: 1500,           // Hangover: 1.5s (Giữ lâu hơn khi ngắt quãng)
        DEBUG_LOG: true,            // Bật log để debug

        // ===== SPEECH RANGE FILTER =====
        RANGE_FILTER_ENABLED: true,     // Bật/tắt lọc theo khoảng
        SPEECH_AVG_ALPHA: 0.1,          // Tốc độ cập nhật trung bình (chậm lại chút cho ổn định)
        SPEECH_RANGE_TOLERANCE: 50,     // Khoảng cho phép: avg ± 50 (Mở RỘNG để tránh lọc nhầm)
        MIN_SAMPLES_FOR_RANGE: 10,      // Số sample tối thiểu (Giảm xuống để thích ứng nhanh)
        SPEECH_MIN_VOLUME: 35,          // Chỉ tính sample có vol > 35 (Hỗ trợ giọng nói nhỏ)
    };

    // Phát hiện khoảng lặng
    private lastSoundTime: number = 0;
    private silenceCheckInterval: number | null = null;
    private consecutiveSilentFrames: number = 0;
    private isSpeechActive: boolean = false;
    private speechHoldTimer: number = 0;

    // Speech range tracking - Tính trung bình âm lượng giọng nói
    private speechVolumeAvg: number = 0;      // Trung bình âm lượng giọng nói
    private speechSampleCount: number = 0;    // Số sample giọng nói đã thu

    // Hết giờ
    private recordingTimeout: number | null = null;

    // Các hàm gọi lại
    private onStateChange?: (state: RecordingState) => void;
    private onVolumeChange?: (volume: number, isAboveThreshold: boolean) => void;
    private onComplete?: (result: RecordingCompleteResult) => void;
    private onError?: (error: string) => void;

    constructor(callbacks?: {
        onStateChange?: (state: RecordingState) => void;
        onVolumeChange?: (volume: number, isAboveThreshold: boolean) => void;
        onComplete?: (result: RecordingCompleteResult) => void;
        onError?: (error: string) => void;
    }) {
        this.onStateChange = callbacks?.onStateChange;
        this.onVolumeChange = callbacks?.onVolumeChange;
        this.onComplete = callbacks?.onComplete;
        this.onError = callbacks?.onError;
    }

    // ========================================================================
    // KHU VỰC: GETTERS VÀ PUBLIC API
    // ========================================================================

    get currentState(): RecordingState {
        return this.state;
    }

    get isRecording(): boolean {
        return this.state === 'recording' || this.state === 'calibrating';
    }

    /**
     * Toggle ghi âm: nhấn lần 1 bắt đầu, nhấn lần 2 dừng
     * Trong TEST_MODE: Skip ghi âm, load file test và gọi API ngay
     */
    async toggle(): Promise<void> {
        const CFG = GameConstants.VOICE_RECORDING;

        // ===== TEST MODE: Skip recording, load test file and call API directly =====
        if (CFG.TEST_MODE && this.state === 'idle') {
            await this.handleTestMode();
            return;
        }

        // ===== NORMAL MODE: Recording flow =====
        if (this.state === 'idle') {
            await this.start();
        } else if (['starting', 'recording', 'calibrating'].includes(this.state)) {
            this.stop();
        }
    }

    /**
     * Bắt đầu ghi âm
     */
    async start(): Promise<void> {
        if (this.state !== 'idle') return;

        this.setState('starting');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.onError?.('Microphone API is not supported in this browser environment.');
            this.cleanup();
            return;
        }

        try {
            // Yêu cầu quyền truy cập microphone
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Thiết lập audio context để phân tích âm lượng
            this.setupAudioContext();

            // Thiết lập MediaRecorder
            const mimeType = MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/mp4';

            this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording().catch(err => {
                    console.error('Failed to process recording:', err);
                    this.onError?.('Lỗi xử lý ghi âm');
                });
            };

            // Bắt đầu thu âm
            this.mediaRecorder.start(100); // Thu thập dữ liệu mỗi 100ms
            this.recordingStartedAtMs = performance.now();
            this.recordingFinishedAtMs = null;
            this.lastSoundTime = Date.now();

            // Phase 1: Calibration (5s đầu phân tích baseline)
            this.setState('calibrating');
            this.calibrationSamples = [];
            this.startCalibration();

        } catch (err) {
            console.error('VoiceHandler: Failed to start recording', err);
            this.onError?.('Không thể truy cập microphone');
            this.cleanup();
        }
    }

    /**
     * Dừng ghi âm
     */
    stop(): void {
        if (this.state === 'idle' || this.state === 'processing') return;

        this.clearTimers();

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.recordingFinishedAtMs = performance.now();
            this.mediaRecorder.stop();
        }

        this.setState('processing');
    }

    /**
     * Dọn dẹp và hủy (dispose)
     */
    destroy(): void {
        this.cleanup();
    }

    // ========================================================================
    // KHU VỰC: PRIVATE - THIẾT LẬP VÀ HÀM HỖ TRỢ
    // ========================================================================

    private setupAudioContext(): void {
        if (!this.mediaStream) return;

        this.audioContext = new AudioContext({ sampleRate: 16000 });
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);

        // ===== AUDIO FILTERS CHAIN =====
        // 1. Highpass Filter (80Hz) - Loại bỏ tiếng gió, tiếng ù tần số thấp
        this.highpassFilter = this.audioContext.createBiquadFilter();
        this.highpassFilter.type = 'highpass';
        this.highpassFilter.frequency.value = 80;
        this.highpassFilter.Q.value = 0.7; // Butterworth response

        // 2. Lowpass Filter (4000Hz) - Loại bỏ nhiễu tần số cao, giữ lại giọng nói
        this.lowpassFilter = this.audioContext.createBiquadFilter();
        this.lowpassFilter.type = 'lowpass';
        this.lowpassFilter.frequency.value = 4000;
        this.lowpassFilter.Q.value = 0.7;

        // 3. Notch Filter (50Hz) - Loại bỏ tiếng ù điện (quạt, đèn huỳnh quang)
        this.notchFilter = this.audioContext.createBiquadFilter();
        this.notchFilter.type = 'notch';
        this.notchFilter.frequency.value = 50; // 50Hz (điện lưới VN)
        this.notchFilter.Q.value = 10; // Narrow notch

        // Kết nối chuỗi bộ lọc: source -> highpass -> notch -> lowpass -> analyser
        source.connect(this.highpassFilter);
        this.highpassFilter.connect(this.notchFilter);
        this.notchFilter.connect(this.lowpassFilter);

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.lowpassFilter.connect(this.analyser);

        this.audioFilterNodes = [this.highpassFilter, this.notchFilter, this.lowpassFilter];
        this.timeDomainBuffer = new Uint8Array(this.analyser.frequencyBinCount);
        // ===== END AUDIO FILTERS =====
    }

    /**
     * TEST MODE: Load file audio từ assets/test_mode/ và gọi API ngay
     * Không cần ghi âm thực tế - dùng để test API integration
     */
    private async handleTestMode(): Promise<void> {
        console.log('VoiceHandler [TEST_MODE]: Starting test mode...');
        console.log(`VoiceHandler [TEST_MODE]: Loading audio from ${TEST_AUDIO_PATH}`);

        // Chuyển sang processing - UI sẽ hiển thị loading ngay
        this.setState('processing');
        this.recordingStartedAtMs = performance.now();
        this.recordingFinishedAtMs = null;

        try {
            const response = await fetch(TEST_AUDIO_PATH);
            if (!response.ok) {
                throw new Error(`Failed to load test audio: ${response.status} - Make sure file exists at ${TEST_AUDIO_PATH}`);
            }

            const audioBlob = await response.blob();
            this.recordingFinishedAtMs = performance.now();
            console.log(`VoiceHandler [TEST_MODE]: Loaded audio file, size: ${audioBlob.size} bytes`);

            // Callback với audio blob - SpeakVoice sẽ gọi API và xử lý kết quả
            this.onComplete?.({
                audioBlob,
                durationMs: this.getRecordingDurationMs()
            });

        } catch (err) {
            console.error('VoiceHandler [TEST_MODE]: Error', err);
            this.onError?.(err instanceof Error ? err.message : 'Test mode error');
            this.setState('idle');
        }
    }

    // ========================================================================
    // KHU VỰC: PRIVATE - HIỆU CHỈNH (CALIBRATION)
    // ========================================================================

    /**
     * Calibration: 5s đầu để tính ngưỡng âm thanh baseline ban đầu
     * Sử dụng 25th percentile thay vì median để lấy mẫu yên tĩnh hơn
     */
    private startCalibration(): void {
        const CFG = GameConstants.VOICE_RECORDING;
        const VAD = VoiceHandler.VAD_CONFIG;
        let elapsed = 0;

        const calibrate = () => {
            if (this.state !== 'calibrating') return;

            const volume = this.getCurrentVolume();
            this.calibrationSamples.push(volume);
            this.onVolumeChange?.(volume, false);

            elapsed += 100;

            if (elapsed >= CFG.CALIBRATION_DURATION) {
                // Dùng 25th percentile thay vì median để lấy giá trị yên tĩnh hơn
                const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
                const p25Index = Math.floor(sorted.length * 0.25);
                const p25 = sorted[p25Index];

                // Sanity check: Clamp baseline theo MIN_BASELINE và MAX_BASELINE
                const clampedBaseline = Math.max(VAD.MIN_BASELINE, Math.min(VAD.MAX_BASELINE, p25));

                // Khởi tạo adaptive baseline
                this.adaptiveBaseline = clampedBaseline;
                this.consecutiveSilentFrames = 0;

                console.log(`VoiceHandler: Adaptive VAD initialized`);
                console.log(`  - 25th percentile noise: ${p25.toFixed(2)}`);
                console.log(`  - Clamped baseline: ${clampedBaseline.toFixed(2)} (max: ${VAD.MAX_BASELINE})`);
                console.log(`  - Trigger threshold: ${(clampedBaseline * VAD.SPEECH_THRESHOLD + CFG.NOISE_MARGIN).toFixed(2)}`);

                // Chuyển sang recording phase
                this.setState('recording');
                this.startRecordingPhase();
            } else {
                this.calibrationTimeout = window.setTimeout(calibrate, 100);
            }
        };

        calibrate();
    }

    // ========================================================================
    // KHU VỰC: PRIVATE - THU ÂM VÀ VAD (RECORDING & VAD)
    // ========================================================================

    /**
     * Recording phase với Adaptive VAD
     * Baseline được cập nhật liên tục khi không có giọng nói
     */
    private startRecordingPhase(): void {
        const CFG = GameConstants.VOICE_RECORDING;

        // Timeout tổng
        this.recordingTimeout = window.setTimeout(() => {
            console.log('VoiceHandler: Max duration reached');
            this.stop();
        }, CFG.MAX_DURATION);

        // Adaptive VAD + Silence detection
        this.silenceCheckInterval = window.setInterval(() => {
            if (this.state !== 'recording') return;
            this.processVadStep();
        }, 100);
    }

    /**
     * Xử lý từng bước VAD (được gọi mỗi 100ms)
     * Tách ra để code gọn hơn
     */
    private processVadStep(): void {
        const CFG = GameConstants.VOICE_RECORDING;
        const VAD = VoiceHandler.VAD_CONFIG;
        const volume = this.getCurrentVolume();

        // ===== ADAPTIVE VAD v2: Hysteresis + Asymmetric Update + Hangover =====

        // 1. Tính toán ngưỡng Trigger (Kích hoạt) và Sustain (Duy trì)
        const triggerThreshold = this.adaptiveBaseline * VAD.SPEECH_THRESHOLD + CFG.NOISE_MARGIN;
        const sustainThreshold = triggerThreshold * VAD.SUSTAIN_FACTOR;

        // 2. Kiểm tra volume hiện tại so với ngưỡng
        const activeThreshold = this.isSpeechActive ? sustainThreshold : triggerThreshold;
        let rawIsSpeech = volume > activeThreshold;

        // ===== SPEECH RANGE FILTER =====
        // Chỉ thu âm thanh trong khoảng trung bình ± tolerance
        let inSpeechRange = true;
        if (VAD.RANGE_FILTER_ENABLED && rawIsSpeech) {
            // Chỉ áp dụng range filter khi đã có đủ sample
            if (this.speechSampleCount >= VAD.MIN_SAMPLES_FOR_RANGE) {
                const lowerBound = this.speechVolumeAvg - VAD.SPEECH_RANGE_TOLERANCE;
                const upperBound = this.speechVolumeAvg + VAD.SPEECH_RANGE_TOLERANCE;
                inSpeechRange = volume >= lowerBound && volume <= upperBound;

                if (!inSpeechRange && VAD.DEBUG_LOG) {
                    console.log(`RANGE_FILTER: vol=${volume.toFixed(1)} OUT OF RANGE [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}] avg=${this.speechVolumeAvg.toFixed(1)}`);
                }
            }

            // Cập nhật trung bình giọng nói
            // **QUAN TRỌNG**: Chỉ cập nhật khi volume đủ lớn (> SPEECH_MIN_VOLUME) để tránh nhiễu nhỏ làm sai avg
            const isValidSampleForAvg = volume > VAD.SPEECH_MIN_VOLUME &&
                (inSpeechRange || this.speechSampleCount < VAD.MIN_SAMPLES_FOR_RANGE);
            if (isValidSampleForAvg) {
                this.speechSampleCount++;
                // EMA update
                if (this.speechSampleCount === 1) {
                    // Sample đầu tiên: khởi tạo trực tiếp
                    this.speechVolumeAvg = volume;
                } else {
                    this.speechVolumeAvg = this.speechVolumeAvg * (1 - VAD.SPEECH_AVG_ALPHA)
                        + volume * VAD.SPEECH_AVG_ALPHA;
                }
            }
        }

        // Kết hợp rawIsSpeech với range filter
        const validSpeech = rawIsSpeech && inSpeechRange;

        // Debug log
        if (VAD.DEBUG_LOG && this.consecutiveSilentFrames % 10 === 0) {
            const rangeInfo = VAD.RANGE_FILTER_ENABLED ? ` | avg=${this.speechVolumeAvg.toFixed(1)} | inRange=${inSpeechRange}` : '';
            console.log(`VAD: vol=${volume.toFixed(1)} | baseline=${this.adaptiveBaseline.toFixed(1)} | trigger=${triggerThreshold.toFixed(1)} | sustain=${sustainThreshold.toFixed(1)} | active=${this.isSpeechActive} | valid=${validSpeech}${rangeInfo}`);
        }

        // 3. Logic Hangover (Giữ trạng thái nói thêm một chút)
        if (validSpeech) {
            this.isSpeechActive = true;
            this.speechHoldTimer = VAD.HOLD_DELAY;
            this.consecutiveSilentFrames = 0;
            this.lastSoundTime = Date.now();
        } else {
            if (this.speechHoldTimer > 0) {
                this.isSpeechActive = true;
                this.speechHoldTimer -= 100;
                this.lastSoundTime = Date.now();
            } else {
                this.isSpeechActive = false;
                this.consecutiveSilentFrames++;
            }
        }

        // Callback UI
        this.onVolumeChange?.(volume, this.isSpeechActive);

        // 4. Cập nhật Adaptive Baseline (Asymmetric Update)
        if (!this.isSpeechActive) {
            // Chỉ cập nhật khi CHẮC CHẮN im lặng
            if (volume < this.adaptiveBaseline) {
                // Môi trường yên tĩnh hơn -> Cập nhật xuống NHANH
                this.adaptiveBaseline = this.adaptiveBaseline * (1 - VAD.BASELINE_UPDATE_DOWN)
                    + volume * VAD.BASELINE_UPDATE_DOWN;
            } else {
                // Môi trường ồn hơn một chút -> Cập nhật lên CỰC CHẬM
                this.adaptiveBaseline = this.adaptiveBaseline * (1 - VAD.BASELINE_UPDATE_UP)
                    + volume * VAD.BASELINE_UPDATE_UP;
            }

            // ClampBaseline
            this.adaptiveBaseline = Math.max(VAD.MIN_BASELINE,
                Math.min(VAD.MAX_BASELINE, this.adaptiveBaseline));
        }

        // 5. Kiểm tra Silence Timeout (chỉ khi thực sự im lặng)
        if (!this.isSpeechActive) {
            const silenceDuration = Date.now() - this.lastSoundTime;
            if (silenceDuration >= CFG.SILENCE_TIMEOUT) {
                console.log(`VoiceHandler: Silence timeout detected. Duration: ${silenceDuration}ms`);
                console.log(`  - Final Baseline: ${triggerThreshold.toFixed(2)}`);
                console.log(`  - Final Threshold: ${triggerThreshold.toFixed(2)}`);
                this.stop();
            }
        }
    }

    // ========================================================================
    // KHU VỰC: PRIVATE - XỬ LÝ ÂM THANH VÀ TIỆN ÍCH
    // ========================================================================

    /**
     * Lấy volume hiện tại từ analyser
     */
    private getCurrentVolume(): number {
        if (!this.analyser || !this.timeDomainBuffer) return 0;

        this.analyser.getByteTimeDomainData(this.timeDomainBuffer as any);

        let sumSquares = 0;
        for (let i = 0; i < this.timeDomainBuffer.length; i++) {
            const normalized = (this.timeDomainBuffer[i] - 128) / 128.0;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / this.timeDomainBuffer.length);
        return rms * 255;
    }

    /**
     * Xử lý sau khi dừng ghi âm
     */
    private async processRecording(): Promise<void> {
        if (this.audioChunks.length === 0) {
            this.onError?.('Không có dữ liệu âm thanh');
            this.cleanup();
            return;
        }

        try {
            // Tạo blob từ chunks
            const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });

            // Chuyển đổi sang WAV
            const wavBlob = await this.convertToWav(audioBlob);

            // Bật tự động lưu file WAV xuống máy để sếp dễ dàng Debug file trước khi gửi BE
            VoiceHandler.saveWavLocally(wavBlob, `debug_recording_${Date.now()}.wav`);

            // Callback trả về audio blob (WAV) cho Game (SpeakScene) gọi API
            this.onComplete?.({
                audioBlob: wavBlob,
                durationMs: this.getRecordingDurationMs()
            });

        } catch (err) {
            console.error('VoiceHandler: Failed to process recording', err);
            this.onError?.('Lỗi xử lý ghi âm');
        } finally {
            this.cleanup();
        }
    }

    /**
     * Chuyển đổi audio blob sang định dạng WAV
     * Triển khai nhẹ xử lý qua AudioContext thay vì dùng thư viện
     */
    private async convertToWav(audioBlob: Blob): Promise<Blob> {
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new AudioContext({ sampleRate: 16000 });
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Lấy dữ liệu PCM
            const pcmData = audioBuffer.getChannelData(0);
            const wavBuffer = this.encodeWav(pcmData, audioBuffer.sampleRate);

            audioContext.close();
            return new Blob([wavBuffer], { type: 'audio/wav' });
        } catch (err) {
            console.warn('VoiceHandler: WAV conversion failed, returning original', err);
            return audioBlob;
        }
    }

    /**
     * Mã hóa dữ liệu PCM sang định dạng WAV
     */
    private encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        // Cấu trúc phần đầu của chuẩn WAV
        const writeString = (offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size
        view.setUint16(20, 1, true);  // AudioFormat (PCM)
        view.setUint16(22, 1, true);  // NumChannels (Mono)
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true); // ByteRate
        view.setUint16(32, 2, true);  // BlockAlign
        view.setUint16(34, 16, true); // BitsPerSample
        writeString(36, 'data');
        view.setUint32(40, samples.length * 2, true);

        // Chuyển đổi float thành 16-bit PCM
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }

        return buffer;
    }

    private setState(state: RecordingState): void {
        this.state = state;
        this.onStateChange?.(state);
    }

    private clearTimers(): void {
        if (this.calibrationTimeout) {
            clearTimeout(this.calibrationTimeout);
            this.calibrationTimeout = null;
        }
        if (this.silenceCheckInterval) {
            clearInterval(this.silenceCheckInterval);
            this.silenceCheckInterval = null;
        }
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }
    }

    private cleanup(): void {
        this.clearTimers();

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Dọn dẹp bộ lọc âm thanh
        this.audioFilterNodes.forEach(node => {
            if (node) node.disconnect();
        });
        this.audioFilterNodes = [];

        this.analyser = null;
        this.highpassFilter = null;
        this.lowpassFilter = null;
        this.notchFilter = null;

        this.mediaRecorder = null;
        this.audioChunks = [];
        this.timeDomainBuffer = undefined;
        this.calibrationSamples = [];
        this.recordingStartedAtMs = null;
        this.recordingFinishedAtMs = null;

        // Reset VAD state
        this.adaptiveBaseline = 0;
        this.consecutiveSilentFrames = 0;
        this.isSpeechActive = false;
        this.speechHoldTimer = 0;

        // Reset speech range tracking
        this.speechVolumeAvg = 0;
        this.speechSampleCount = 0;

        this.setState('idle');
    }

    private getRecordingDurationMs(): number {
        if (this.recordingStartedAtMs === null) {
            return GameConstants.VOICE_RECORDING.MAX_DURATION;
        }

        const endAt = this.recordingFinishedAtMs ?? performance.now();
        return Math.max(1, Math.round(endAt - this.recordingStartedAtMs));
    }

    // ========================================================================
    // KHU VỰC: CÁC TIỆN ÍCH TĨNH (STATIC UTILS)
    // ========================================================================

    /**
     * Lưu file WAV locally (cho testing)
     */
    static saveWavLocally(blob: Blob, filename: string = 'recording.wav'): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        console.log(`VoiceHandler: Saved ${filename}`);
    }

    /**
     * Gửi audio lên BE (sẵn sàng khi deploy)
     */
    static async sendToBackend(
        blob: Blob,
        keywords: string,
        apiUrl: string = 'https://iruka-voice-lite-1037337851453.asia-southeast1.run.app/api/v1/voice/eval'
    ): Promise<VoiceEvalResponse> {
        const formData = new FormData();
        formData.append('file', blob, 'recording.wav');
        formData.append('keywords', keywords);


        console.log('VoiceHandler: Sending to backend...', apiUrl);
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        return response.json();
    }
}
