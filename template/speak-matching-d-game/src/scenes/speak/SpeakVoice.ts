/**
 * SpeakVoice - Quản lý logic ghi âm giọng nói cho SpeakScene
 * 
 * Hỗ trợ:
 * - Ghi âm từng dòng (max 45s mỗi dòng)
 * - Debug mode: dùng file test audio thay vì ghi âm thực
 * - Không gọi API trực tiếp, chỉ trả về audio blob cho SpeakScene xử lý
 */
import Phaser from 'phaser';
import { VoiceHandler, type RecordingState } from '../../utils/VoiceHandler';
import { GameConstants } from '../../consts/GameConstants';

export interface SpeakVoiceCallbacks {
    onRecordingComplete: (result: { score: number; status: string; passed: boolean; audioBlob?: Blob }) => void;
    onRecordingError: (error: string) => void;
}

export class SpeakVoice {
    private scene: Phaser.Scene;
    private voiceHandler!: VoiceHandler;
    private microBtn: Phaser.GameObjects.Image;
    private recordingIndicator: Phaser.GameObjects.Graphics | null = null;
    private volumeBar: Phaser.GameObjects.Graphics;
    private callbacks: SpeakVoiceCallbacks;

    // Quản lý trạng thái ghi âm cho từng dòng câu hỏi/đáp án
    private currentLineIndex: number = 0;
    private recordingTimeout: Phaser.Time.TimerEvent | null = null;

    constructor(
        scene: Phaser.Scene,
        microBtn: Phaser.GameObjects.Image,
        volumeBar: Phaser.GameObjects.Graphics,
        callbacks: SpeakVoiceCallbacks
    ) {
        this.scene = scene;
        this.microBtn = microBtn;
        this.volumeBar = volumeBar;
        this.callbacks = callbacks;

        this.setupVoiceHandler();
    }

    private setupVoiceHandler(): void {
        this.voiceHandler = new VoiceHandler({
            onStateChange: (state) => this.onRecordingStateChange(state),
            onVolumeChange: (volume, isAbove) => this.updateVolumeIndicator(volume, isAbove),
            onComplete: (blob) => this.onRecordingComplete(blob),
            onError: (err) => this.onRecordingError(err)
        });
    }

    private onRecordingStateChange(state: RecordingState): void {
        const CFG = GameConstants.SPEAK_SCENE;

        switch (state) {
            case 'calibrating':
                this.microBtn.setTint(0xFFFF00);
                this.showRecordingIndicator(0xFFFF00);
                break;
            case 'recording':
                this.microBtn.setTint(0xFF0000);
                this.showRecordingIndicator(0xFF0000);
                this.startMicPulse();
                break;
            case 'processing':
                this.microBtn.clearTint();
                this.hideRecordingIndicator();
                this.clearRecordingTimeout();
                // Không hiện loading ở đây, SpeakScene sẽ handle
                break;
            case 'idle':
                this.microBtn.clearTint();
                this.microBtn.setScale(CFG.MICRO.SCALE);
                this.hideRecordingIndicator();
                this.clearRecordingTimeout();
                break;
        }
    }

    private updateVolumeIndicator(volume: number, isAboveThreshold: boolean): void {
        if (!this.volumeBar) return;

        const maxWidth = 100;
        const height = 10;
        const normalizedVolume = Math.min(volume / 128, 1);

        // Cập nhật thanh volume bar
        this.volumeBar.clear();
        this.volumeBar.fillStyle(isAboveThreshold ? 0x00FF00 : 0x666666, 0.8);
        this.volumeBar.fillRect(
            this.microBtn.x - maxWidth / 2,
            this.microBtn.y + 60,
            normalizedVolume * maxWidth,
            height
        );

        // Cập nhật màu nền mic indicator
        if (this.recordingIndicator) {
            this.recordingIndicator.clear();
            const indicatorColor = isAboveThreshold ? 0x00FF00 : 0xFF6666;
            this.recordingIndicator.fillStyle(indicatorColor, 0.3);
            this.recordingIndicator.fillCircle(this.microBtn.x, this.microBtn.y, 80);
        }
    }

    private showRecordingIndicator(color: number): void {
        if (!this.recordingIndicator) {
            this.recordingIndicator = this.scene.add.graphics().setDepth(50);
        }
        this.recordingIndicator.clear();
        this.recordingIndicator.fillStyle(color, 0.3);
        this.recordingIndicator.fillCircle(this.microBtn.x, this.microBtn.y, 80);
    }

    private hideRecordingIndicator(): void {
        this.recordingIndicator?.clear();
        this.volumeBar?.clear();
    }

    private startMicPulse(): void {
        const CFG = GameConstants.SPEAK_SCENE;
        this.scene.tweens.add({
            targets: this.microBtn,
            scale: { from: CFG.MICRO.SCALE, to: CFG.MICRO.SCALE + 0.1 },
            duration: 500,
            yoyo: true,
            repeat: -1,
            onStop: () => this.microBtn.setScale(CFG.MICRO.SCALE)
        });
    }

    /**
     * Callback khi ghi âm xong - GIỮ nguyên audio blob để SpeakScene gửi API
     */
    private async onRecordingComplete(audioBlob: Blob): Promise<void> {
        console.log(`[SpeakVoice] Line ${this.currentLineIndex + 1} recording complete, size: ${audioBlob.size}`);

        // Trả về blob cho SpeakScene xử lý (gửi API async)
        this.callbacks.onRecordingComplete({
            score: 0,  // Điểm số sẽ được xử lý tính toán bên trong LineScoreManager
            status: 'pending',
            passed: false,
            audioBlob: audioBlob
        });
    }

    private clearRecordingTimeout(): void {
        if (this.recordingTimeout) {
            this.recordingTimeout.destroy();
            this.recordingTimeout = null;
        }
    }

    private onRecordingError(error: string): void {
        console.error('Recording error:', error);
        this.callbacks.onRecordingError(error);

        this.scene.time.delayedCall(2000, () => {
            this.microBtn.clearTint();
            this.hideRecordingIndicator();
        });
    }

    /**
     * Toggle recording on/off (legacy - cho backward compatibility)
     */
    toggle(): void {
        this.voiceHandler.toggle();
    }

    /**
     * Bắt đầu ghi âm cho 1 dòng cụ thể
     * @param lineIndex - Index của dòng (0-5)
     */
    toggleForLine(lineIndex: number): void {
        this.currentLineIndex = lineIndex;
        const CFG = GameConstants.SPEAK_SCENE.LINE_READING;
        const CFG_VOICE = GameConstants.VOICE_RECORDING;

        console.log(`[SpeakVoice] Starting recording for line ${lineIndex + 1}, keyword: "${CFG.KEYWORDS_PER_LINE[lineIndex]}"`);

        // Trong TEST_MODE: load file test thay vì ghi âm
        if (CFG_VOICE.TEST_MODE) {
            this.handleTestModeForLine(lineIndex);
            return;
        }

        // Chế độ chơi bình thường: bật mic bắt đầu thu âm
        this.voiceHandler.toggle();

        // Đặt đồng hồ đếm ngược với thời gian ghi âm tối đa cho một dòng
        this.recordingTimeout = this.scene.time.delayedCall(
            CFG.MAX_RECORD_TIME_PER_LINE,
            () => {
                console.log(`[SpeakVoice] Dòng ${lineIndex + 1} vượt quá thời gian thu âm, đang dừng lại...`);
                if (this.voiceHandler.isRecording) {
                    this.voiceHandler.toggle(); // Dừng thu âm
                }
            }
        );
    }

    /**
     * Test mode: load file test audio và gửi API NGAY LẬP TỨC
     * Animation ngón tay chạy song song ở background
     */
    private async handleTestModeForLine(lineIndex: number): Promise<void> {
        const CFG = GameConstants.SPEAK_SCENE.LINE_READING;
        const testAudioPath = CFG.TEST_AUDIO_FILES[lineIndex];

        console.log(`[SpeakVoice] TEST_MODE: Loading audio from ${testAudioPath}`);

        // Hiện hiệu ứng vàng nhấp nháy giả lập trạng thái đang thu âm
        this.microBtn.setTint(0xFFFF00);
        this.showRecordingIndicator(0xFFFF00);

        try {
            const response = await fetch(testAudioPath);
            if (!response.ok) {
                throw new Error(`Failed to load test audio: ${response.status}`);
            }

            const audioBlob = await response.blob();
            console.log(`[SpeakVoice] TEST_MODE: Loaded audio, size: ${audioBlob.size} bytes - SENDING API NOW`);

            // GỬI CALLBACK NGAY LẬP TỨC - API sẽ được gọi song song với animation đang chạy
            this.callbacks.onRecordingComplete({
                score: 0,
                status: 'pending',
                passed: false,
                audioBlob: audioBlob
            });

            // Hiển thị trạng thái đang thu âm tiếp tục chớp nháy ở background để user không bị cụt hứng
            const LINES = GameConstants.SPEAK_SCENE.READING_FINGER.LINES;
            const lineDuration = LINES[lineIndex]?.duration || 2000;

            this.scene.time.delayedCall(lineDuration + 500, () => {
                this.microBtn.clearTint();
                this.hideRecordingIndicator();
            });

        } catch (err) {
            console.error('[SpeakVoice] TEST_MODE: Error loading test audio', err);
            this.microBtn.clearTint();
            this.hideRecordingIndicator();
            this.callbacks.onRecordingError(err instanceof Error ? err.message : 'Test mode error');
        }
    }

    /**
     * Kiểm tra đang recording không
     */
    get isRecording(): boolean {
        return this.voiceHandler.isRecording;
    }

    /**
     * Dọn dẹp bộ nhớ (Cleanup)
     */
    destroy(): void {
        this.voiceHandler?.destroy();
        this.recordingIndicator?.destroy();
        this.clearRecordingTimeout();
    }
}
