import Phaser from 'phaser';
import { GameConstants } from '../../consts/GameConstants';
import {
    VoiceHandler,
    type RecordingCompleteResult,
    type RecordingState,
} from '../../voice/VoiceHandler';

export interface SpeakVoiceCallbacks {
    onRecordingComplete: (result: RecordingCompleteResult) => void;
    onRecordingError: (error: string) => void;
}

export class SpeakVoice {
    private scene: Phaser.Scene;
    private voiceHandler!: VoiceHandler;
    private microBtn: Phaser.GameObjects.Image;
    private recordingIndicator: Phaser.GameObjects.Graphics | null = null;
    private volumeBar: Phaser.GameObjects.Graphics;
    private callbacks: SpeakVoiceCallbacks;
    private isCurrentlyRecording = false;

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

    async startRecording(): Promise<void> {
        if (this.isCurrentlyRecording) return;

        this.isCurrentlyRecording = true;
        await this.voiceHandler.start();
    }

    stopRecording(): void {
        this.voiceHandler.stop();
    }

    get isRecording(): boolean {
        return this.isCurrentlyRecording;
    }

    resetToIdle(): void {
        this.isCurrentlyRecording = false;
        const cfg = GameConstants.SPEAK_SCENE;
        this.scene.tweens.killTweensOf(this.microBtn);
        this.microBtn.clearTint();
        this.microBtn.setScale(cfg.MICRO.SCALE);
        this.hideRecordingIndicator();
    }

    destroy(): void {
        this.voiceHandler?.destroy();
        this.recordingIndicator?.destroy();
        this.volumeBar?.destroy();
    }

    private setupVoiceHandler(): void {
        this.voiceHandler = new VoiceHandler({
            onStateChange: (state) => this.onRecordingStateChange(state),
            onVolumeChange: (volume, isAbove) => this.updateVolumeIndicator(volume, isAbove),
            onComplete: (result) => this.onRecordingComplete(result),
            onError: (error) => this.onRecordingError(error),
        });
    }

    private onRecordingStateChange(state: RecordingState): void {
        const cfg = GameConstants.SPEAK_SCENE;

        switch (state) {
            case 'calibrating':
                this.microBtn.setTint(0xffff00);
                this.showRecordingIndicator(0xffff00);
                break;

            case 'recording':
                this.microBtn.setTint(0xff0000);
                this.showRecordingIndicator(0xfffde7);
                this.startMicPulse();
                break;

            case 'processing':
            case 'idle':
            case 'starting':
                this.isCurrentlyRecording = false;
                this.scene.tweens.killTweensOf(this.microBtn);
                this.microBtn.clearTint();
                this.microBtn.setScale(cfg.MICRO.SCALE);
                this.hideRecordingIndicator();
                break;
        }
    }

    private updateVolumeIndicator(volume: number, isAboveThreshold: boolean): void {
        if (!this.volumeBar) return;

        if (this.recordingIndicator) {
            this.recordingIndicator.clear();
            const indicatorColor = isAboveThreshold ? 0x00ff00 : 0xfffde7;

            this.recordingIndicator.fillStyle(
                indicatorColor,
                isAboveThreshold ? 0.4 : 0.85
            );
            this.recordingIndicator.setPosition(this.microBtn.x, this.microBtn.y);
            this.recordingIndicator.fillCircle(0, 0, Math.max(50, Math.min(80, 45 + volume / 2)));
        }
    }

    private showRecordingIndicator(color: number): void {
        if (!this.recordingIndicator) {
            this.recordingIndicator = this.scene.add.graphics();
            this.recordingIndicator.setDepth(this.microBtn.depth - 1);
        }

        this.recordingIndicator.clear();
        this.recordingIndicator.fillStyle(color, 0.85);
        this.recordingIndicator.setPosition(this.microBtn.x, this.microBtn.y);
        this.recordingIndicator.fillCircle(0, 0, 70);
    }

    private hideRecordingIndicator(): void {
        this.recordingIndicator?.clear();
        this.volumeBar?.clear();
    }

    private startMicPulse(): void {
        const cfg = GameConstants.SPEAK_SCENE;
        this.scene.tweens.add({
            targets: this.microBtn,
            scale: { from: cfg.MICRO.SCALE, to: cfg.MICRO.SCALE + 0.08 },
            duration: 500,
            yoyo: true,
            repeat: -1,
            onStop: () => this.microBtn.setScale(cfg.MICRO.SCALE),
        });
    }

    private onRecordingComplete(result: RecordingCompleteResult): void {
        console.log(
            `[SpeakVoice] Ghi âm xong, kích thước: ${(result.audioBlob.size / 1024).toFixed(1)}KB, thời lượng: ${result.durationMs}ms`
        );
        this.callbacks.onRecordingComplete(result);
    }

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
