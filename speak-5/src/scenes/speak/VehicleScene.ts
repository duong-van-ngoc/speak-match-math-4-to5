/**
 * VehicleScene - Màn chơi đọc tên phương tiện
 * 
 * Flow:
 * 1. Hiển thị hình phương tiện
 * 2. Phát audio hướng dẫn "Con hãy đọc tên phương tiện này"
 * 3. User nhấn loa để nghe audio mẫu (tùy chọn)
 * 4. User nhấn mic để ghi âm
 * 5. Chấm điểm phát âm
 * 6. Chuyển sang level tiếp theo hoặc EndGame
 */
import SceneBase from '../SceneBase';
import { SceneKeys, TextureKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';
import AudioManager from '../../audio/AudioManager';
import { gameSDK, sdk } from '../../main';
import { configureSdkContext, voice } from '@iruka-edu/mini-game-sdk';
import { VoiceHandler } from '../../utils/VoiceHandler';
import type { RecordingState } from '../../utils/VoiceHandler';
import { AnimationFactory } from '../../utils/AnimationFactory';

// Configure SDK context for standalone mode (ensure it runs when starting from VehicleScene)
configureSdkContext({
    fallback: {
        gameId: GameConstants.BACKEND_SESSION.GAME_ID,
        lessonId: GameConstants.BACKEND_SESSION.LESSON_ID,
        gameVersion: GameConstants.BACKEND_SESSION.GAME_VERSION,
    },
});

export default class VehicleScene extends SceneBase {
    // UI Elements
    private vehicleImage!: Phaser.GameObjects.Image;
    private vehicleNameImage!: Phaser.GameObjects.Image;
    private speakerBtn!: Phaser.GameObjects.Image;
    private microBtn!: Phaser.GameObjects.Image;

    // State
    private vehiclesData: any[] = [];
    private currentLevel: number = 0;
    private _isRecording: boolean = false;
    private _isMicActivated: boolean = false;
    private isSpeaking: boolean = false;
    private sessionStarted: boolean = false;

    // Voice Handler
    private voiceHandler!: VoiceHandler;
    private volumeBar!: Phaser.GameObjects.Graphics;
    private recordingIndicator!: Phaser.GameObjects.Graphics;
    private micPulseTween: Phaser.Tweens.Tween | null = null;

    // Speak Animation (for Speaker)
    private speakAnimSprite: Phaser.GameObjects.Image | null = null;
    private speakAnimTimer: Phaser.Time.TimerEvent | null = null;
    private speakAnimFrame: number = 0;

    // Mascot Animations
    private mascotIdle!: AnimationFactory;
    private mascotRecording!: AnimationFactory;
    private mascotProcessing!: AnimationFactory;
    private mascotHappy!: AnimationFactory;
    private mascotSad!: AnimationFactory;

    // Score Board UI
    private scoreBoard!: Phaser.GameObjects.Container;
    private scoreBoardBg!: Phaser.GameObjects.Image;
    private scoreImage!: Phaser.GameObjects.Image;
    private scoreLoadingText!: Phaser.GameObjects.Text;
    private scoreBoardMascotSprite!: Phaser.GameObjects.Sprite;

    // Scores
    private levelScores: number[] = [];

    constructor() {
        super(SceneKeys.SpeakScene);
    }

    create() {
        // Reset state
        const config = this.cache.json.get('game_config');
        this.vehiclesData = config && config.vehicles ? config.vehicles : GameConstants.VEHICLES.ITEMS;
        this.currentLevel = 0;
        this._isRecording = false;
        this.isSpeaking = false;
        this.levelScores = [];
        this.micPulseTween = null;
        this.speakAnimSprite = null;
        this.speakAnimTimer = null;

        this.setupSystem();
        this.setupBackgroundAndAudio();
        this.createHandHint();
        this.setupVoiceHandler();
        this.setupMascotAnimations();
        this.createUI();
        this.initGameFlow();

        this.events.on('wake', this.handleWake, this);

        // SDK Integration
        // Tổng cộng: 5 xe + 2 đường nối đúng = 7 bước
        const TOTAL_STEPS = this.vehiclesData.length;
        gameSDK.setTotal(TOTAL_STEPS);
        gameSDK.startQuestionTimer();

        window.irukaGameState = {
            startTime: Date.now(),
            currentScore: 0,
        };
    }

    update(_time: number, delta: number) {
        this.idleManager.update(delta);
    }

    shutdown() {
        this.voiceHandler?.destroy();
        this.destroyMascots();
        this.cleanupScene();
    }

    // ========================================
    // MASCOT ANIMATIONS SETUP
    // ========================================

    private setupMascotAnimations(): void {
        const MASCOT = GameConstants.MASCOT_ANIMATIONS;

        // Create animation instances but DON'T play idle yet (wait for audio)
        this.mascotIdle = new AnimationFactory(this, { ...MASCOT, ...MASCOT.IDLE });
        this.mascotRecording = new AnimationFactory(this, { ...MASCOT, ...MASCOT.RECORDING });
        this.mascotProcessing = new AnimationFactory(this, { ...MASCOT, ...MASCOT.PROCESSING });
        this.mascotHappy = new AnimationFactory(this, { ...MASCOT, ...MASCOT.RESULT_HAPPY });
        this.mascotSad = new AnimationFactory(this, { ...MASCOT, ...MASCOT.RESULT_SAD });

        // Hide all mascots initially
        this.stopAllMascots();
    }

    private stopAllMascots(): void {
        this.mascotIdle?.stop();
        this.mascotRecording?.stop();
        this.mascotProcessing?.stop();
        this.mascotHappy?.stop();
        this.mascotSad?.stop();
    }

    private showMascot(state: 'idle' | 'recording' | 'processing' | 'happy' | 'sad'): void {
        // Ẩn tất cả trước
        this.stopAllMascots();

        // Hiện mascot theo state
        switch (state) {
            case 'idle':
                this.mascotIdle?.play();
                break;
            case 'recording':
                this.mascotRecording?.play();
                break;
            case 'processing':
                this.mascotProcessing?.play();
                break;
            case 'happy':
                this.mascotHappy?.play();
                break;
            case 'sad':
                this.mascotSad?.play();
                break;
        }
    }

    private destroyMascots(): void {
        this.mascotIdle?.destroy();
        this.mascotRecording?.destroy();
        this.mascotProcessing?.destroy();
        this.mascotHappy?.destroy();
        this.mascotSad?.destroy();
    }

    // ========================================
    // VOICE HANDLER SETUP
    // ========================================

    private setupVoiceHandler(): void {
        this.voiceHandler = new VoiceHandler({
            onStateChange: (state) => this.onVoiceStateChange(state),
            onVolumeChange: (volume, isAbove) => this.updateVolumeIndicator(volume, isAbove),
            onComplete: (blob) => this.onRecordingComplete(blob),
            onError: (err) => this.onRecordingError(err),
        });

        this.volumeBar = this.add.graphics().setDepth(50);
        this.recordingIndicator = this.add.graphics().setDepth(49);
    }

    private onVoiceStateChange(state: RecordingState): void {
        switch (state) {
            case 'recording':
                this.startMicPulse();
                break;
            case 'processing':
            case 'idle':
                this.stopMicPulse();
                this.recordingIndicator.clear();
                this.volumeBar.clear();
                break;
        }
    }

    private updateVolumeIndicator(volume: number, isAboveThreshold: boolean): void {
        if (!this._isRecording) return;

        const normalizedVolume = Math.min(volume / 128, 1);
        const radius = 85;
        const lineWidth = 8;

        this.volumeBar.clear();
        this.volumeBar.lineStyle(lineWidth, isAboveThreshold ? 0x00FF00 : 0x666666, 0.8);

        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (normalizedVolume * Math.PI * 2);

        this.volumeBar.beginPath();
        this.volumeBar.arc(this.microBtn.x, this.microBtn.y, radius, startAngle, endAngle, false);
        this.volumeBar.strokePath();

        // Recording background indicator
        this.recordingIndicator.clear();
        this.recordingIndicator.fillStyle(isAboveThreshold ? 0x00FF00 : 0xFF6666, 0.3);
        this.recordingIndicator.fillCircle(this.microBtn.x, this.microBtn.y, 80);
    }

    private startMicPulse(): void {
        this.stopMicPulse();
        const CFG = GameConstants.SPEAK_SCENE;
        this.micPulseTween = this.tweens.add({
            targets: this.microBtn,
            scale: { from: CFG.MICRO.SCALE, to: CFG.MICRO.SCALE + 0.1 },
            duration: 500,
            yoyo: true,
            repeat: -1
        });
    }

    private stopMicPulse(): void {
        if (this.micPulseTween) {
            this.micPulseTween.stop();
            this.micPulseTween = null;
        }
        this.microBtn.setScale(GameConstants.SPEAK_SCENE.MICRO.SCALE);
    }

    private showSpeakAnimation(): void {
        const ANIM_CFG = GameConstants.SPEAK_SCENE.SPEAK_ANIMATION;

        this.hideSpeakAnimation();

        this.speakAnimFrame = 0;
        this.speakAnimSprite = this.add.image(this.scale.width * ANIM_CFG.X, this.scale.height * ANIM_CFG.Y, ANIM_CFG.FRAMES[0])
            .setOrigin(0, 0.5)
            .setScale(ANIM_CFG.SCALE)
            .setDepth(50);

        this.speakAnimTimer = this.time.addEvent({
            delay: ANIM_CFG.FRAME_DURATION,
            callback: () => {
                if (!this.speakAnimSprite) return;
                this.speakAnimFrame = (this.speakAnimFrame + 1) % ANIM_CFG.FRAMES.length;
                this.speakAnimSprite.setTexture(ANIM_CFG.FRAMES[this.speakAnimFrame]);
            },
            loop: true
        });
    }

    private hideSpeakAnimation(): void {
        this.speakAnimTimer?.destroy();
        this.speakAnimTimer = null;
        this.speakAnimSprite?.destroy();
        this.speakAnimSprite = null;
    }

    // ========================================
    // UI CREATION
    // ========================================

    protected createUI(): void {
        const CFG = GameConstants.SPEAK_SCENE;
        const w = this.scale.width;
        const h = this.scale.height;

        // 1. BOARD/CANVAS (Nền trắng làm lớp dưới cùng)
        this.add.image(w * CFG.BOARD.X, h * CFG.BOARD.Y, TextureKeys.S1_Board)
            .setScale(CFG.BOARD.SCALE_X, CFG.BOARD.SCALE_Y)
            .setAlpha(CFG.BOARD.ALPHA)
            .setDepth(1);

        // 2. BANNER (Chứa tên bài học, nằm trên board)
        this.add.image(w * CFG.BANNER.X, h * CFG.BANNER.Y, TextureKeys.Speak_Banner)
            .setOrigin(0.5, 0)
            .setScale(CFG.BANNER.SCALE)
            .setDepth(2);

        // 4. VEHICLE NAME IMAGE (Thay thế cho Text)
        const firstVehicle = this.vehiclesData[0];

        this.vehicleNameImage = this.add.image(
            w * CFG.VEHICLE_TITLE.X,
            h * CFG.VEHICLE_TITLE.Y + 20, // Dịch xuống 1 chút
            (firstVehicle as any).textKey
        )
            .setOrigin(0.5)
            .setScale(CFG.VEHICLE_TITLE.SCALE)
            .setDepth(10);





        // 5. VEHICLE IMAGE (sẽ thay đổi theo level)
        const itemY = h * CFG.VEHICLE_IMAGE.Y + 20 + (firstVehicle.offsetY || 0);
        this.vehicleImage = this.add.image(
            w * CFG.VEHICLE_IMAGE.X,
            itemY,
            firstVehicle.imageKey
        ).setScale(CFG.VEHICLE_IMAGE.SCALE).setDepth(10);

        // Floating animation
        this.tweens.add({
            targets: this.vehicleImage,
            y: itemY - CFG.ANIM.FLOAT_DISTANCE,
            duration: CFG.ANIM.FLOAT_DURATION,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 6. SPEAKER BUTTON (phát audio mẫu)
        this.speakerBtn = this.add.image(
            w * CFG.SPEAKER.X,
            h * CFG.SPEAKER.Y,
            TextureKeys.Speak_Speaker
        )
            .setScale(CFG.SPEAKER.SCALE)
            .setInteractive({ useHandCursor: true })
            .setDepth(10)
            .on('pointerdown', () => this.onSpeakerClick())
            .on('pointerover', () => this.speakerBtn.setScale(CFG.SPEAKER.SCALE + 0.08))
            .on('pointerout', () => this.speakerBtn.setScale(CFG.SPEAKER.SCALE));

        // 7. MICRO BUTTON (Luôn hiển thị)
        this.microBtn = this.add.image(
            w * CFG.MICRO.X,
            h * CFG.MICRO.Y,
            TextureKeys.Speak_Micro
        )
            .setScale(CFG.MICRO.SCALE)
            .setAlpha(1)
            .setInteractive({ useHandCursor: true })
            .setDepth(10)
            .on('pointerdown', () => this.onMicroClick())
            .on('pointerover', () => {
                this.microBtn.setScale(CFG.MICRO.SCALE + 0.08);
            })
            .on('pointerout', () => {
                this.microBtn.setScale(CFG.MICRO.SCALE);
            });

        // 8. SCORE BOARD (Popup hiển thị điểm)
        this.createScoreBoardUI();
    }

    private createScoreBoardUI(): void {
        const CFG = GameConstants.SPEAK_SCENE.SCORE_BOARD;
        const w = this.scale.width;
        const h = this.scale.height;

        // Popup hiện ở giữa màn hình
        const popupY = h * 0.5;
        this.scoreBoard = this.add.container(w * CFG.X, popupY).setDepth(200).setScale(0).setAlpha(0);

        // Background: Dùng board trắng giống SpeakScene
        this.scoreBoardBg = this.add.image(0, 0, TextureKeys.S1_Board).setScale(0.8);
        this.scoreBoard.add(this.scoreBoardBg);

        // Mascot (Dùng cho trạng thái loading)
        this.scoreBoardMascotSprite = this.add.sprite(0, CFG.MASCOT_OFFSET_Y, 'mascot_processing')
            .setScale(CFG.MASCOT_SCALE)
            .setVisible(false);
        this.scoreBoard.add(this.scoreBoardMascotSprite);

        // Score Image
        this.scoreImage = this.add.image(0, CFG.SCORE_IMG_OFFSET_Y, TextureKeys.Score_10)
            .setScale(CFG.SCORE_IMG_SCALE)
            .setVisible(false);
        this.scoreBoard.add(this.scoreImage);

        // Loading label
        this.scoreLoadingText = this.add.text(0, CFG.TEXT_OFFSET_Y, 'Đang tính toán điểm số...', {
            fontSize: '36px',
            fontFamily: 'Fredoka, sans-serif',
            color: '#333333',
            fontStyle: 'bold'
        }).setOrigin(0.5).setVisible(false);
        this.scoreBoard.add(this.scoreLoadingText);
    }



    private showScoreBoardResult(score: number): void {
        console.log('[VehicleScene] showScoreBoardResult:', score);
        const CFG = GameConstants.SPEAK_SCENE.SCORE_BOARD;

        this.scoreLoadingText.setVisible(false);
        this.scoreBoardMascotSprite.stop();
        this.scoreBoardMascotSprite.setVisible(false);

        // Audio đã được chuyển sang onRecordingComplete để xử lý wait end
        // AudioManager.play(`score-${displayScore}`);

        // Setup visuals for Score
        this.scoreBoardBg.setScale(CFG.SCALE_SCORE);

        // Match texture with score
        let scoreKey = TextureKeys.Score_10;
        if (score <= 4) scoreKey = TextureKeys.Score_4;
        else if (score === 5) scoreKey = TextureKeys.Score_5;
        else if (score === 6) scoreKey = TextureKeys.Score_6;
        else if (score === 7) scoreKey = TextureKeys.Score_7;
        else if (score === 8) scoreKey = TextureKeys.Score_8;
        else if (score === 9) scoreKey = TextureKeys.Score_9;

        this.scoreImage.setTexture(scoreKey).setVisible(true);

        this.scoreBoard.setAlpha(1);
        // Luôn chạy tween scale để đảm bảo hiện (bỏ check scale === 0)
        this.tweens.add({
            targets: this.scoreBoard,
            scale: 1,
            duration: 400,
            ease: 'Back.out'
        });
    }

    private hideScoreBoard(): void {
        this.tweens.add({
            targets: this.scoreBoard,
            scale: 0,
            alpha: 0,
            duration: 300,
            ease: 'Back.in',
            onComplete: () => {
                this.scoreImage.setVisible(false);
                this.scoreLoadingText.setVisible(false);
                this.scoreBoardMascotSprite.setVisible(false);
            }
        });
    }

    protected initGameFlow(): void {
        if (this.input.keyboard) this.input.keyboard.enabled = false;

        this.isSpeaking = true;

        this.startWithAudio(async () => {
            console.log('[VehicleScene] Starting game flow');
            this.playBgm();
            this.isGameActive = true;

            // Khởi tạo session giọng nói
            try {
                await this.startBackendSession();
            } catch (err) {
                console.error('[VehicleScene] CRITICAL: Cannot start voice session. Check GAME_ID/LESSON_ID!', err);
            }

            // Chỉ tay vào Loa trước (chỉ cho xe đầu tiên)
            if (this.currentLevel === 0) {
                this.animateHandHintTo(this.speakerBtn.x, this.speakerBtn.y);
            }

            // Phát audio hướng dẫn
            AudioManager.play(GameConstants.VEHICLES.INTRO_AUDIO);

            const introDuration = AudioManager.getDuration(GameConstants.VEHICLES.INTRO_AUDIO) || 3;
            this.time.delayedCall((introDuration + 0.5) * 1000, () => {
                if (this.isGameActive) {
                    this.isSpeaking = false;
                    this._isMicActivated = false; // Luôn khóa Mic ở đầu level
                    this.idleManager.start();
                    // Lưu ý: Chưa hiện mascot, chờ bé ấn Loa xong mới hiện
                }
            });

            if (this.input.keyboard) this.input.keyboard.enabled = true;
            this.showButtons();
        });
    }

    protected showIdleHint(): void {
        if (this.currentLevel > 0) return; // Chỉ hướng dẫn cho xe đầu tiên

        if (!this._isRecording && this.microBtn?.x > 0) {
            this.animateHandHintTo(this.microBtn.x, this.microBtn.y);
        }
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    private onSpeakerClick(): void {
        if (!this.isGameActive) return;

        // Button press animation (luôn chạy để có cảm giác click)
        this.tweens.add({
            targets: this.speakerBtn,
            scale: GameConstants.SPEAK_SCENE.SPEAKER.SCALE - 0.1,
            duration: 100,
            yoyo: true,
        });

        if (this.isSpeaking || this._isRecording) return;

        this.isSpeaking = true;
        this.resetIdleState();

        // Phát audio mẫu
        const currentVehicle = this.vehiclesData[this.currentLevel];
        AudioManager.play(currentVehicle.audioKey);
        this.showSpeakAnimation();

        // Tắt nhạc nền khi loa phát
        this.muteBgm(true);

        const audioDuration = AudioManager.getDuration(currentVehicle.audioKey) || 2;
        this.time.delayedCall(audioDuration * 1000, () => {
            if (!this.isGameActive) return;
            this.isSpeaking = false;
            this.hideSpeakAnimation();

            // Phát audio mic tự động 
            const micAudioKey = GameConstants.VEHICLES.MIC_AUDIO;
            AudioManager.play(micAudioKey);
            this.isSpeaking = true;

            AudioManager.onceEnd(micAudioKey, () => {
                if (!this.isGameActive) return;
                this.isSpeaking = false;
                this._isMicActivated = true;
                this.showMicAndMascot();

                this.unmuteBgm();
            });
        });
    }

    private onMicroClick(): void {
        if (!this.isGameActive) return;

        if (this.isSpeaking || this._isRecording || !this._isMicActivated) {
            // Hiệu ứng nảy khi click mà chưa được phép (feedback)
            this.tweens.add({
                targets: this.microBtn,
                scale: GameConstants.SPEAK_SCENE.MICRO.SCALE - 0.1,
                duration: 100,
                yoyo: true,
            });
            return;
        }

        this._isRecording = true;
        this._isMicActivated = false; // Khóa mic ngay lập tức để tránh click bồi
        this.resetIdleState();
        this.idleManager.stop();

        // Visual feedback (đang ghi âm - scale to hơn)
        this.tweens.add({
            targets: this.microBtn,
            scale: GameConstants.SPEAK_SCENE.MICRO.SCALE + 0.1,
            duration: 200,
        });
        this.microBtn.setTint(0xff6b6b);

        console.log(`[VehicleScene] Mic clicked, starting recording`);

        // Chuyển Mascot sang trạng thái RECORDING và BẮT ĐẦU THU NGAY
        this.showMascot('recording');
        this.voiceHandler.start();

        // Tắt nhạc nền NGAY LẬP TỨC khi thu âm
        this.muteBgm(true);

        // Auto stop sau một khoảng thời gian
        this.time.delayedCall(GameConstants.SPEAK_SCENE.TIMING.RECORDING_DURATION, () => {
            if (this._isRecording) {
                this.voiceHandler.stop();
            }
        });
    }

    private async onRecordingComplete(audioBlob: Blob): Promise<void> {
        if (!this.isGameActive || !this._isRecording) return;
        this._isRecording = false;
        this.isSpeaking = true; // Block mọi input cho đến khi xong level hoặc sang xe mới

        // Visual reset
        this.microBtn.clearTint();
        this.microBtn.setScale(GameConstants.SPEAK_SCENE.MICRO.SCALE);

        // Bật lại nhạc nền
        this.unmuteBgm();

        // Hiện mascot PROCESSING và bảng loading giống SpeakScene
        // Hiện mascot PROCESSING (Mascot chính trên màn hình)
        this.showMascot('processing');
        // KHÔNG hiện popup loading nữa theo yêu cầu: "popup chỉ hiện khi có điểm"
        // this.showScoreBoardLoading('Đang chấm điểm...');

        // Score the vehicle + Fake delay để bé kịp nhìn thấy mascot "đang nghĩ"
        const currentVehicle = this.vehiclesData[this.currentLevel];

        // Chạy song song: Gọi API chấm điểm VÀ Chờ tối thiểu 2.5s
        const [score] = await Promise.all([
            this.submitForScoring(audioBlob, currentVehicle.name),
            new Promise<void>(resolve => this.time.delayedCall(1500, resolve))
        ]);

        this.levelScores.push(score);
        gameSDK.finishQuestionTimer();

        // Hiển thị kết quả điểm lên bảng (ẩn mascot popup, hiện ảnh điểm)
        this.showScoreBoardResult(score);

        // Feedback NGAY LẬP TỨC để đồng bộ với bảng điểm
        const passed = score >= GameConstants.VOICE_RECORDING.PASS_THRESHOLD;
        if (passed) {
            gameSDK.recordCorrect({ scoreDelta: 1 }); // Mỗi xe 1 điểm
            this.showMascot('happy');
        } else {
            gameSDK.recordWrong();
            this.showMascot('sad');
        }

        // Cập nhật tiến độ: (this.currentLevel + 1) / TOTAL_STEPS
        // Cập nhật tiến độ: (this.currentLevel + 1) / TOTAL_STEPS
        const TOTAL_STEPS = this.vehiclesData.length;
        sdk.progress((this.currentLevel + 1) / TOTAL_STEPS);
        sdk.score(gameSDK.prepareSubmitData().finalScore);

        // Calculate display score (fixed check)
        const displayScore = Math.max(4, Math.min(10, score));
        const audioKey = `score-${displayScore}`;

        // Play score audio
        AudioManager.play(audioKey);

        // Wait for audio to finish + Delay
        const waitForAudio = new Promise<void>(resolve => {
            let handled = false;
            const done = () => {
                if (handled) return;
                handled = true;
                resolve();
            };

            // Listen for end
            AudioManager.onceEnd(audioKey, done);

            // Fallback timeout (duration + buffer or fixed safe time)
            const duration = AudioManager.getDuration(audioKey) || 2.5;
            this.time.delayedCall((duration * 1000) + 500, done);
        });

        await waitForAudio;

        this.time.delayedCall(GameConstants.SPEAK_SCENE.TIMING.DELAY_NEXT_LEVEL, async () => {
            if (!this.isGameActive) return;
            this.hideScoreBoard();
            this.isSpeaking = false; // Mở khóa cho level tiếp theo
            await this.goToNextLevel();
        });
    }

    private onRecordingError(error: string): void {
        console.error('[VehicleScene] Recording error:', error);
        this._isRecording = false;
        this.microBtn.clearTint();
        this.microBtn.setScale(GameConstants.SPEAK_SCENE.MICRO.SCALE);
        AudioManager.play('sfx-wrong');
        this.showMascot('sad');
        this.unmuteBgm();
    }

    private async submitForScoring(audioBlob: Blob, keyword: string): Promise<number> {


        try {
            const audioFile = new File([audioBlob], `vehicle_${this.currentLevel + 1}.wav`, { type: 'audio/wav' });

            const response = await voice.Submit({
                audioFile: audioFile,
                questionIndex: this.currentLevel + 1,
                targetText: { text: keyword },
                durationMs: GameConstants.SPEAK_SCENE.TIMING.RECORDING_DURATION,
                exerciseType: 'NURSERY_RHYME' as any,
                testmode: GameConstants.VOICE_RECORDING.TEST_MODE,
            });
            console.log('[VehicleScene] API Response:', response);

            const score10 = Math.round((response.score ?? 0) / 10);
            // Trả về điểm thực tế (4-10), ép MIN_SCORE theo yêu cầu
            return Math.max(4, Math.min(10, score10));
        } catch (err) {
            console.error('[VehicleScene] Scoring error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
            // API thất bại -> Trả về 0 điểm để báo lỗi, không random
            return 0;
        }
    }

    private async goToNextLevel(): Promise<void> {
        console.log(`[VehicleScene] goToNextLevel: ${this.currentLevel} -> ${this.currentLevel + 1}`);
        this.currentLevel++;

        if (this.currentLevel >= this.vehiclesData.length) {
            await this.finishGame();
        } else {
            this.showMascot('idle');
            this.updateLevelUI();
            this.idleManager.start();
            gameSDK.startQuestionTimer(); // Bắt đầu đếm giờ cho xe tiếp theo
        }
    }

    private updateLevelUI(): void {
        const currentVehicle = this.vehiclesData[this.currentLevel];
        console.log(`[VehicleScene] updateLevelUI: ${currentVehicle?.name} (${currentVehicle?.imageKey})`);

        this.tweens.add({
            targets: [this.vehicleImage, this.vehicleNameImage],
            alpha: 0,
            duration: 200,
            onComplete: () => {
                this.vehicleImage.setTexture(currentVehicle.imageKey);
                if ((currentVehicle as any).textKey) {
                    this.vehicleNameImage.setTexture((currentVehicle as any).textKey);
                }

                // Update position with potential offset
                const h = this.scale.height;
                const CFG = GameConstants.SPEAK_SCENE;
                const itemY = h * CFG.VEHICLE_IMAGE.Y + 20 + (currentVehicle.offsetY || 0);
                this.vehicleImage.setY(itemY);

                // Update float animation base Y
                const floatTween = this.tweens.getTweensOf(this.vehicleImage).find(t => t.duration === CFG.ANIM.FLOAT_DURATION);
                if (floatTween) {
                    floatTween.remove();
                }
                this.tweens.add({
                    targets: this.vehicleImage,
                    y: itemY - CFG.ANIM.FLOAT_DISTANCE,
                    duration: CFG.ANIM.FLOAT_DURATION,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });

                this.vehicleImage.setAlpha(0);
                this.vehicleNameImage.setAlpha(0);

                this.tweens.add({
                    targets: [this.vehicleImage, this.vehicleNameImage],
                    alpha: 1,
                    duration: 200
                });
            }
        });

        this.isSpeaking = true;

        // Chỉ ẩn Mascot khi bắt đầu level mới, Mic vẫn hiện
        this.stopAllMascots();

        // Chỉ tay vào Loa (chỉ cho xe đầu tiên)
        if (this.currentLevel === 0) {
            this.animateHandHintTo(this.speakerBtn.x, this.speakerBtn.y);
        }

        AudioManager.play(GameConstants.VEHICLES.INTRO_AUDIO);
        const introDuration = AudioManager.getDuration(GameConstants.VEHICLES.INTRO_AUDIO) || 3;

        this.time.delayedCall(introDuration * 1000, () => {
            this.isSpeaking = false;
            this._isMicActivated = false; // Luôn khóa Mic ở đầu level mới
            // Ở đây không gọi showMicAndMascot nữa, chờ bé bấm loa
        });
    }

    private showMicAndMascot(): void {
        const CFG = GameConstants.SPEAK_SCENE;

        // Đảm bảo Mic hiện (vì lỡ bị mờ khi ghi âm)
        this.microBtn.setAlpha(1).setScale(CFG.MICRO.SCALE);

        // Hiện Mascot Idle
        this.showMascot('idle');

        // Hiện ngón tay chỉ vào mic (chỉ cho xe đầu tiên)
        if (this.currentLevel === 0) {
            this.animateHandHintTo(this.microBtn.x, this.microBtn.y);
        }
    }

    private async finishGame(): Promise<void> {
        const avgScore = this.levelScores.length > 0
            ? this.levelScores.reduce((a, b) => a + b, 0) / this.levelScores.length
            : 0;
        const finalScore = Math.round(avgScore);

        window.irukaGameState.currentScore = finalScore;
        await this.endBackendSession(false);

        // Ghi nhận tổng điểm hiện tại qua SDK
        sdk.score(gameSDK.prepareSubmitData().finalScore);

        this.time.delayedCall(1500, () => {
            gameSDK.finalizeAttempt('pass');
            this.scene.start(SceneKeys.EndGame);
        });
    }

    // ========================================
    // BACKEND SESSION
    // ========================================

    private async startBackendSession(): Promise<void> {
        console.log('[VehicleScene] Starting backend session with:', GameConstants.BACKEND_SESSION);

        // RE-CONFIGURE SDK context just to be 100% sure
        configureSdkContext({
            fallback: {
                gameId: GameConstants.BACKEND_SESSION.GAME_ID,
                lessonId: GameConstants.BACKEND_SESSION.LESSON_ID,
                gameVersion: GameConstants.BACKEND_SESSION.GAME_VERSION,
                apiUrl: GameConstants.VOICE_RECORDING.API_URL_DEV,
            } as any,
            // Thử config ở root level lần nữa
            apiUrl: GameConstants.VOICE_RECORDING.API_URL_DEV,
        } as any);

        try {
            const response = await voice.StartSession({
                testmode: GameConstants.VOICE_RECORDING.TEST_MODE,
                // Thử truyền apiUrl trực tiếp vào đây (hy vọng SDK nhận)
                apiUrl: GameConstants.VOICE_RECORDING.API_URL_DEV
            } as any);

            if (response && response.sessionId) {
                this.sessionStarted = true;
                console.log('[VehicleScene] Session started:', response.sessionId);
            }
        } catch (error) {
            console.error('[VehicleScene] Start session fail:', error);
        }
    }

    private async endBackendSession(isUserAborted: boolean = false): Promise<void> {
        if (!this.sessionStarted) return;
        try {
            await voice.EndSession({
                totalQuestionsExpect: GameConstants.VEHICLES.TOTAL_LEVELS,
                isUserAborted,
                testmode: true,
            });
            this.sessionStarted = false;
            localStorage.removeItem('voice_session_id');
        } catch (error) {
            console.error('[VehicleScene] End session fail:', error);
            this.sessionStarted = false;
        }
    }
}
