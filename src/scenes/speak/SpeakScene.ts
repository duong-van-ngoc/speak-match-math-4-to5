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
import { DebugGrid } from '../../utils/DebugGrid';
import { voice } from '@iruka-edu/mini-game-sdk';
/**
 * Lược đồ (Schema) cho payload targetText
 * Đảm bảo dữ liệu gửi đi ở dạng dictionary hoặc chuỗi hợp lệ, không bị lỗi ép kiểu sang integer.
 */
interface TargetTextPayload {
    text: string;
    value: number;
    aliases?: string[];
}

export default class SpeakScene extends SceneBase {
    // ========================================================================
    // KHU VỰC: THUỘC TÍNH (PROPERTIES)
    // ========================================================================

    // Các thành phần UI (kế thừa từ SpeakUI)
    private ui!: SpeakUIElements;

    // Các lớp hỗ trợ (Helpers)
    private speakUI!: SpeakUI;
    private speakVoice!: SpeakVoice;
    private readingFinger!: ReadingFinger;
    private debugGrid!: DebugGrid;

    // Các hoạt ảnh của Mascot
    private mascotRecording!: AnimationFactory;
    private mascotProcessing!: AnimationFactory;
    private mascotHappy!: AnimationFactory;
    private mascotSad!: AnimationFactory;
    private mascotIdle!: AnimationFactory;

    // Quản lý trạng thái
    private currentLevel: number = 0;
    private retryCount: number = 0;
    private levelScores: number[] = [0, 0, 0, 0, 0];
    private isMicVisible: boolean = false;
    private isRecordingActive: boolean = false;

    // Quản lý SDK Session
    private voiceSessionStarted: boolean = false;

    private speakerActiveTween: Phaser.Tweens.Tween | null = null;

    // ========================================================================
    // KHU VỰC: VÒNG ĐỜI (LIFECYCLE)
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
        this.mascotRecording?.destroy();
        this.mascotProcessing?.destroy();
        this.mascotHappy?.destroy();
        this.mascotSad?.destroy();
        this.mascotIdle?.destroy();
        this.cleanupScene();
    }

    // ========================================================================
    // KHU VỰC: THIẾT LẬP (SETUP)
    // ========================================================================

    private setupHelpers(): void {
        // Cài đặt ReadingFinger phục vụ hiển thị bàn tay đếm toa
        this.readingFinger = new ReadingFinger(this);

        // Cài đặt SpeakVoice để xử lý logic ghi âm và UI của mic
        this.speakVoice = new SpeakVoice(
            this,
            this.ui.microBtn,
            this.ui.volumeBar,
            {
                onRecordingComplete: (result) => this.onRecordingComplete(result.audioBlob, result.durationMs),
                onRecordingError: (err) => this.onRecordingError(err),
            }
        );
    }

    /**
     * Khởi tạo các Animation của Mascot TRƯỚC KHI tạo giao diện chính
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
        this.voiceSessionStarted = false;

        this.startWithAudio(() => {
            // 1. Tạm tắt keyboard trong lúc setup
            if (this.input.keyboard) this.input.keyboard.enabled = false;

            // 2. Hiện loa (speaker) NGAY LẬP TỨC 
            this.ui.speakerBtn.setVisible(true);
            this.ui.speakerBtn.setAlpha(1);
            this.showButtons();

            // 3. Play BGM và đánh dấu active
            this.playBgm();
            this.isGameActive = true;

            // 4. Khởi động Voice Session ngay lúc bắt đầu Game
            this.ensureVoiceSession().catch(e => console.error('[SpeakScene] StartSession failed:', e));

            // 5. Bắt đầu tải Level 0
            // Việc phát intro sẽ do startVoiceGuide đảm nhiệm sau khi tàu đã trượt ra.
            this.startLevel(0);
        });
    }

    protected showIdleHint(): void {
        if (this.isMicVisible && !this.isRecordingActive) {
            this.animateHandHintTo(this.ui.microBtn.x, this.ui.microBtn.y);
        }
    }

    // ========================================================================
    // KHU VỰC: ĐIỀU KHIỂN MASCOT
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
    // KHU VỰC: LUỒNG TRÒ CHƠI (GAME FLOW)
    // ========================================================================

    /**
     * Khởi động một màn chơi (level)
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

        // Cài đặt hình nền phù hợp cho level
        changeBackground(level.bg);

        // Ẩn kết quả cũ và các nút tĩnh trước đó
        this.ui.resultText.setAlpha(0);
        this.ui.microBtn.setAlpha(0);

        // Chỉ ẩn loa nếu KHÔNG PHẢI level 0 (Vì level 0 Loa đang cần hiện sẵn cho Intro)
        if (levelIndex > 0) {
            this.ui.speakerBtn.setAlpha(0);
        }

        // Hiện trạng thái nghỉ tiêu chuẩn của mascot
        this.showMascotIdle();

        // Hiển thị tàu trượt vào bằng animation
        this.speakUI.showTrainAnimation(this.ui.trainImage, level.trainKey, () => {
            this.startVoiceGuide();
        });
    }

    /**
     * Quy trình chạy luồng Giọng nói hướng dẫn sau khi tàu xuất hiện
     *
     * TRÌNH TỰ (FLOW):
     * 1. Nhạc Intro → "intro-speak" (Chỉ chạy ở level 0)
     * 2. Voice hướng dẫn "Con hãy đếm số toa tàu..."
     * 3. Bàn tay di chuyển chỉ toa + Voice đếm "Toa thứ nhất,.."
     * 4. Voice "Bây giờ bé hãy nhấn vào mic..."
     * 5. Bàn tay chỉ vào mic → Vào trạng thái sẵn sàng nghi âm (ready for mic)
     */
    private startVoiceGuide(): void {
        const TIMING = GameConstants.SPEAK_SCENE.TIMING;

        if (this.currentLevel === 0) {
            // Level 0: Phát intro-speak ngay lập tức (sau khi tàu đã xuất hiện)
            console.log('[SpeakScene] Step 1: Phát intro-speak');

            // Bật delay hiệu ứng loa rung chờ đến khi thực sự nói ("Hôm nay...")
            const introDelay = TIMING.DELAY_INTRO_SPEAKER || 200;
            const introAnimTimer = this.time.delayedCall(introDelay, () => {
                // Check if intro is still playing and game is active
                if (this.isGameActive && !this.isRecordingActive) {
                    this.startSpeakerActiveAnim();
                    this.speakUI.startSpeakerAnimation(this.ui.speakerBtn);
                }
            });

            AudioManager.playWithCallback('intro-speak', () => {
                introAnimTimer.destroy(); // Cancel if audio finishes super early
                this.stopSpeakerActiveAnim();
                this.speakUI.stopSpeakerAnimation();

                // Hết intro -> HIỆN TAY CHỈ VÀO LOA
                this.animateHandHintTo(this.ui.speakerBtn.x, this.ui.speakerBtn.y);

                if (this.isGameActive) this.idleManager.start();
                if (this.input.keyboard) this.input.keyboard.enabled = true;
            });

            return;
        }

        // Các level tiếp theo
        this.time.delayedCall(TIMING.DELAY_SHOW_MIC, () => {
            // Hiện nút loa (đứng yên)
            this.ui.speakerBtn.setAlpha(1);

            // Hiện tay chỉ loa luôn, chờ bé click
            this.time.delayedCall(100, () => {
                this.speakUI.showHandToSpeaker(this.ui.speakerBtn);
            });

            this.time.delayedCall(2000, () => {
                if (this.isGameActive) {
                    this.idleManager.start();
                }
            });
        });
    }

    /**
     * Chuỗi hướng dẫn phát: đếm toa tàu → chỉ hướng → nhấn mic
     */
    private playInstructionSequence(): void {
        const level = GameConstants.SPEAK_SCENE.LEVELS[this.currentLevel];
        const countVoiceKey = `voice-count-${level.trainCars}`;

        // Bước 2: Voice "Con hãy đếm số toa tàu..."
        console.log('[SpeakScene] Step 2: Voice count trains');
        this.startSpeakerActiveAnim();
        this.speakUI.startSpeakerAnimation(this.ui.speakerBtn);
        AudioManager.playWithCallback('voice-dem-toa-tau', () => {

            // Bước 3: Ngón tay lướt qua từng toa + voice đếm (1, 2, 3... theo level)
            console.log(`[SpeakScene] Step 3: Finger sweep level ${this.currentLevel}`);
            this.readingFinger.countForLevel(this.currentLevel);

            this.startSpeakerActiveAnim();
            this.speakUI.startSpeakerAnimation(this.ui.speakerBtn);
            AudioManager.playWithCallback(countVoiceKey, () => {

                // Dừng nhép miệng/loa trong lúc chờ delay
                this.stopSpeakerActiveAnim();
                this.speakUI.stopSpeakerAnimation();

                const delay = GameConstants.SPEAK_SCENE.TIMING.DELAY_BEFORE_MIC || 1000;

                this.time.delayedCall(delay, () => {
                    // Bước 4: Voice "Bây giờ bé hãy nhấn vào mic..."
                    console.log('[SpeakScene] Step 4: Voice press mic');
                    this.startSpeakerActiveAnim();
                    this.speakUI.startSpeakerAnimation(this.ui.speakerBtn);
                    AudioManager.playWithCallback('voice-nhan-mic', () => {

                        // Bước 5: Hiện nút mic + bàn tay gọi ý → sẵn sàng
                        console.log('[SpeakScene] Step 5: Show mic, waiting');
                        this.stopSpeakerActiveAnim();
                        this.speakUI.stopSpeakerAnimation();
                        this.showMicWithHint();
                    });
                });
            });
        });
    }

    /**
     * Hiện nút mic cùng với gợi ý bàn tay
     */
    private showMicWithHint(): void {
        this.isMicVisible = true;

        // Hiện mic với hoạn ảnh (animation)
        this.speakUI.showMicAnimation(this.ui.microBtn);

        // Bàn tay chỉ thẳng vào mic sau một khoảng trễ ngắn
        this.time.delayedCall(500, () => {
            this.animateHandHintTo(this.ui.microBtn.x, this.ui.microBtn.y);
        });

        // Bắt đầu đếm thời gian nhàn rỗi (idle timer) để gợi ý lại
        this.time.delayedCall(2000, () => {
            if (this.isGameActive && !this.isRecordingActive) {
                this.idleManager.start();
            }
        });
    }

    // ========================================================================
    // KHU VỰC: KHỚP NỐI TƯƠNG TÁC (INTERACTION HANDLERS)
    // ========================================================================

    /**
     * Khi bé nhấn vào phần Mic
     */
    private onMicroClick(): void {
        if (!this.isGameActive || !this.isMicVisible || this.isRecordingActive) return;

        console.log('[SpeakScene] Mic clicked');
        this.resetIdleState();
        this.idleManager.stop();
        this.isRecordingActive = true;

        this.stopSpeakerActiveAnim();
        this.speakUI.stopSpeakerAnimation();

        // Chuyển mascot sang tư thế ghi âm
        this.stopAllMascots();
        this.mascotRecording.play();

        // Bắt đầu quy trình ghi âm qua SpeakVoice (kèm các hiệu ứng glow, bóng quanh mic)
        this.speakVoice.startRecording();
    }

    /**
     * Khi bé nhấn vào phần Loa (để nghe lại hướng dẫn)
     */
    private onSpeakerClick(): void {
        if (!this.isGameActive || this.isRecordingActive) return;

        console.log('[SpeakScene] Loa được click');
        this.resetIdleState();
        this.idleManager.stop();

        // Ẩn tay gợi ý đang chỉ vào loa
        this.speakUI.destroyCurrentHandHint();

        // Dừng animation cũ (nếu có)
        this.stopSpeakerActiveAnim();
        this.speakUI.stopSpeakerAnimation();

        // BẮT ĐẦU animation loa rung + sóng âm (chỉ khi click mới có)
        this.startSpeakerActiveAnim();
        this.speakUI.startSpeakerAnimation(this.ui.speakerBtn);

        // Phát hướng dẫn đếm toa tàu
        this.playInstructionSequence();
    }
    private startSpeakerActiveAnim(): void {
        if (this.speakerActiveTween) return;
        const CFG = GameConstants.SPEAK_SCENE;
        this.speakerActiveTween = this.tweens.add({
            targets: this.ui.speakerBtn,
            scale: CFG.SPEAKER.SCALE + 0.1,
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private stopSpeakerActiveAnim(): void {
        if (this.speakerActiveTween) {
            this.speakerActiveTween.stop();
            this.speakerActiveTween = null;
        }
        this.ui.speakerBtn.setScale(GameConstants.SPEAK_SCENE.SPEAKER.SCALE);
    }

    // ========================================================================
    // KHU VỰC: PHẢN HỒI GHI ÂM (RECORDING CALLBACKS)
    // ========================================================================

    /**
     * Khi quá trình ghi âm kết thúc thành công
     */
    private async onRecordingComplete(audioBlob: Blob, durationMs: number = 3000): Promise<void> {
        console.log(`[SpeakScene] Recording complete, size: ${(audioBlob.size / 1024).toFixed(1)}KB`);

        // Đổi trạng thái mascot sang đang xử lý logic
        this.stopAllMascots();
        this.mascotProcessing.play();

        try {
            const level = GameConstants.SPEAK_SCENE.LEVELS[this.currentLevel];

            // Gửi targetText sát câu bé được hướng dẫn nói để backend dễ chấm hơn.
            const targetTextObj = this.buildCountingTargetText(level.trainCars);

            // Đóng gói âm thanh chuẩn WAV của sếp thành một File cho SDK backend đọc 
            const wavRecordFile = new File([audioBlob], 'game_record.wav', { type: 'audio/wav' });

            await this.ensureVoiceSession();

            // Lượt thử (attempt): Lần đầu retryCount là 0 -> attempt 1. Lần thử lại -> attempt 2...
            const attempt = this.retryCount + 1;

            // Sử dụng hàm Submit của Iruka SDK để gọi Backend
            const submitPayload: any = {
                audioFile: wavRecordFile,
                questionIndex: this.currentLevel + 1,
                targetText: targetTextObj as any,
                durationMs: durationMs,
                exerciseType: voice.ExerciseType.COUNTING,
                testmode: this.getVoiceSdkTestMode(),
                answerAttempt: attempt // Truyền số lượt nói (1, 2, 3...) cho API
            };

            const response = await voice.Submit(submitPayload);

            // Kết thúc hiệu ứng mascot xử lý
            this.mascotProcessing.stop();

            // Khôi phục lại trạng thái giao diện ghi âm
            this.speakVoice.resetToIdle();
            this.isRecordingActive = false;

            console.log('[SpeakScene] Voice SDK Result:', response);

            const transcript = this.extractVoiceTranscript(response);
            const matchedKeyword = this.extractMatchedKeyword(response);
            const transcriptNumber = this.extractSpokenCount(transcript);
            const matchedKeywordNumber = this.extractSpokenCount(matchedKeyword);
            const isSemanticMatch = transcriptNumber === level.trainCars || matchedKeywordNumber === level.trainCars;

            // Theo tài liệu Iruka: Submit trả về thang 100.
            // Ta giữ nguyên điểm gốc này để so sánh. 
            // Vượt ngưỡng PASS_THRESHOLD (ví dụ 7 điểm -> 70%) HOẶC nói đúng ý nghĩa số -> Pass
            const score100 = response.score;
            const passThreshold100 = GameConstants.VOICE_RECORDING.PASS_THRESHOLD * 10; // 70/100

            console.log('[SpeakScene] Voice semantic debug:', {
                expected: level.trainCars,
                API_Score_100: score100,
                transcript,
                transcriptNumber,
                matchedKeyword,
                matchedKeywordNumber,
                isSemanticMatch,
            });

            // Lưu giữ điểm số cao nhất trong các lần thử của Level này để chống bị API cộng dồn
            const pointsToSave = isSemanticMatch ? Math.max(score100, passThreshold100) : score100;
            this.levelScores[this.currentLevel] = Math.max(this.levelScores[this.currentLevel], pointsToSave);

            if (score100 >= passThreshold100 || isSemanticMatch) {
                this.checkAnswer(level.trainCars, level.trainCars);
            } else {
                console.warn(`[SpeakScene] SDK chấm chưa đạt (${score100} điểm):`, response);
                this.checkAnswer(-1, level.trainCars); // Trả lời sai
            }
        } catch (e) {
            console.error('[SpeakScene] API error:', e);
            this.mascotProcessing.stop();
            this.speakVoice.resetToIdle();
            this.isRecordingActive = false;
            this.showResult(false, 'Lỗi kết nối, thử lại nhé!');
        }
    }

    /**
     * Khi việc ghi âm gặp sự cố lỗi
     */
    private onRecordingError(error: string): void {
        console.warn('[SpeakScene] Recording error:', error);
        this.speakVoice.resetToIdle();
        this.isRecordingActive = false;
        this.showMascotIdle();
        this.showResult(false, 'Thử lại nhé!');
    }

    // ========================================================================
    // KHU VỰC: CÁC TIẾN TRÌNH KẾT QUẢ (RESULTS)
    // ========================================================================

    /**
     * Chức năng kiểm tra đáp án
     */
    private checkAnswer(spoken: number, expected: number): void {
        const isCorrect = spoken === expected;
        console.log(`[SpeakScene] Said: ${spoken}, Expected: ${expected} → ${isCorrect ? '✅' : '❌'}`);

        if (isCorrect) {
            // Đáp án đúng! Hiện mascot vui mừng
            this.stopAllMascots();
            this.mascotHappy.play();
            this.showResult(true, `🎉 Đúng rồi! ${expected} toa tàu!`);
        } else {
            // Đáp án sai! Hiện mascot đang buồn
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
     * Hiện văn bản kèm âm thanh thông báo kết quả lên màn hình
     */
    private showResult(isCorrect: boolean, message: string): void {
        // Lệnh phát SFX (hiệu ứng âm thanh)
        try {
            AudioManager.play(isCorrect ? 'sfx-correct' : 'sfx-wrong');
        } catch (e) { /* ignore */ }

        // Mở chuỗi kết quả (Văn bản / UI) hiện chữ
        this.speakUI.showResult(this.ui.resultText, isCorrect, message);

        // Kế hoạch hành động kế tiếp phụ thuộc vào timeout config
        const TIMING = GameConstants.SPEAK_SCENE.TIMING;

        if (isCorrect) {
            // Đáp án Đúng → Chuyển sang level tiếp theo sau 1 khoảng thời gian Delay
            this.time.delayedCall(TIMING.DELAY_NEXT_LEVEL, () => {
                this.mascotHappy.stop();
                this.transitionToNextLevel();
            });
        } else {
            const maxRetries = GameConstants.VOICE_RECORDING.MAX_RETRIES;
            if (this.retryCount >= maxRetries) {
                // Đã thử lại quá nhiều lần → Sang level tiếp theo
                this.time.delayedCall(TIMING.DELAY_NEXT_LEVEL, () => {
                    this.mascotSad.stop();
                    this.transitionToNextLevel();
                });
            } else {
                // Thử lại thông thường
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
     * Hiệu ứng mờ chuyển cảnh (transition) sang màn chơi tiếp theo
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

    private onAllLevelsComplete(): void {
        console.log('[SpeakScene] All 5 levels complete!');
        this.stopAllMascots();

        // Không tự tính điểm nữa, submitData.finalScore của Game sẽ do Iruka SDK Backend tự tính
        // và trả về theo Thang điểm 10 khi gọi EndSession.
        this.endVoiceSession(false);

        // Chuyển tới màn hình kết thúc Game (EndGame)
        this.scene.start(SceneKeys.EndGame);
    }

    handleExternalReset(): void {
        this.endVoiceSession(true);
    }

    handleHubQuit(): void {
        this.endVoiceSession(true);
    }

    private isStandaloneRuntime(): boolean {
        try {
            return window.self === window.top;
        } catch {
            return false;
        }
    }

    private getVoiceSdkTestMode(): boolean {
        // Ưu tiên config ghi đè (true/false) nếu có
        const override = GameConstants.VOICE_RECORDING.SDK_TEST_MODE;
        if (typeof override === 'boolean') {
            return override;
        }

        // Nếu chạy local (standalone) -> BẬT testMode để không đòi Auth Token
        // Nếu chạy trên Hub (iframe) -> TẮT testMode để lấy điểm thật
        return this.isStandaloneRuntime();
    }

    private buildCountingTargetText(trainCars: number): TargetTextPayload {
        const digit = String(trainCars);
        const word = this.getVietnameseNumberWord(trainCars);
        const digitPhrase = `${digit} toa tàu`;
        const wordPhrase = `${word} toa tàu`;

        return {
            text: digitPhrase,
            value: trainCars,
            aliases: [digit, word, digitPhrase, wordPhrase],
        };
    }

    private getVietnameseNumberWord(value: number): string {
        const words: Record<number, string> = {
            1: 'một',
            2: 'hai',
            3: 'ba',
            4: 'bốn',
            5: 'năm',
        };

        return words[value] ?? String(value);
    }

    private extractVoiceTranscript(response: { score: number }): string | null {
        const raw = response as Record<string, unknown>;
        const transcript = raw.transcript;
        return typeof transcript === 'string' && transcript.trim().length > 0 ? transcript.trim() : null;
    }

    private extractMatchedKeyword(response: { score: number }): string | null {
        const raw = response as Record<string, unknown>;
        const matchedKeyword = raw.matched_keyword;
        return typeof matchedKeyword === 'string' && matchedKeyword.trim().length > 0 ? matchedKeyword.trim() : null;
    }

    private extractSpokenCount(text: string | null): number | null {
        if (!text) return null;

        const normalized = this.normalizeVietnameseText(text);
        const digitMatch = normalized.match(/\b([1-5])\b/);
        if (digitMatch) {
            return parseInt(digitMatch[1], 10);
        }

        const dictionary: Array<{ words: string[]; value: number }> = [
            { words: ['mot'], value: 1 },
            { words: ['hai'], value: 2 },
            { words: ['ba'], value: 3 },
            { words: ['bon', 'tu'], value: 4 },
            { words: ['nam', 'lam'], value: 5 },
        ];

        for (const entry of dictionary) {
            if (entry.words.some(word => normalized.includes(word))) {
                return entry.value;
            }
        }

        return null;
    }

    private normalizeVietnameseText(text: string): string {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private async ensureVoiceSession(): Promise<void> {
        if (this.voiceSessionStarted) return;
        this.voiceSessionStarted = true; // Set cờ ngay lập tức để chặn các call đồng thời

        const testMode = this.getVoiceSdkTestMode();
        console.log('[SpeakScene] Starting voice session', {
            runtime: this.isStandaloneRuntime() ? 'standalone' : 'hub',
            testMode,
        });

        try {
            await voice.StartSession({ testmode: testMode });
        } catch (e) {
            this.voiceSessionStarted = false; // Rollback nếu lỗi
            throw e;
        }
    }

    private endVoiceSession(isUserAborted: boolean): void {
        if (!this.voiceSessionStarted) return;
        const testMode = this.getVoiceSdkTestMode();

        voice.EndSession({
            totalQuestionsExpect: GameConstants.SPEAK_SCENE.LEVELS.length,
            isUserAborted,
            testmode: testMode
        })
            .catch(e => console.error('EndSession error:', e))
            .finally(() => {
                this.voiceSessionStarted = false;
            });
    }
}
