/**
 * SpeakVoice - Quản lý logic ghi âm giọng nói cho game đếm toa tàu
 *
 * Features:
 * - Ghi âm mic thật qua VoiceHandler (async/await)
 * - Recording indicator (vòng tròn glow + tint mic)
 * - Volume bar real-time
 * - Mic pulse animation khi đang ghi âm
 * - Tự động dừng khi hết thời gian
 */
import Phaser from 'phaser';
import { VoiceHandler } from '../../voice/VoiceHandler';
import { GameConstants } from '../../consts/GameConstants';

export interface SpeakVoiceCallbacks {
    onRecordingComplete: (result: { audioBlob: Blob }) => void;
    onRecordingError: (error: string) => void;
}

export class SpeakVoice {
    private scene: Phaser.Scene;
    private voiceHandler: VoiceHandler;
    private microBtn: Phaser.GameObjects.Image;
    private volumeBar: Phaser.GameObjects.Graphics;
    private callbacks: SpeakVoiceCallbacks;

    // Recording UI state
    private micGlow: Phaser.GameObjects.Graphics | null = null;
    private isCurrentlyRecording: boolean = false;
    private recordingTimeout: Phaser.Time.TimerEvent | null = null;

    // Colors
    private static readonly GLOW_COLOR = 0xFFFDE7;
    private static readonly MIC_TINT_RECORDING = 0x6D9E51; // Green when recording
    private static readonly MIC_TINT_PROCESSING = 0x2196F3; // Blue when processing
    private static readonly VOLUME_ACTIVE = 0x00FF00;
    private static readonly VOLUME_INACTIVE = 0x666666;

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
        this.voiceHandler = new VoiceHandler();
    }

    // ==============================
    // PUBLIC API
    // ==============================

    /**
     * Start recording - called when child presses mic
     */
    async startRecording(): Promise<void> {
        if (this.isCurrentlyRecording) return;

        this.isCurrentlyRecording = true;
        console.log('[SpeakVoice] Starting recording...');

        // Show recording UI
        this.showRecordingState();

        // Set max recording timeout
        const maxDuration = GameConstants.VOICE_RECORDING.MAX_DURATION;
        this.recordingTimeout = this.scene.time.delayedCall(maxDuration, () => {
            console.log('[SpeakVoice] Max duration reached, stopping...');
            this.voiceHandler.stopRecording();
        });

        // Start actual recording
        const result = await this.voiceHandler.startRecording();

        // Recording finished
        this.isCurrentlyRecording = false;
        this.clearRecordingTimeout();

        if (result.success && result.audioBlob) {
            console.log(`[SpeakVoice] Recording complete, size: ${(result.audioBlob.size / 1024).toFixed(1)}KB`);
            this.showProcessingState();
            this.callbacks.onRecordingComplete({ audioBlob: result.audioBlob });
        } else {
            console.warn('[SpeakVoice] Recording failed:', result.error);
            this.hideRecordingUI();
            this.callbacks.onRecordingError(result.error || 'Unknown error');
        }
    }

    /**
     * Stop recording manually
     */
    stopRecording(): void {
        this.voiceHandler.stopRecording();
    }

    /**
     * Check if currently recording
     */
    get isRecording(): boolean {
        return this.isCurrentlyRecording;
    }

    /**
     * Reset mic to idle state (after result shown)
     */
    resetToIdle(): void {
        this.hideRecordingUI();
        const CFG = GameConstants.SPEAK_SCENE;
        this.microBtn.clearTint();
        this.microBtn.setScale(CFG.MICRO.SCALE);
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.voiceHandler?.destroy();
        this.clearRecordingTimeout();
        this.micGlow?.destroy();
        this.volumeBar?.destroy();
    }

    // ==============================
    // RECORDING UI STATES
    // ==============================

    /**
     * Show recording state: glow + tint green + pulse
     */
    private showRecordingState(): void {
        // Glow circle behind mic
        this.showMicGlow();

        // Tint mic green
        this.microBtn.setTint(SpeakVoice.MIC_TINT_RECORDING);

        // Pulse animation
        this.startMicPulse();
    }

    /**
     * Show processing state: tint blue, stop pulse
     */
    private showProcessingState(): void {
        // Stop pulse
        this.scene.tweens.killTweensOf(this.microBtn);
        const CFG = GameConstants.SPEAK_SCENE;
        this.microBtn.setScale(CFG.MICRO.SCALE);

        // Tint blue
        this.microBtn.setTint(SpeakVoice.MIC_TINT_PROCESSING);

        // Hide glow
        this.hideMicGlow();
    }

    /**
     * Hide all recording UI
     */
    hideRecordingUI(): void {
        // Stop pulse
        this.scene.tweens.killTweensOf(this.microBtn);
        const CFG = GameConstants.SPEAK_SCENE;
        this.microBtn.setScale(CFG.MICRO.SCALE);
        this.microBtn.clearTint();

        // Hide glow
        this.hideMicGlow();

        // Clear volume bar
        this.volumeBar?.clear();
    }

    // ==============================
    // MIC GLOW (Yellow circle)
    // ==============================

    private showMicGlow(): void {
        if (!this.micGlow) {
            this.micGlow = this.scene.add.graphics().setDepth(49);
        }

        this.micGlow.clear();
        this.micGlow.fillStyle(SpeakVoice.GLOW_COLOR, 0.85);
        this.micGlow.fillCircle(this.microBtn.x, this.microBtn.y, 45);
        this.micGlow.setAlpha(1);

        // Pulse glow
        this.scene.tweens.add({
            targets: this.micGlow,
            alpha: { from: 1, to: 0.4 },
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private hideMicGlow(): void {
        if (this.micGlow) {
            this.scene.tweens.killTweensOf(this.micGlow);
            this.micGlow.clear();
            this.micGlow.setAlpha(0);
        }
    }

    // ==============================
    // MIC PULSE ANIMATION
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
    // HELPERS
    // ==============================

    private clearRecordingTimeout(): void {
        if (this.recordingTimeout) {
            this.recordingTimeout.destroy();
            this.recordingTimeout = null;
        }
    }
}
