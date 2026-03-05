/**
 * SpeakVoice - Quản lý logic ghi âm giọng nói cho game đếm toa tàu
 *
 * Dựa trên template SpeakVoice:
 * - Sử dụng VoiceHandler với callback pattern (onStateChange, onVolumeChange, onComplete, onError)
 * - 4 trạng thái: calibrating → vàng, recording → vòng sáng vàng + pulse, processing → tắt, idle → reset
 * - Khi recording: hiển thị vòng tròn vàng sáng phía sau mic (giống hình mẫu), mic giữ nguyên màu gốc
 * - Thanh volume bar + vòng sáng đổi màu xanh khi có tiếng nói
 */
import Phaser from 'phaser';
import { VoiceHandler, type RecordingState } from '../../voice/VoiceHandler';
import { GameConstants } from '../../consts/GameConstants';

export interface SpeakVoiceCallbacks {
    onRecordingComplete: (result: { audioBlob: Blob }) => void;
    onRecordingError: (error: string) => void;
}

export class SpeakVoice {
    private scene: Phaser.Scene;
    private voiceHandler!: VoiceHandler;
    private microBtn: Phaser.GameObjects.Image;
    private recordingIndicator: Phaser.GameObjects.Graphics | null = null;
    private volumeBar: Phaser.GameObjects.Graphics;
    private callbacks: SpeakVoiceCallbacks;

    // Trạng thái ghi âm
    private isCurrentlyRecording: boolean = false;

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

    // ==============================
    // KHỞI TẠO VOICE HANDLER 
    // ==============================

    private setupVoiceHandler(): void {
        this.voiceHandler = new VoiceHandler({
            onStateChange: (state) => this.onRecordingStateChange(state),
            onVolumeChange: (volume, isAbove) => this.updateVolumeIndicator(volume, isAbove),
            onComplete: (blob) => this.onRecordingComplete(blob),
            onError: (err) => this.onRecordingError(err)
        });
    }

    // ==============================
    // PUBLIC API (GIỮ NGUYÊN CHO SPEAKSCENE GỌI)
    // ==============================

    /**
     * Bắt đầu thu âm - được gọi khi bé bấm vào mic
     */
    async startRecording(): Promise<void> {
        if (this.isCurrentlyRecording) return;
        this.isCurrentlyRecording = true;
        console.log('[SpeakVoice] Bắt đầu ghi âm...');
        await this.voiceHandler.start();
    }

    /**
     * Dừng ghi âm bằng tay
     */
    stopRecording(): void {
        this.voiceHandler.stop();
    }

    /**
     * Kiểm tra trạng thái có đang ghi âm hay không
     */
    get isRecording(): boolean {
        return this.isCurrentlyRecording;
    }

    /**
     * Khôi phục toàn bộ trạng thái mic về mặc định ban đầu
     */
    resetToIdle(): void {
        this.isCurrentlyRecording = false;
        const CFG = GameConstants.SPEAK_SCENE;
        this.scene.tweens.killTweensOf(this.microBtn);
        this.microBtn.clearTint();
        this.microBtn.setScale(CFG.MICRO.SCALE);
        this.hideRecordingIndicator();
    }

    /**
     * Dọn dẹp bộ nhớ (Cleanup)
     */
    destroy(): void {
        this.voiceHandler?.destroy();
        this.recordingIndicator?.destroy();
        this.volumeBar?.destroy();
    }

    // ==============================
    // XỬ LÝ TRẠNG THÁI GHI ÂM 
    // ==============================

    /**
     * Callback từ VoiceHandler khi trạng thái thay đổi
     * calibrating → vàng nhạt (đang chuẩn bị)
     * recording → vòng sáng vàng to + pulse (đang thu)
     * processing → tắt hết hiệu ứng
     * idle → reset về mặc định
     */
    private onRecordingStateChange(state: RecordingState): void {
        const CFG = GameConstants.SPEAK_SCENE;

        switch (state) {
            case 'calibrating':
                // Đang chuẩn bị: hiện vòng tròn vàng nhạt
                this.microBtn.setTint(0xFFFF00);
                this.showRecordingIndicator(0xFFFF00);
                break;

            case 'recording':
                // Đang thu âm: hiện vòng sáng vàng to phía sau mic 
                // Mic KHÔNG bị setTint - giữ nguyên hình gốc
                this.microBtn.setTint(0xFF0000);
                this.showRecordingIndicator(0xFFFDE7);
                this.startMicPulse();
                break;

            case 'processing':
                // Đang xử lý: tắt hết hiệu ứng
                this.isCurrentlyRecording = false;
                this.scene.tweens.killTweensOf(this.microBtn);
                this.microBtn.clearTint();
                this.microBtn.setScale(CFG.MICRO.SCALE);
                this.hideRecordingIndicator();
                break;

            case 'idle':
                // Nghỉ: reset về mặc định
                this.isCurrentlyRecording = false;
                this.scene.tweens.killTweensOf(this.microBtn);
                this.microBtn.clearTint();
                this.microBtn.setScale(CFG.MICRO.SCALE);
                this.hideRecordingIndicator();
                break;
        }
    }

    // ==============================
    // HIỆU ỨNG VÒNG SÁNG + VOLUME 
    // ==============================

    /**
     * Cập nhật thanh âm lượng + đổi màu vòng sáng khi bé nói
     */
    private updateVolumeIndicator(volume: number, isAboveThreshold: boolean): void {
        if (!this.volumeBar) return;

        const maxWidth = 100;
        const height = 10;
        const normalizedVolume = Math.min(volume / 128, 1);

        // Cập nhật thanh volume bar
        // this.volumeBar.clear();
        // this.volumeBar.fillStyle(isAboveThreshold ? 0x00FF00 : 0x666666, 0.8);
        // this.volumeBar.fillRect(
        //     this.microBtn.x - maxWidth / 2,
        //     this.microBtn.y + 60,
        //     normalizedVolume * maxWidth,
        //     height
        // );

        // Cập nhật màu vòng sáng theo âm lượng
        // Xanh lá khi có tiếng nói, vàng nhạt khi im lặng
        if (this.recordingIndicator) {
            this.recordingIndicator.clear();
                const indicatorColor = isAboveThreshold ? 0x00FF00 : 0xFFFDE7;

                this.recordingIndicator.fillStyle(
                    indicatorColor,
                    isAboveThreshold ? 0.4 : 0.85
                );

                    this.recordingIndicator.setPosition(this.microBtn.x, this.microBtn.y);
                this.recordingIndicator.fillCircle(0, 0, 60);
        }
    }

    /**
     * Hiện vòng tròn sáng phía sau mic
     */
    private showRecordingIndicator(color: number): void {
    if (!this.recordingIndicator) {
        this.recordingIndicator = this.scene.add.graphics();

        // luôn nằm dưới mic
        this.recordingIndicator.setDepth(this.microBtn.depth - 1);
    }

    this.recordingIndicator.clear();
    this.recordingIndicator.fillStyle(color, 0.85);

    // đặt vị trí graphics trùng với mic
    this.recordingIndicator.setPosition(this.microBtn.x, this.microBtn.y);

    // vẽ circle tại local (0,0)
    this.recordingIndicator.fillCircle(0, 0, 70);
}

    /**
     * Ẩn vòng sáng + thanh volume
     */
    private hideRecordingIndicator(): void {
        this.recordingIndicator?.clear();
        this.volumeBar?.clear();
    }

    // ==============================
    // HIỆU ỨNG NẢY (PULSE) CỦA NÚT MIC
    // ==============================

    private startMicPulse(): void {
        const CFG = GameConstants.SPEAK_SCENE;
        this.scene.tweens.add({
            targets: this.microBtn,
            scale: { from: CFG.MICRO.SCALE, to: CFG.MICRO.SCALE + 0.08 },
            duration: 500,
            yoyo: true,
            repeat: -1,
            onStop: () => this.microBtn.setScale(CFG.MICRO.SCALE)
        });
    }

    // ==============================
    // CALLBACKS GHI ÂM
    // ==============================

    /**
     * Callback khi ghi âm hoàn thành - trả blob cho SpeakScene xử lý
     */
    private onRecordingComplete(audioBlob: Blob): void {
        console.log(`[SpeakVoice] Ghi âm xong, kích thước: ${(audioBlob.size / 1024).toFixed(1)}KB`);
        this.callbacks.onRecordingComplete({ audioBlob });
    }

    /**
     * Callback khi ghi âm lỗi
     */
    private onRecordingError(error: string): void {
        console.error('[SpeakVoice] Lỗi ghi âm:', error);
        this.isCurrentlyRecording = false;
        this.callbacks.onRecordingError(error);

        this.scene.time.delayedCall(2000, () => {
            this.microBtn.clearTint();
            this.hideRecordingIndicator();
        });
    }
}
