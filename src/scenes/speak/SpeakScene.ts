/**
 * SpeakScene - Màn chơi: Đếm toa tàu
 *
 * Flow:
 * 1. Phát nhạc nền + intro
 * 2. Voice "Con hãy đếm số toa tàu..." → hand chỉ toa → voice "Toa thứ nhất"
 * 3. Voice "Bây giờ bé hãy nhấn vào mic..." → hand chỉ mic
 * 4. Bé nhấn mic → ghi âm → gửi API → kiểm tra đúng/sai
 * 5. Đúng → chuyển level tiếp | Sai → thử lại (max 3 lần)
 * 6. Hoàn thành 5 levels → chuyển EndGame
 */

import SceneBase from '../SceneBase';
import { SceneKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';
import AudioManager from '../../audio/AudioManager';
import { AnimationFactory } from '../../utils/AnimationFactory';
import { changeBackground } from '../../utils/BackgroundManager';

// Helper modules
import { SpeakUI, type SpeakUIElements } from './SpeakUI';
import { SpeakVoice } from './SpeakVoice';
import { ReadingFinger } from './ReadingFinger';
import { VoiceHandler } from '../../voice/VoiceHandler';
import { DebugGrid } from '../../utils/DebugGrid';

export default class SpeakScene extends SceneBase {
    // ========================================================================
    // REGION: PROPERTIES
    // ========================================================================

    // UI Elements (from SpeakUI)
    private ui!: SpeakUIElements;

    // Helpers
    private speakUI!: SpeakUI;
    private speakVoice!: SpeakVoice;
    private readingFinger!: ReadingFinger;
    private voiceHandler!: VoiceHandler;
    private debugGrid!: DebugGrid;

    // Mascot Animations
    private mascotRecording!: AnimationFactory;
    private mascotProcessing!: AnimationFactory;
    private mascotHappy!: AnimationFactory;
    private mascotSad!: AnimationFactory;
    private mascotIdle!: AnimationFactory;

    // State
    private currentLevel: number = 0;
    private retryCount: number = 0;
    private isMicVisible: boolean = false;
    private isRecordingActive: boolean = false;

    // ========================================================================
    // REGION: LIFECYCLE
    // ========================================================================

    constructor() {
        super(SceneKeys.SpeakScene);
    }

    create() {
        this.setupSystem();
        this.setupBackgroundAndAudio();
        this.createHandHint();
        this.setupMascotAnimations();
        this.createUI();
        this.setupHelpers();
        this.initGameFlow();
        this.events.on('wake', this.handleWake, this);
        // DEBUG: Comment dòng này khi lên production
        // this.debugGrid = new DebugGrid(this);
        // this.debugGrid.draw({ showGrid: true, showReadingLines: true });
    }

    update(_time: number, delta: number) {
        this.idleManager.update(delta);
    }

    shutdown() {
        this.speakVoice?.destroy();
        this.debugGrid?.destroy();

        this.readingFinger?.destroy();
        this.voiceHandler?.destroy();
        this.mascotRecording?.destroy();
        this.mascotProcessing?.destroy();
        this.mascotHappy?.destroy();
        this.mascotSad?.destroy();
        this.mascotIdle?.destroy();
        this.cleanupScene();
    }

    // ========================================================================
    // REGION: SETUP
    // ========================================================================

    private setupHelpers(): void {
        // VoiceHandler for API calls
        this.voiceHandler = new VoiceHandler();

        // ReadingFinger for counting animation
        this.readingFinger = new ReadingFinger(this);

        // SpeakVoice for recording + mic UI
        this.speakVoice = new SpeakVoice(
            this,
            this.ui.microBtn,
            this.ui.volumeBar,
            {
                onRecordingComplete: (result) => this.onRecordingComplete(result.audioBlob),
                onRecordingError: (err) => this.onRecordingError(err),
            }
        );
    }

    /**
     * Register mascot animations BEFORE createUI
     */
    private setupMascotAnimations(): void {
        const MASCOT = GameConstants.MASCOT_ANIMATIONS;
        this.mascotRecording = new AnimationFactory(this, { ...MASCOT, ...MASCOT.RECORDING });
        this.mascotProcessing = new AnimationFactory(this, { ...MASCOT, ...MASCOT.PROCESSING });
        this.mascotHappy = new AnimationFactory(this, { ...MASCOT, ...MASCOT.RESULT_HAPPY });
        this.mascotSad = new AnimationFactory(this, { ...MASCOT, ...MASCOT.RESULT_SAD });
        this.mascotIdle = new AnimationFactory(this, { ...MASCOT, ...MASCOT.IDLE });
    }

    protected createUI(): void {
        this.speakUI = new SpeakUI(this);
        this.ui = this.speakUI.createAll({
            onSpeakerClick: () => this.onSpeakerClick(),
            onMicroClick: () => this.onMicroClick(),
        });
    }
    // flow game
    protected initGameFlow(): void {
        this.currentLevel = 0;
        this.retryCount = 0;

        this.startWithAudio(() => {
            this.playBgm();
            this.isGameActive = true;
            this.showButtons();
            this.startLevel(0);
        });
    }

    protected showIdleHint(): void {
        if (this.isMicVisible && !this.isRecordingActive) {
            this.animateHandHintTo(this.ui.microBtn.x, this.ui.microBtn.y);
        }
    }

    // ========================================================================
    // REGION: MASCOT CONTROLLERS
    // ========================================================================

    private stopAllMascots(): void {
        this.mascotRecording?.stop();
        this.mascotProcessing?.stop();
        this.mascotHappy?.stop();
        this.mascotSad?.stop();
        this.mascotIdle?.stop();
    }

    private showMascotIdle(): void {
        this.stopAllMascots();
        this.mascotIdle.play();
    }

    // ========================================================================
    // REGION: GAME FLOW
    // ========================================================================

    /**
     * Start a level
     */
    private startLevel(levelIndex: number): void {
        const LEVELS = GameConstants.SPEAK_SCENE.LEVELS;
        if (levelIndex >= LEVELS.length) {
            this.onAllLevelsComplete();
            return;
        }

        this.currentLevel = levelIndex;
        this.retryCount = 0;
        this.isMicVisible = false;
        this.isRecordingActive = false;

        const level = LEVELS[levelIndex];
        console.log(`[SpeakScene] Level ${level.number}: ${level.trainCars} toa tàu`);

        // Change background
        changeBackground(level.bg);

        // Hide old result + buttons
        this.ui.resultText.setAlpha(0);
        this.ui.microBtn.setAlpha(0);
        this.ui.speakerBtn.setAlpha(0);

        // Show mascot idle
        this.showMascotIdle();

        // Show train with animation → then start voice guide
        this.speakUI.showTrainAnimation(this.ui.trainImage, level.trainKey, () => {
            this.startVoiceGuide();
        });
    }

    /**
     * Voice guide flow after train appears
     *
     * FLOW:
     * 1. Intro → "intro-speak" (only on first level)
     * 2. Voice "Con hãy đếm số toa tàu..."
     * 3. Hand chỉ toa + voice "Toa thứ nhất"
     * 4. Voice "Bây giờ bé hãy nhấn vào mic..."
     * 5. Hand chỉ mic → ready for mic
     */
    private startVoiceGuide(): void {
        const TIMING = GameConstants.SPEAK_SCENE.TIMING;

        this.time.delayedCall(TIMING.DELAY_SHOW_MIC, () => {
            // Show buttons
            this.ui.speakerBtn.setAlpha(1);

            // Step 1: Play intro (only first time)
            if (this.currentLevel === 0) {
                console.log('[SpeakScene] Step 1: Play intro-speak');
                AudioManager.playWithCallback('intro-speak', () => {
                    this.playInstructionSequence();
                });
            } else {
                // Skip intro on subsequent levels, go straight to instructions
                this.playInstructionSequence();
            }
        });
    }

    /**
     * Play instructions: đếm toa tàu → chỉ toa → nhấn mic
     */
    private playInstructionSequence(): void {
        const level = GameConstants.SPEAK_SCENE.LEVELS[this.currentLevel];
        const countVoiceKey = `voice-count-${level.trainCars}`;

        // Step 2: Voice "Con hãy đếm số toa tàu..."
        console.log('[SpeakScene] Step 2: Voice count trains');
        AudioManager.playWithCallback('voice-dem-toa-tau', () => {

            // Step 3: Ngón tay chỉ từng toa + voice đếm (1, 2, 3... theo level)
            console.log(`[SpeakScene] Step 3: Finger sweep level ${this.currentLevel}`);
            this.readingFinger.countForLevel(this.currentLevel);
            AudioManager.playWithCallback(countVoiceKey, () => {

                // Step 4: Voice "Nhấn mic"
                console.log('[SpeakScene] Step 4: Voice press mic');
                AudioManager.playWithCallback('voice-nhan-mic', () => {

                    // Step 5: Show mic + hand → ready
                    console.log('[SpeakScene] Step 5: Show mic, waiting');
                    this.showMicWithHint();
                });
            });
        });
    }

    /**
     * Show mic button with hand hint
     */
    private showMicWithHint(): void {
        this.isMicVisible = true;

        // Show mic with animation
        this.speakUI.showMicAnimation(this.ui.microBtn);

        // Hand hint to mic after short delay
        this.time.delayedCall(500, () => {
            this.animateHandHintTo(this.ui.microBtn.x, this.ui.microBtn.y);
        });

        // Start idle timer
        this.time.delayedCall(2000, () => {
            if (this.isGameActive && !this.isRecordingActive) {
                this.idleManager.start();
            }
        });
    }

    // ========================================================================
    // REGION: INTERACTION HANDLERS
    // ========================================================================

    /**
     * When child clicks Mic
     */
    private onMicroClick(): void {
        if (!this.isGameActive || !this.isMicVisible || this.isRecordingActive) return;

        console.log('[SpeakScene] Mic clicked');
        this.resetIdleState();
        this.idleManager.stop();
        this.isRecordingActive = true;

        // Switch mascot to recording
        this.stopAllMascots();
        this.mascotRecording.play();

        // Start recording via SpeakVoice (handles glow + tint + pulse)
        this.speakVoice.startRecording();
    }

    /**
     * When child clicks Speaker (replay instructions)
     */
    private onSpeakerClick(): void {
        if (!this.isGameActive || this.isRecordingActive) return;

        console.log('[SpeakScene] Speaker clicked');
        this.resetIdleState();
        this.idleManager.stop();

        // Button press animation
        this.speakUI.speakerPressEffect(this.ui.speakerBtn);

        // Replay instruction sequence
        this.playInstructionSequence();
    }

    // ========================================================================
    // REGION: RECORDING CALLBACKS
    // ========================================================================

    /**
     * When recording completes successfully
     */
    private async onRecordingComplete(audioBlob: Blob): Promise<void> {
        console.log(`[SpeakScene] Recording complete, size: ${(audioBlob.size / 1024).toFixed(1)}KB`);

        // Switch mascot to processing
        this.stopAllMascots();
        this.mascotProcessing.play();

        // Send to API
        const level = GameConstants.SPEAK_SCENE.LEVELS[this.currentLevel];
        const speechResult = await this.voiceHandler.sendToAPI(audioBlob, level.trainCars);

        // Stop processing mascot
        this.mascotProcessing.stop();

        // Reset recording UI
        this.speakVoice.resetToIdle();
        this.isRecordingActive = false;

        if (speechResult.success && speechResult.spokenNumber !== undefined) {
            this.checkAnswer(speechResult.spokenNumber, level.trainCars);
        } else {
            console.warn('[SpeakScene] API error:', speechResult.error);
            this.showResult(false, 'Thử lại nhé!');
        }
    }

    /**
     * When recording fails
     */
    private onRecordingError(error: string): void {
        console.warn('[SpeakScene] Recording error:', error);
        this.speakVoice.resetToIdle();
        this.isRecordingActive = false;
        this.showMascotIdle();
        this.showResult(false, 'Thử lại nhé!');
    }

    // ========================================================================
    // REGION: RESULTS
    // ========================================================================

    /**
     * Check answer
     */
    private checkAnswer(spoken: number, expected: number): void {
        const isCorrect = spoken === expected;
        console.log(`[SpeakScene] Said: ${spoken}, Expected: ${expected} → ${isCorrect ? '✅' : '❌'}`);

        if (isCorrect) {
            // Correct! Show happy mascot
            this.stopAllMascots();
            this.mascotHappy.play();
            this.showResult(true, `🎉 Đúng rồi! ${expected} toa tàu!`);
        } else {
            // Wrong! Show sad mascot
            this.stopAllMascots();
            this.mascotSad.play();

            this.retryCount++;
            const maxRetries = GameConstants.VOICE_RECORDING.MAX_RETRIES;
            if (this.retryCount >= maxRetries) {
                this.showResult(false, `Đáp án là ${expected} toa tàu!`);
            } else {
                this.showResult(false, `Chưa đúng! Thử lại nhé! (${this.retryCount}/${maxRetries})`);
            }
        }
    }

    /**
     * Show result text
     */
    private showResult(isCorrect: boolean, message: string): void {
        // SFX
        try {
            AudioManager.play(isCorrect ? 'sfx-correct' : 'sfx-wrong');
        } catch (e) { /* ignore */ }

        // Show result text
        this.speakUI.showResult(this.ui.resultText, isCorrect, message);

        // Next action
        const TIMING = GameConstants.SPEAK_SCENE.TIMING;

        if (isCorrect) {
            // Correct → next level after delay
            this.time.delayedCall(TIMING.DELAY_NEXT_LEVEL, () => {
                this.mascotHappy.stop();
                this.transitionToNextLevel();
            });
        } else {
            const maxRetries = GameConstants.VOICE_RECORDING.MAX_RETRIES;
            if (this.retryCount >= maxRetries) {
                // Out of retries → next level
                this.time.delayedCall(TIMING.DELAY_NEXT_LEVEL, () => {
                    this.mascotSad.stop();
                    this.transitionToNextLevel();
                });
            } else {
                // Retry
                this.time.delayedCall(GameConstants.VOICE_RECORDING.RETRY_DELAY, () => {
                    this.mascotSad.stop();
                    this.showMascotIdle();
                    this.speakUI.hideResult(this.ui.resultText);
                    this.isMicVisible = true;
                    this.animateHandHintTo(this.ui.microBtn.x, this.ui.microBtn.y);
                });
            }
        }
    }

    /**
     * Transition to next level
     */
    private transitionToNextLevel(): void {
        const targets = [this.ui.trainImage, this.ui.microBtn, this.ui.speakerBtn, this.ui.resultText];
        this.tweens.add({
            targets,
            alpha: 0,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
                this.startLevel(this.currentLevel + 1);
            }
        });
    }

    /**
     * All 5 levels complete
     */
    private onAllLevelsComplete(): void {
        console.log('[SpeakScene] All 5 levels complete!');
        this.stopAllMascots();
        this.scene.start(SceneKeys.EndGame);
    }
}
