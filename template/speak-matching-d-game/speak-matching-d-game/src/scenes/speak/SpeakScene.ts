/**
 * SpeakScene - Màn chơi 1: Nghe và đọc lại đoạn văn
 * 
 * Flow MỚI (Line-by-Line Reading):
 * 1. Phát nhạc nền + intro
 * 2. User nhấn loa để nghe bài đồng dao (ngón tay chỉ toàn bộ 6 dòng)
 * 3. Sau đồng dao -> hiện mic + hiển thị chỉ dòng 1 (ẩn dòng 2-6 bằng white boxes)
 * 4. User nhấn mic = bắt đầu ghi âm dòng hiện tại (max 45s/dòng)
 * 5. Sau mỗi dòng: CHỜ cả finger animation VÀ recording xong -> gửi API -> reveal dòng tiếp
 * 6. Sau dòng 6: tính điểm TB làm tròn 0.5, quyết định pass/retry
 */

import SceneBase from '../SceneBase';
import { SceneKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';
import AudioManager from '../../audio/AudioManager';
import { playVoiceLocked } from '../../utils/rotateOrientation';
import { DebugGrid } from '../../utils/DebugGrid';
import { AnimationFactory } from '../../utils/AnimationFactory';

// Helper classes
import { SpeakUI, type SpeakUIElements } from './SpeakUI';
import { SpeakVoice } from './SpeakVoice';
import { ReadingFinger } from './ReadingFinger';
import { LineMaskManager } from './LineMaskManager';
import { LineScoreManager } from './LineScoreManager';

export default class SpeakScene extends SceneBase {
    // ========================================================================
    // REGION: PROPERTIES
    // ========================================================================

    // UI Elements
    private ui!: SpeakUIElements;

    // Helpers
    private speakUI!: SpeakUI;
    private speakVoice!: SpeakVoice;
    private readingFinger!: ReadingFinger;
    private lineMasks!: LineMaskManager;
    private lineScores!: LineScoreManager;
    private debugGrid!: DebugGrid;

    // Mascot Animations
    private mascotRecording!: AnimationFactory;
    private mascotProcessing!: AnimationFactory;
    private mascotHappy!: AnimationFactory;
    private mascotSad!: AnimationFactory;
    private mascotIdle!: AnimationFactory;

    // State
    private hasListened: boolean = false;
    private isMicVisible: boolean = false;
    private isReadingMode: boolean = false;  // true khi đang ở chế độ đọc từng dòng

    // Sync state cho finger animation + recording
    private pendingLineData: {
        lineIndex: number;
        audioBlob: Blob | null;
        fingerComplete: boolean;
        recordingComplete: boolean;
    } | null = null;

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
        // Register mascot animations FIRST (before createUI uses them)
        this.setupMascotAnimations();
        this.createUI();
        this.setupHelpers();
        this.initGameFlow();
        this.events.on('wake', this.handleWake, this);

        // ============================================================
        // DEBUG: Comment dòng này khi lên production
        // this.debugGrid = new DebugGrid(this);
        // this.debugGrid.draw({ showGrid: true, showReadingLines: true });
    }

    update(_time: number, delta: number) {
        this.idleManager.update(delta);
    }

    shutdown() {
        this.speakVoice?.destroy();
        this.readingFinger?.destroy();
        this.lineMasks?.destroy();
        this.debugGrid?.destroy();
        // Mascot cleanup
        this.mascotRecording?.destroy();
        this.mascotProcessing?.destroy();
        this.mascotHappy?.destroy();
        this.mascotSad?.destroy();
        this.cleanupScene();
    }

    // ========================================================================
    // REGION: SETUP
    // ========================================================================

    private setupHelpers(): void {
        // Line Masks Manager
        this.lineMasks = new LineMaskManager(this);

        // Line Score Manager
        this.lineScores = new LineScoreManager();

        // Reading Finger with callbacks
        this.readingFinger = new ReadingFinger(this, {
            onLineComplete: (lineIndex) => this.onSingleLineReadComplete(lineIndex),
            onAllLinesComplete: () => this.onListeningComplete()
        });

        // Voice Handler
        this.speakVoice = new SpeakVoice(
            this,
            this.ui.microBtn,
            this.ui.volumeBar,
            {
                onRecordingComplete: (result) => this.onLineRecordingComplete(result),
                onRecordingError: (err) => this.showRetryPopup('⚠️ ' + err)
            }
        );
        // NOTE: Mascot Animations are setup in setupMascotAnimations() which is called earlier
    }

    /**
     * Mascot animations need to be registered BEFORE createUI
     * because SpeakUI.createScoreBoardUI uses 'mascot_idle' sprite and 'mascot_idle_anim'
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
            onMicroHover: (isOver) => this.onMicroHover(isOver)
        });
    }

    protected initGameFlow(): void {
        if (this.input.keyboard) this.input.keyboard.enabled = false;

        this.startWithAudio(() => {
            this.playBgm();
            this.isGameActive = true;

            playVoiceLocked(null, 'intro-speak');

            // Hiện ngón tay chỉ vào speaker
            this.time.delayedCall(500, () => {
                this.animateHandHintTo(this.ui.speakerBtn.x, this.ui.speakerBtn.y);
            });

            const introDuration = AudioManager.getDuration('intro-speak') || 3;
            this.time.delayedCall((introDuration + 0.5) * 1000, () => {
                if (this.isGameActive) this.idleManager.start();
            });

            if (this.input.keyboard) this.input.keyboard.enabled = true;
            this.showButtons();
        });
    }

    protected showIdleHint(): void {
        if (!this.hasListened) {
            this.animateHandHintTo(this.ui.speakerBtn.x, this.ui.speakerBtn.y);
        } else if (this.isMicVisible && !this.speakVoice.isRecording) {
            this.animateHandHintTo(this.ui.microBtn.x, this.ui.microBtn.y);
        }
    }

    // ========================================================================
    // REGION: MASCOT CONTROLLERS
    // ========================================================================

    /**
     * Dừng tất cả mascot animations để chuyển sang trạng thái mới
     */
    private stopAllMascots(): void {
        this.mascotRecording?.stop();
        this.mascotProcessing?.stop();
        this.mascotHappy?.stop();
        this.mascotSad?.stop();
        this.mascotIdle?.stop();
    }

    /**
     * Hiển thị mascot idle (đứng yên)
     */
    private showMascotIdle(): void {
        this.stopAllMascots();
        this.mascotIdle.play();
    }

    // ========================================================================
    // REGION: INTERACTION HANDLERS
    // ========================================================================

    private onSpeakerClick(): void {
        if (!this.isGameActive || this.speakVoice.isRecording) return;

        const CFG = GameConstants.SPEAK_SCENE;
        this.resetIdleState();
        this.idleManager.stop();

        // Button press animation
        this.tweens.add({
            targets: this.ui.speakerBtn,
            scale: CFG.SPEAKER.SCALE - 0.1,
            duration: 100,
            yoyo: true,
            onComplete: () => this.ui.speakerBtn.setScale(CFG.SPEAKER.SCALE)
        });

        // Dừng nhạc nền trước khi phát đồng dao
        if (this.bgm && this.bgm.isPlaying) this.bgm.stop();
        AudioManager.stopAll();

        // Nếu đang ở reading mode (replay), hiện toàn bộ content trước
        if (this.isReadingMode) {
            this.lineMasks.showAllContent();
        }

        AudioManager.play('voice-speaking');
        this.hasListened = true;

        // Bắt đầu hiệu ứng ngón tay chỉ đọc toàn bộ 6 dòng
        this.readingFinger.startFullAnimation();

        // ===== Hiển thị animation miệng nói =====
        this.speakUI.showSpeakAnimation();

        const speakDuration = AudioManager.getDuration('voice-speaking') || 10;
        this.time.delayedCall(speakDuration * 1000, () => {
            if (!this.isGameActive) return;
            // Ẩn animation miệng nói khi đồng dao kết thúc
            this.speakUI.hideSpeakAnimation();

            // Nếu đang replay, ẩn lại các dòng chưa đọc
            if (this.isReadingMode) {
                this.lineMasks.hideUnreadLines();
            }
        });

        this.time.delayedCall((speakDuration + CFG.TIMING.DELAY_SHOW_MIC / 1000) * 1000, () => {
            if (!this.isGameActive) return;
            this.showMicWithHint();
        });
    }

    private onMicroClick(): void {
        if (!this.isGameActive || !this.isMicVisible) return;

        this.resetIdleState();
        this.idleManager.stop();

        const currentLine = this.lineMasks.currentLine;
        console.log(`[SpeakScene] Mic clicked, starting line ${currentLine + 1}`);

        // Reset pending state cho dòng mới
        this.pendingLineData = {
            lineIndex: currentLine,
            audioBlob: null,
            fingerComplete: false,
            recordingComplete: false
        };

        // Chuyển từ idle → recording mascot
        this.stopAllMascots();
        this.mascotRecording.play();

        // Bắt đầu ghi âm + animation ngón tay cho dòng hiện tại
        this.speakVoice.toggleForLine(currentLine);
        this.readingFinger.startSingleLineAnimation(currentLine);
    }

    private onMicroHover(isOver: boolean): void {
        if (!this.isMicVisible || this.speakVoice.isRecording) return;

        const CFG = GameConstants.SPEAK_SCENE;
        const scale = isOver ? CFG.MICRO.SCALE + 0.08 : CFG.MICRO.SCALE;
        this.ui.microBtn.setScale(scale);
    }

    // ========================================================================
    // REGION: FLOW LOGIC
    // ========================================================================

    private showMicWithHint(): void {
        this.isMicVisible = true;
        this.isReadingMode = true;

        // Hiển thị mascot idle (đứng yên) chờ user nhấn mic
        this.showMascotIdle();

        // Hiển thị masks cho reading mode (ẩn dòng 2-6)
        this.lineMasks.showMasksForReading();

        this.speakUI.showMicAnimation(this.ui.microBtn);
        AudioManager.play('intro-voice');

        this.time.delayedCall(500, () => {
            this.animateHandHintTo(this.ui.microBtn.x, this.ui.microBtn.y);
        });

        const introVoiceDuration = AudioManager.getDuration('intro-voice') || 3;
        this.time.delayedCall((introVoiceDuration + 1) * 1000, () => {
            if (this.isGameActive && !this.speakVoice.isRecording) {
                this.idleManager.start();
            }
        });
    }

    /**
     * Callback khi ngón tay chỉ xong toàn bộ (listening mode)
     */
    private onListeningComplete(): void {
        console.log('[SpeakScene] Listening complete');
    }

    /**
     * Callback khi ngón tay chỉ xong 1 dòng (reading mode)
     */
    private onSingleLineReadComplete(lineIndex: number): void {
        console.log(`[SpeakScene] Single line ${lineIndex + 1} finger animation complete`);

        // Đánh dấu finger hoàn thành
        if (this.pendingLineData && this.pendingLineData.lineIndex === lineIndex) {
            this.pendingLineData.fingerComplete = true;
            this.trySubmitLineAndProceed();
        }
    }

    /**
     * Callback khi ghi âm xong 1 dòng
     */
    private onLineRecordingComplete(result: { score: number; status: string; passed: boolean; audioBlob?: Blob }): void {
        console.log(`[SpeakScene] Recording complete callback received`);

        if (!this.pendingLineData) {
            console.warn(`[SpeakScene] No pendingLineData, ignoring recording callback`);
            return;
        }

        const lineIndex = this.pendingLineData.lineIndex;
        console.log(`[SpeakScene] Line ${lineIndex + 1} recording complete, blob size: ${result.audioBlob?.size ?? 0}`);

        // Đánh dấu recording hoàn thành (mascot sẽ stop trong trySubmitLineAndProceed)
        this.pendingLineData.recordingComplete = true;
        this.pendingLineData.audioBlob = result.audioBlob || null;
        this.trySubmitLineAndProceed();
    }

    /**
     * CHỜ cả finger animation VÀ recording xong mới gửi API + reveal dòng tiếp
     */
    private trySubmitLineAndProceed(): void {
        if (!this.pendingLineData) return;

        const { fingerComplete, recordingComplete, audioBlob, lineIndex } = this.pendingLineData;

        // Chờ cả 2 hoàn thành
        if (!fingerComplete || !recordingComplete) {
            console.log(`[SpeakScene] Waiting... finger: ${fingerComplete}, recording: ${recordingComplete}`);
            return;
        }

        console.log(`[SpeakScene] Line ${lineIndex + 1} BOTH complete, submitting API...`);

        // Dừng mascot recording → chuyển về idle CHỈ giữa các dòng (không phải dòng cuối)
        // Dòng cuối sẽ chuyển sang Processing ngay
        const totalLines = GameConstants.SPEAK_SCENE.LINE_READING.TOTAL_LINES;
        const isLastLine = (lineIndex + 1) >= totalLines;

        if (!isLastLine) {
            // Giữa các dòng: Idle
            this.showMascotIdle();
        }
        // Nếu dòng cuối, sẽ chuyển sang Processing trong onAllLinesComplete

        // Gửi API
        if (audioBlob) {
            this.lineScores.submitLineScore(lineIndex, audioBlob);
        }

        // Clear pending state
        this.pendingLineData = null;

        // Kiểm tra đã đọc hết chưa (dùng lineIndex thay vì isAllCompleted vì chưa revealNextLine)
        // Note: totalLines and isLastLine đã được khai báo ở trên

        if (isLastLine) {
            // Đã đọc xong tất cả → reveal và chuyển sang scoring
            console.log(`[SpeakScene] Last line (${lineIndex + 1}) completed, going to scoring...`);
            this.lineMasks.revealNextLine();
            this.onAllLinesComplete();
        } else {
            // Còn dòng tiếp → FLOW MỚI:
            // 1. Hiển thị mascot idle (đã set ở trên)
            // 2. DISABLE MIC để tránh click sớm
            // 3. Phát audio prompt
            // 4. Chờ audio xong → reveal dòng tiếp + enable mic
            const nextLine = this.lineMasks.currentLine + 1; // +1 vì chưa revealNextLine
            const promptKey = GameConstants.SPEAK_SCENE.LINE_READING.LINE_PROMPTS[nextLine];

            // CRITICAL: Disable mic ngay lập tức để tránh bug line index sai
            this.isMicVisible = false;
            this.ui.microBtn.setAlpha(0.3); // Visual feedback: mic mờ đi

            if (promptKey && promptKey !== 'intro-voice') {
                console.log(`[SpeakScene] Playing prompt for line ${nextLine + 1}: ${promptKey}`);
                AudioManager.play(promptKey);

                // Chờ audio prompt xong mới reveal dòng và cho nhấn mic
                const promptDuration = AudioManager.getDuration(promptKey) || 2;
                this.time.delayedCall((promptDuration + 0.3) * 1000, () => {
                    if (this.isGameActive) {
                        // Reveal dòng tiếp theo SAU KHI audio xong
                        this.lineMasks.revealNextLine();
                        console.log(`[SpeakScene] Revealed line ${this.lineMasks.currentLine + 1}, ready for mic`);

                        // RE-ENABLE mic
                        this.isMicVisible = true;
                        this.ui.microBtn.setAlpha(1);
                        this.idleManager.start();
                    }
                });
            } else {
                // Không có prompt → reveal ngay và enable mic
                this.lineMasks.revealNextLine();
                this.isMicVisible = true;
                this.ui.microBtn.setAlpha(1);
                this.idleManager.start();
            }
        }
    }

    /**
     * Callback khi đọc xong tất cả 6 dòng
     */
    private async onAllLinesComplete(): Promise<void> {
        console.log('[SpeakScene] All lines complete (animation finished), waiting for final score...');

        // Phát audio wait-grading
        const waitGradingKey = GameConstants.SPEAK_SCENE.LINE_READING.WAIT_GRADING;
        if (waitGradingKey) {
            AudioManager.play(waitGradingKey);
        }

        // Hiển thị loading board + Mascot Processing (đang chờ API trả về)
        // User request: "khi nộp bài trạng thái 2" = Processing
        this.speakUI.showLoadingBoard('');
        this.stopAllMascots();
        this.mascotProcessing.play(); // Main mascot = Processing while waiting for score

        try {
            // Chờ tất cả API và lấy điểm TB (hệ 10)
            const finalScore = await this.lineScores.getFinalScore();

            // Logic Pass/Retry
            // User request: 
            // 1. "nếu như điểm nằm trong 4-5 điểm thì bé sẽ phải đọc lại"
            // 2. Pass logic: >= 7 (Pass Threshold)
            // 3. Retry logic: < 7

            const isRetryRange = finalScore >= 4 && finalScore <= 5;
            const passed = finalScore >= GameConstants.VOICE_RECORDING.PASS_THRESHOLD;

            console.log(`[SpeakScene] Final score: ${finalScore}/10, passed: ${passed}, isRetryRange: ${isRetryRange}`);

            // Dừng mascot Processing (loading xong)
            this.mascotProcessing.stop();

            // Hiển thị Score Board (vẫn giữ board trắng)
            this.speakUI.showScoreBoard(finalScore);

            // Phát audio điểm: score_4.mp3, score_5.mp3, ..., score_10.mp3
            const scoreAudioKey = `score-${finalScore}`;
            AudioManager.play(scoreAudioKey);
            console.log(`[SpeakScene] Playing score audio: ${scoreAudioKey}`);

            if (passed) {
                // --- CASE 1: PASS (>= 7) ---
                this.mascotHappy.play();

                // Delay chuyển màn (đã tăng thêm 1s trong GameConstants)
                this.time.delayedCall(GameConstants.SPEAK_SCENE.TIMING.DELAY_NEXT_SCENE, () => {
                    this.mascotHappy.stop();
                    this.speakUI.hideScoreBoard();
                    this.nextScene();
                });

            } else {
                // --- CASE 2: FAIL (< 7) ---
                this.mascotSad.play();

                if (isRetryRange) {
                    // Special Retry Logic for 4-5 score:
                    // "quay về thời điểm khi vừa hết phần đọc mẫu bài đồng giao(lưu ý reset state các phần liên quan cho hoạt động ổn định)"
                    console.log('[SpeakScene] Score 4-5 -> Auto retry from post-intro');

                    this.time.delayedCall(GameConstants.SPEAK_SCENE.TIMING.DELAY_NEXT_SCENE, () => {
                        this.mascotSad.stop();
                        this.speakUI.hideScoreBoard();
                        this.resetForRetryMidGame();
                    });

                } else {
                    // Normal Retry (Manual reset button or just show status?)
                    // Current logic was showing popup. Now we show score board.
                    // We should probably allow them to try again or just auto reset?
                    // Assuming similar behavior: Auto reset after delay for consistency or show retry button?
                    // The old code had `showRetryPopup`. 
                    // Let's stick to auto-reset for now to keep flow smooth, or similar to 4-5 case but maybe different message?
                    // User didn't specify different behavior for <4 or 6. 
                    // But 4-5 request was specific about "quay về thời điểm...".
                    // Let's apply a general retry mechanism but specifically reset to post-intro for 4-5.
                    // For others, maybe full reset?
                    // Let's assume standard behavior is needed which is usually a retry.

                    this.time.delayedCall(GameConstants.SPEAK_SCENE.TIMING.DELAY_NEXT_SCENE, () => {
                        this.mascotSad.stop();
                        this.speakUI.hideScoreBoard();
                        // Reset to same point effectively
                        this.resetForRetryMidGame();
                    });
                }
            }

        } catch (err) {
            console.error('[SpeakScene] Error getting final score:', err);
            this.speakUI.hideScoreBoard();
            this.showRetryPopup('❌ Lỗi! Hãy thử lại.');
            this.time.delayedCall(2000, () => {
                this.speakUI.hideSuccessPopup(this.ui.popup, this.ui.popupText);
                this.resetForRetryMidGame();
            });
        }
    }

    /**
     * Reset lại state để thử lại (quay về thời điểm sau khi đọc mẫu intro)
     * "Reset state các phần liên quan cho hoạt động ổn định"
     */
    private resetForRetryMidGame(): void {
        console.log('[SpeakScene] Resetting for retry (Mid-Game State)...');

        // 1. Reset Logic Helpers
        this.lineMasks.resetStates(); // Che lại tất cả
        this.lineScores.reset();      // Xóa điểm cũ

        // 2. Reset UI State
        this.isMicVisible = true;
        this.isReadingMode = true;

        // 3. UI Visuals
        // Ẩn mic animation nếu đang chạy, nhưng showMicWithHint sẽ gọi lại
        // Chúng ta cần đưa về trạng thái "Vừa hết intro đồng dao"
        // Tức là: 
        // - Mascot Idle
        // - Mask đang ở reading mode (dòng 1 hiện, còn lại che)
        // - Mic hiện và Hint hand chỉ vào Mic

        this.showMascotIdle();
        this.lineMasks.showMasksForReading();

        // Gọi lại flow hiển thị Mic
        // Lưu ý: showMicWithHint sẽ play 'intro-voice' again. User defined "vừa hết phần đọc mẫu".
        // Tức là lúc User chuẩn bị nhấn Mic để đọc.
        this.showMicWithHint();
    }

    // ========================================================================
    // REGION: POPUP HELPERS
    // ========================================================================

    private showRetryPopup(message: string): void {
        this.speakUI.showSuccessPopup(this.ui.popup, this.ui.popupText, message);
        AudioManager.play('sfx-wrong');
    }

    private nextScene(): void {
        this.scene.start(SceneKeys.UnderlineScene);
    }

    // ========================================================================
    // REGION: PUBLIC API
    // ========================================================================

    public restartIntro(): void {
        this.resetIdleState();
        this.idleManager.stop();
        this.hasListened = false;
        this.isMicVisible = false;
        this.isReadingMode = false;
        this.ui.microBtn.setAlpha(0);
        this.speakVoice?.destroy();
        this.lineMasks?.destroy();
        this.setupHelpers();
        this.initGameFlow();
    }
}
