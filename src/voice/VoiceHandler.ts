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
const TARGET_SAMPLE_RATE = 16000;

interface AudioStats {
    peak: number;
    rms: number;
    speechPeak: number;
    speechRms: number;
    speechRatio: number;
    clippedRatio: number;
    sampleCount: number;
}

interface NormalizationPlan {
    multiplier: number;
    speechThreshold: number;
}

export class VoiceHandler {
    // ========================================================================
    // REGION: PROPERTIES
    // ========================================================================
    private processorNode: ScriptProcessorNode | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private dummyGain: GainNode | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private mediaStream: MediaStream | null = null;
    private gainNode: GainNode | null = null;
    private compressorNode: DynamicsCompressorNode | null = null; // Bộ nén tăng âm chuẩn

    // Các bộ lọc âm thanh để giảm thiểu tiếng ồn
    private audioFilterNodes: BiquadFilterNode[] = [];
    private highpassFilter: BiquadFilterNode | null = null;
    private lowpassFilter: BiquadFilterNode | null = null;
    private notchFilter: BiquadFilterNode | null = null;

    private pcmChunks: Float32Array[] = [];
    private state: RecordingState = 'idle';
    private timeDomainBuffer?: Uint8Array;
    private recordingStartedAtMs: number | null = null;
    private recordingFinishedAtMs: number | null = null;
    private recordingSampleRate: number = TARGET_SAMPLE_RATE;
    private captureSettings: MediaTrackSettings | null = null;

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

        try {
            this.recordingStartedAtMs = performance.now();
            this.recordingFinishedAtMs = null;

            // Request microphone
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: TARGET_SAMPLE_RATE,
                    sampleSize: 16,
                }
            });

            const audioTrack = this.mediaStream.getAudioTracks()[0];
            this.captureSettings = audioTrack?.getSettings?.() ?? null;
            this.logCaptureSettings();

            // Setup audio pipeline: Mic → Filter → Analyser & Destination (kèm Gain)
            await this.setupAudioContext();

            this.pcmChunks = [];
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

        this.recordingFinishedAtMs = performance.now();
        this.processRecording();

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

    private async setupAudioContext(): Promise<void> {
        if (!this.mediaStream) return;

        this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
        this.recordingSampleRate = this.audioContext.sampleRate;
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

        // 4. Gain Node - Tăng âm lượng đầu vào nhẹ nhàng trước khi nén (đã bật lại AGC)
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.getInputGainValue();

        // Kết nối chuỗi bộ lọc: source -> highpass -> notch -> lowpass -> gainNode
        source.connect(this.highpassFilter);
        this.highpassFilter.connect(this.notchFilter);
        this.notchFilter.connect(this.lowpassFilter);
        this.lowpassFilter.connect(this.gainNode);

        // --- NHÁNH 1: Phân tích âm thanh (VAD) ---
        // Theo dõi đúng tín hiệu sau khi đã áp gain để log và VAD bám sát file gửi BE hơn.
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.gainNode.connect(this.analyser);

        // --- NHÁNH 2: Ghi âm (Record) ---
        // Chỉ nén nhẹ để chặn clipping khi bé nói to, không đè phẳng toàn bộ giọng nói.
        this.compressorNode = this.audioContext.createDynamicsCompressor();
        this.compressorNode.threshold.value = -20;
        this.compressorNode.knee.value = 18;
        this.compressorNode.ratio.value = 2.5;
        this.compressorNode.attack.value = 0.002;
        this.compressorNode.release.value = 0.18;

        await this.setupCaptureNode();

        // Dummy Gain để giữ node capture luôn được clock tới nhưng không phát tiếng ra loa.
        this.dummyGain = this.audioContext.createGain();
        this.dummyGain.gain.value = 0; // Tắt tiếng, không bao giờ phát ra loa

        // Nối dây: gainNode -> compressorNode -> captureNode -> dummyGain -> destination
        this.gainNode.connect(this.compressorNode);
        if (this.workletNode) {
            this.compressorNode.connect(this.workletNode);
            this.workletNode.connect(this.dummyGain);
        } else if (this.processorNode) {
            this.compressorNode.connect(this.processorNode);
            this.processorNode.connect(this.dummyGain);
        } else {
            throw new Error('VoiceHandler: No audio capture node available');
        }
        this.dummyGain.connect(this.audioContext.destination);

        this.audioFilterNodes = [this.highpassFilter, this.notchFilter, this.lowpassFilter];
        this.timeDomainBuffer = new Uint8Array(this.analyser.fftSize);
        // ===== END AUDIO FILTERS =====
    }

    private async setupCaptureNode(): Promise<void> {
        if (!this.audioContext) return;

        if (typeof AudioWorkletNode !== 'undefined' && this.audioContext.audioWorklet) {
            try {
                const moduleUrl = new URL('./pcmCaptureProcessor.js', import.meta.url).href;
                await this.audioContext.audioWorklet.addModule(moduleUrl);

                this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [1],
                });

                this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
                    this.handleCapturedChunk(event.data);
                };

                console.log('VoiceHandler: Using AudioWorkletNode for PCM capture');
                return;
            } catch (error) {
                console.warn('VoiceHandler: AudioWorklet unavailable, fallback to ScriptProcessorNode', error);
                this.workletNode = null;
            }
        }

        // Fallback cho trình duyệt cũ.
        this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.processorNode.onaudioprocess = (e) => {
            this.handleCapturedChunk(e.inputBuffer.getChannelData(0));
        };
        console.log('VoiceHandler: Using ScriptProcessorNode fallback for PCM capture');
    }

    private handleCapturedChunk(chunk: Float32Array): void {
        if (this.state !== 'recording' && this.state !== 'calibrating') return;
        this.pcmChunks.push(new Float32Array(chunk));
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
        if (this.pcmChunks.length === 0) {
            this.onError?.('Không có dữ liệu âm thanh');
            this.cleanup();
            return;
        }

        try {
            // Chuyển đổi mảng RAW PCM sang WAV chuẩn
            const wavBlob = await this.convertToWav(this.pcmChunks);

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
    private async convertToWav(chunks: Float32Array[]): Promise<Blob> {
        try {
            const pcmData = this.mergePcmChunks(chunks);
            const rawStats = VoiceHandler.analyzeAudio(pcmData);
            const trimmedPcm = this.trimSilence(pcmData, this.recordingSampleRate, rawStats);
            const trimmedStats = VoiceHandler.analyzeAudio(trimmedPcm);
            const normalization = VoiceHandler.buildNormalizationPlan(trimmedStats);

            // Build header WAV với sample rate thực tế của AudioContext để không sai metadata.
            const wavBuffer = this.encodeWav(trimmedPcm, this.recordingSampleRate, normalization.multiplier);
            const finalStats = VoiceHandler.analyzeAudio(trimmedPcm, normalization.multiplier);
            this.logAudioTelemetry(rawStats, trimmedStats, finalStats, normalization, pcmData.length, trimmedPcm.length);
            return new Blob([wavBuffer], { type: 'audio/wav' });
        } catch (err) {
            console.error('VoiceHandler: WAV conversion failed', err);
            throw err;
        }
    }

    private mergePcmChunks(chunks: Float32Array[]): Float32Array {
        let totalLength = 0;
        for (const chunk of chunks) {
            totalLength += chunk.length;
        }

        const pcmData = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            pcmData.set(chunk, offset);
            offset += chunk.length;
        }

        return pcmData;
    }

    private trimSilence(samples: Float32Array, sampleRate: number, stats?: AudioStats): Float32Array {
        if (samples.length === 0) return samples;

        const baseStats = stats ?? VoiceHandler.analyzeAudio(samples);
        const threshold = Math.max(0.004, Math.min(0.03, Math.max(baseStats.speechPeak, baseStats.peak) * 0.12));
        const paddingSamples = Math.round(sampleRate * 0.12);

        let start = 0;
        while (start < samples.length && Math.abs(samples[start]) < threshold) {
            start++;
        }

        let end = samples.length - 1;
        while (end > start && Math.abs(samples[end]) < threshold) {
            end--;
        }

        if (start >= end) {
            return samples;
        }

        const trimmedStart = Math.max(0, start - paddingSamples);
        const trimmedEnd = Math.min(samples.length, end + paddingSamples + 1);
        return samples.slice(trimmedStart, trimmedEnd);
    }

    /**
     * Mã hóa dữ liệu PCM sang định dạng WAV
     */
    private encodeWav(samples: Float32Array, sampleRate: number, multiplier: number = 1.0): ArrayBuffer {
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

        // Chuyển đổi float thành 16-bit PCM và khuếch đại qua Normalization
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            let s = samples[i] * multiplier;
            s = Math.max(-1, Math.min(1, s)); // Cắt biên (clamping) tránh quá tải dữ liệu byte vỡ tiếng
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }

        return buffer;
    }

    private setState(state: RecordingState): void {
        this.state = state;
        this.onStateChange?.(state);
    }

    private getInputGainValue(): number {
        const settings = this.captureSettings as Record<string, unknown> | null;
        const autoGainEnabled = settings?.autoGainControl === true;
        return autoGainEnabled ? 2.6 : 3.2;
    }

    private logCaptureSettings(): void {
        console.log('VoiceHandler: Mic capture settings', {
            requestedSampleRate: TARGET_SAMPLE_RATE,
            actualSettings: this.captureSettings,
        });
    }

    private logAudioTelemetry(
        rawStats: AudioStats,
        trimmedStats: AudioStats,
        finalStats: AudioStats,
        normalization: NormalizationPlan,
        rawSampleCount: number,
        trimmedSampleCount: number
    ): void {
        console.log('VoiceHandler: Audio telemetry', {
            sampleRate: this.recordingSampleRate,
            inputGain: this.gainNode?.gain.value ?? null,
            rawDurationMs: Math.round(rawSampleCount / this.recordingSampleRate * 1000),
            trimmedDurationMs: Math.round(trimmedSampleCount / this.recordingSampleRate * 1000),
            normalizationMultiplier: Number(normalization.multiplier.toFixed(2)),
            speechThreshold: Number(normalization.speechThreshold.toFixed(4)),
            raw: VoiceHandler.formatAudioStats(rawStats),
            trimmed: VoiceHandler.formatAudioStats(trimmedStats),
            final: VoiceHandler.formatAudioStats(finalStats),
        });
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

        if (this.workletNode) {
            this.workletNode.port.onmessage = null;
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode.onaudioprocess = null;
            this.processorNode = null;
        }

        if (this.dummyGain) {
            this.dummyGain.disconnect();
            this.dummyGain = null;
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        if (this.compressorNode) {
            this.compressorNode.disconnect();
            this.compressorNode = null;
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

        this.pcmChunks = [];
        this.timeDomainBuffer = undefined;
        this.calibrationSamples = [];
        this.recordingStartedAtMs = null;
        this.recordingFinishedAtMs = null;
        this.recordingSampleRate = TARGET_SAMPLE_RATE;
        this.captureSettings = null;

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

    private static analyzeAudio(samples: Float32Array, multiplier: number = 1): AudioStats {
        if (samples.length === 0) {
            return {
                peak: 0,
                rms: 0,
                speechPeak: 0,
                speechRms: 0,
                speechRatio: 0,
                clippedRatio: 0,
                sampleCount: 0,
            };
        }

        let peak = 0;
        let sumSquares = 0;
        let clippedSamples = 0;

        for (let i = 0; i < samples.length; i++) {
            const value = Math.max(-1, Math.min(1, samples[i] * multiplier));
            const abs = Math.abs(value);
            if (abs > peak) peak = abs;
            sumSquares += value * value;
            if (abs >= 0.995) clippedSamples++;
        }

        const rms = Math.sqrt(sumSquares / samples.length);
        const speechThreshold = Math.max(0.006, Math.min(0.03, peak * 0.1));
        let speechPeak = 0;
        let speechSquares = 0;
        let speechSamples = 0;

        for (let i = 0; i < samples.length; i++) {
            const value = Math.max(-1, Math.min(1, samples[i] * multiplier));
            const abs = Math.abs(value);
            if (abs >= speechThreshold) {
                if (abs > speechPeak) speechPeak = abs;
                speechSquares += value * value;
                speechSamples++;
            }
        }

        return {
            peak,
            rms,
            speechPeak,
            speechRms: speechSamples > 0 ? Math.sqrt(speechSquares / speechSamples) : 0,
            speechRatio: speechSamples / samples.length,
            clippedRatio: clippedSamples / samples.length,
            sampleCount: samples.length,
        };
    }

    private static buildNormalizationPlan(stats: AudioStats): NormalizationPlan {
        const speechThreshold = Math.max(0.006, Math.min(0.03, Math.max(stats.speechPeak, stats.peak) * 0.1));
        const sourceSpeechRms = stats.speechRms > 0 ? stats.speechRms : stats.rms;
        const lowConfidenceSpeech = stats.speechRatio < 0.015 && stats.speechPeak < 0.08;

        if (stats.peak <= 0 || sourceSpeechRms <= 0) {
            return {
                multiplier: 1,
                speechThreshold,
            };
        }

        const peakTargetMultiplier = 0.92 / stats.peak;
        const targetSpeechRms = lowConfidenceSpeech ? 0.12 : 0.18;
        const speechTargetMultiplier = targetSpeechRms / sourceSpeechRms;
        let multiplier = Math.min(peakTargetMultiplier, speechTargetMultiplier);

        if (!Number.isFinite(multiplier) || multiplier <= 0) {
            multiplier = 1;
        }

        multiplier = Math.max(1, Math.min(multiplier, lowConfidenceSpeech ? 8 : 24));

        return {
            multiplier,
            speechThreshold,
        };
    }

    private static formatAudioStats(stats: AudioStats): Record<string, number> {
        return {
            peak: Number(stats.peak.toFixed(4)),
            peakDbfs: Number(VoiceHandler.toDb(stats.peak).toFixed(2)),
            rms: Number(stats.rms.toFixed(4)),
            rmsDbfs: Number(VoiceHandler.toDb(stats.rms).toFixed(2)),
            speechPeak: Number(stats.speechPeak.toFixed(4)),
            speechPeakDbfs: Number(VoiceHandler.toDb(stats.speechPeak).toFixed(2)),
            speechRms: Number(stats.speechRms.toFixed(4)),
            speechRmsDbfs: Number(VoiceHandler.toDb(stats.speechRms).toFixed(2)),
            speechRatio: Number(stats.speechRatio.toFixed(4)),
            clippedRatio: Number(stats.clippedRatio.toFixed(4)),
            sampleCount: stats.sampleCount,
        };
    }

    private static toDb(value: number): number {
        if (value <= 0) {
            return -999;
        }

        return 20 * Math.log10(value);
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
