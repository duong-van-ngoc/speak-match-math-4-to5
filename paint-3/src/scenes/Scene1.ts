import Phaser from 'phaser';

import { SceneKeys, TextureKeys, DataKeys, AudioKeys } from '../consts/Keys';
import { GameConstants } from '../consts/GameConstants';
import { GameUtils } from '../utils/GameUtils';
import { IdleManager } from '../utils/IdleManager';

import { changeBackground } from '../utils/BackgroundManager';
import { PaintManager } from '../utils/PaintManager';

import {
    playVoiceLocked,
    setGameSceneReference,
    resetVoiceState,
} from '../utils/rotateOrientation';
import AudioManager from '../audio/AudioManager';
import { showGameButtons, sdk } from '../main';
import { game } from "@iruka-edu/mini-game-sdk";

import FPSCounter from '../utils/FPSCounter';

export default class Scene1 extends Phaser.Scene {
    // Đối tượng âm thanh nền (Background Music)
    private bgm!: Phaser.Sound.BaseSound;

    // --- QUẢN LÝ LOGIC (MANAGERS) ---
    private paintManager!: PaintManager; // Quản lý việc tô màu, cọ vẽ, canvas
    private idleManager!: IdleManager; // Quản lý thời gian rảnh để hiện gợi ý
    private fpsCounter!: FPSCounter; // ✅ FPS Counter

    // --- QUẢN LÝ TRẠNG THÁI GAME (GAME STATE) ---
    // Map lưu các bộ phận chưa tô xong (Key: ID, Value: Image Object) -> Dùng để random gợi ý
    private unfinishedPartsMap: Map<string, Phaser.GameObjects.Image> =
        new Map();
    // Set lưu ID các bộ phận đã hoàn thành -> Dùng để check thắng (Win condition)
    private finishedParts: Set<string> = new Set();
    private totalParts: number = 0; // Tổng số bộ phận cần tô
    private score: number = 0; // Điểm số hiện tại
    private isIntroActive: boolean = false; // Cờ chặn tương tác khi đang chạy intro
    private isWaitingForIntroStart: boolean = true; // Cờ chờ người dùng chạm lần đầu

    // --- UI COMPONENTS ---

    private get handHint(): Phaser.GameObjects.Image | undefined {
        const uiScene = this.scene.get(SceneKeys.UI) as any;
        return uiScene?.handHint;
    }

    // Tween đang chạy cho gợi ý (lưu lại để stop khi cần)
    private activeHintTween: Phaser.Tweens.Tween | null = null;
    private activeHintTarget: Phaser.GameObjects.Image | null = null;

    constructor() {
        super(SceneKeys.Scene1);
    }

    /**
     * Khởi tạo lại dữ liệu khi Scene bắt đầu (hoặc Restart)
     * QUAN TRỌNG: Phải clear các Map/Set để tránh lỗi "Zombie Object" (tham chiếu đến object cũ đã bị destroy)
     */
    init(data?: { isRestart: boolean }) {
        this.unfinishedPartsMap.clear();
        this.finishedParts.clear();
        this.totalParts = 0;
        this.score = 0;

        if (data?.isRestart) {
            this.isWaitingForIntroStart = false;
            game.retryFromStart();
        } else {
            this.isWaitingForIntroStart = true;
        }
    }

    create() {
        showGameButtons();

        this.setupSystem(); // Cài đặt hệ thống (Paint, Idle)
        this.setupBackgroundAndAudio(); // Cài đặt hình nền và nhạc nền
        this.createUI(); // Tạo giao diện (Bảng màu, Banner)

        // Chạy UI Scene
        this.scene.launch(SceneKeys.UI, {
            paintManager: this.paintManager,
            sceneKey: SceneKeys.Scene1
        });

        this.createLevel(); // Tạo nhân vật và các vùng tô màu

        // SDK Integration
        game.setTotal(1);
        (window as any).irukaGameState = {
            startTime: Date.now(),
            currentScore: 0,
        };
        sdk.score(this.score, 0);
        sdk.progress({ levelIndex: 0, total: 1 });
        game.startQuestionTimer();

        this.setupInput(); // Cài đặt sự kiện chạm/vuốt

        // this.playIntroSequence(); // Chạy hướng dẫn đầu game (Đã chuyển sang click-to-start)

        // Sự kiện khi quay lại tab game (Wake up)
        this.events.on('wake', () => {
            this.idleManager.reset();
            if (this.input.keyboard) this.input.keyboard.enabled = true;
        });

        // ✅ HIỂN THỊ FPS
        // this.fpsCounter = new FPSCounter(this);

        // Nếu là restart (không cần chờ tap), chạy intro luôn
        // Kiểm tra trạng thái Audio Context
        const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;

        // Cố gắng resume ngay lập tức (nếu trình duyệt cho phép)
        if (soundManager.context && soundManager.context.state === 'suspended') {
            soundManager.context.resume().catch(() => { });
        }

        // Điều kiện Autoplay:
        // 1. Là Restart (đã tương tác trước đó)
        // 2. Hoặc AudioContext đang chạy (Trình duyệt không chặn)
        const canAutoPlay = !this.isWaitingForIntroStart || (soundManager.context && soundManager.context.state === 'running');

        if (canAutoPlay) {
            console.log('Auto-playing Intro (Context state: ' + soundManager.context?.state + ')');
            this.isWaitingForIntroStart = false;

            // Đảm bảo resume lần nữa cho chắc
            if (soundManager.context && soundManager.context.state === 'suspended') {
                soundManager.context.resume();
            }

            this.time.delayedCall(500, () => {
                this.playIntroSequence();
            });
        }
    }

    update(time: number, delta: number) {
        // Chỉ đếm thời gian Idle khi:
        // 1. Không đang tô màu
        // 2. Không đang chạy Intro
        // 3. Chưa thắng game
        if (
            !this.paintManager.isPainting() &&
            !this.isIntroActive &&
            this.finishedParts.size < this.totalParts
        ) {
            this.idleManager.update(delta);
        }

        // Cập nhật FPS
        if (this.fpsCounter) {
            this.fpsCounter.update();
        }
    }

    shutdown() {
        this.stopIntro();

        this.paintManager = null as any; // Giải phóng bộ nhớ
        this.scene.stop(SceneKeys.UI);
        if (this.bgm) {
            this.bgm.stop();
        }
    }

    // =================================================================
    // PHẦN 1: CÀI ĐẶT HỆ THỐNG (SYSTEM SETUP)
    // =================================================================

    private setupSystem() {
        resetVoiceState();
        (window as any).gameScene = this;
        setGameSceneReference(this);

        // Khởi tạo PaintManager
        // Callback nhận về: id, renderTexture, và DANH SÁCH MÀU ĐÃ DÙNG (Set<number>)
        this.paintManager = new PaintManager(this, (id, rt, usedColors) => {
            this.handlePartComplete(id, rt, usedColors);
        });

        // Cài đặt Idle Manager: Khi rảnh quá lâu thì gọi showHint()
        this.idleManager = new IdleManager(GameConstants.IDLE.THRESHOLD, () =>
            this.showHint()
        );
    }

    private setupInput() {
        // Chuyển tiếp các sự kiện input sang cho PaintManager xử lý vẽ
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            this.paintManager.handlePointerMove(p);
            if (this.paintManager.isPainting()) {
                this.idleManager.reset();
                this.stopIntro();
                this.stopActiveHint();
            }
        });
        this.input.on('pointerup', () => this.paintManager.handlePointerUp());

        // Khi chạm vào màn hình -> Reset bộ đếm Idle
        this.input.on('pointerdown', () => {
            // Unlock audio context nếu bị chặn
            const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;
            if (soundManager.context && soundManager.context.state === 'suspended') {
                soundManager.context.resume().catch(() => { });
            }

            // Nếu là lần chạm đầu tiên -> Bắt đầu Intro (và unlock Audio)
            if (this.isWaitingForIntroStart) {
                this.isWaitingForIntroStart = false;
                this.playIntroSequence();
                return;
            }

            this.idleManager.reset();
            this.stopIntro();
            this.stopActiveHint();
        });
    }

    /**
     * Cài đặt hình nền và nhạc nền
     */
    private setupBackgroundAndAudio() {
        changeBackground('assets/images/bg/background.jpg');

        // Dừng nhạc nền cũ nếu có (tránh chồng nhạc)
        if (this.sound.get(AudioKeys.BgmNen)) {
            this.sound.stopByKey(AudioKeys.BgmNen);
        }
        // Khởi tạo và phát nhạc nền mới
        this.bgm = this.sound.add(AudioKeys.BgmNen, {
            loop: true,
            volume: 0.25,
        });
        this.bgm.play();
    }
    // =================================================================
    // PHẦN 2: TẠO GIAO DIỆN & LEVEL (UI & LEVEL CREATION)
    // =================================================================

    private createUI() {
        const UI = GameConstants.SCENE1.UI;
        const cx = GameUtils.pctX(this, 0.5);
        const scl = [1, 0.72];

        // Tính toán vị trí Board dựa trên Banner
        // const bannerY = GameUtils.pctY(this, UI.BANNER_Y);
        const bannerHeight = this.textures.get(TextureKeys.S1_Banner).getSourceImage().height * 0.7; // Scale 0.7

        const boardY = bannerHeight + GameUtils.pctY(this, UI.BOARD_OFFSET);
        const board = this.add
            .image(cx, boardY, TextureKeys.S1_Board)
            .setOrigin(0.5, 0)
            .setScale(scl[0], scl[1])
            .setDepth(0);

        board.displayWidth = GameUtils.getW(this) * 0.69;

        const boardRightX = board.x + board.displayWidth / 2;
        const boardCenterY = board.y + board.displayHeight / 2;
        // const rightBoard = this.add
        //     .image(boardRightX - 8, boardCenterY, TextureKeys.BoardRight)
        //     .setOrigin(1, 0.5)
        //     .setScale(scl[0], scl[1])
        //     .setDepth(10);
    }

    // --- LOGIC TẠO LEVEL THEO STAGE ---
    private createLevel() {
        // Load cấu hình level từ JSON
        const data = this.cache.json.get(DataKeys.LevelS1Config);
        if (data) {
            this.spawnCharacter(data.teacher);
            // this.createDecorativeLetter(data.letter);
            // this.createDecorativeObject(data.name);
        }
    }

    // private createDecorativeLetter(config: any) {
    //     if (!config) return;
    //     const cx = GameUtils.pctX(this, config.baseX_pct);
    //     const cy = GameUtils.pctY(this, config.baseY_pct);

    //     // Vẽ Frame (Khung) nếu có
    //     if (config.frameKey) {
    //         // Vẽ frame ở dưới (depth thấp hơn outline)
    //         this.add.image(cx, cy, config.frameKey)
    //             .setOrigin(0.55, 0.5)
    //             .setScale(config.baseScale)
    //             .setDepth(5);
    //     }

    //     // Chỉ hiện outline
    //     this.add.image(cx, cy, config.outlineKey)
    //         .setOrigin(0.56, 0.5)
    //         .setScale(config.baseScale * 1.3).setDepth(100);
    // }

    // private createDecorativeObject(config: any) {
    //     if (!config) return;
    //     const cx = GameUtils.pctX(this, config.baseX_pct);
    //     const cy = GameUtils.pctY(this, config.baseY_pct);

    //     // Vẽ Frame (Khung) nếu có
    //     if (config.frameKey && config.frameKey !== "") {
    //         this.add.image(cx, cy, config.frameKey)
    //             .setOrigin(0.5)
    //             .setScale(config.baseScale)
    //             .setDepth(5);
    //     }

    //     // Chỉ hiện outline (hình ảnh chính)
    //     if (config.outlineKey) {
    //         this.add.image(cx, cy, config.outlineKey)
    //             .setScale(config.baseScale)
    //             .setDepth(100);
    //     }
    // }

    private spawnCharacter(config: any) {
        const cx = GameUtils.pctX(this, config.baseX_pct);
        const cy = GameUtils.pctY(this, config.baseY_pct);

        config.parts.forEach((part: any, index: number) => {
            const id = `${part.key}_${index}`;
            const layerX = cx + part.offsetX;
            const layerY = cy + part.offsetY;

            // Tạo vùng tô màu thông qua PaintManager
            const hitArea = this.paintManager.createPaintableLayer(
                layerX,
                layerY,
                part.key,
                part.scale,
                id
            );

            // --- BEST PRACTICE: LƯU DỮ LIỆU TĨNH & TÍNH TOÁN TỰ ĐỘNG ---
            const centerOffset = GameUtils.calculateCenteredOffset(this, part.key);
            let hX = centerOffset.x;
            let hY = centerOffset.y;

            // Lưu các thông số cấu hình vào Data Manager của Game Object.
            hitArea.setData('hintX', hX);
            hitArea.setData('hintY', hY);
            hitArea.setData('originScale', part.scale); // Scale gốc (không đổi)

            // --- CẬP NHẬT: LƯU HINT POINTS ---
            if (part.hintPoints && Array.isArray(part.hintPoints)) {
                hitArea.setData('hintPoints', part.hintPoints);

            }

            this.unfinishedPartsMap.set(id, hitArea);
            this.totalParts++;
        });

        // Vẽ viền (Outline) lên trên cùng
        const outline = this.add
            .image(cx, cy, config.outlineKey)
            .setScale(config.baseScale)
            .setDepth(900)
            .setInteractive({ pixelPerfect: true });
    }

    // =================================================================
    // PHẦN 3: LOGIC GAMEPLAY (GAMEPLAY LOGIC)
    // =================================================================

    /**
     * Xử lý khi một bộ phận được tô xong
     * @param usedColors Set chứa danh sách các màu đã tô lên bộ phận này
     */
    private handlePartComplete(
        id: string,
        rt: Phaser.GameObjects.RenderTexture,
        usedColors: Set<number>
    ) {
        this.finishedParts.add(id);

        game.recordCorrect({ scoreDelta: 1 });
        this.score += 1;
        (window as any).irukaGameState.currentScore = this.score;
        sdk.score(this.score, 1);
        sdk.progress({
            levelIndex: 0,
            score: this.score,
        });
        game.finishQuestionTimer();
        if (this.finishedParts.size < this.totalParts) {
            game.startQuestionTimer();
        }

        // --- LOGIC AUTO-FILL THÔNG MINH ---
        // Nếu bé chỉ dùng ĐÚNG 1 MÀU -> Game tự động fill màu đó cho đẹp (khen thưởng)
        if (usedColors.size === 1) {
            const singleColor = usedColors.values().next().value || 0;

            rt.setBlendMode(Phaser.BlendModes.NORMAL);
            rt.fill(singleColor);
        } else {
            // Nếu bé dùng >= 2 màu (tô sặc sỡ) -> Giữ nguyên nét vẽ nghệ thuật của bé
            console.log('Multi-color artwork preserved!');
        }

        // Xóa khỏi danh sách chưa tô -> Để gợi ý không chỉ vào cái này nữa
        this.unfinishedPartsMap.delete(id);

        AudioManager.play('sfx-ting');

        // Hiệu ứng nhấp nháy báo hiệu hoàn thành
        this.tweens.add({
            targets: rt,
            alpha: 0.8,
            yoyo: true,
            duration: GameConstants.SCENE1.TIMING.AUTO_FILL,
            repeat: 2,
        });

        // Kiểm tra điều kiện thắng
        if (this.finishedParts.size >= this.totalParts) {
            console.log('WIN!');

            // --- GAME HUB COMPLETE ---
            game.finalizeAttempt();
            sdk.requestSave({
                score: this.score,
                levelIndex: 0,
            });
            sdk.progress({
                levelIndex: 0,
                total: 1,
                score: this.score,
            });

            AudioManager.play('sfx-correct_s2');

            // Xóa UI (Nút màu & Banner)
            const uiScene = this.scene.get(SceneKeys.UI) as any;
            if (uiScene) {
                if (uiScene.hidePalette) uiScene.hidePalette();
                if (uiScene.hideBanners) uiScene.hideBanners();
            }

            this.time.delayedCall(GameConstants.SCENE1.TIMING.WIN_DELAY, () => {
                this.scene.start(SceneKeys.EndGame);
            });
        }
    }

    // =================================================================
    // PHẦN 4: HƯỚNG DẪN & GỢI Ý (TUTORIAL & HINT)
    // =================================================================

    public restartIntro() {
        this.stopIntro();
        this.time.delayedCall(GameConstants.SCENE1.TIMING.RESTART_INTRO, () =>
            this.playIntroSequence()
        );
    }

    private playIntroSequence() {
        game.addHint();
        this.isIntroActive = true;
        playVoiceLocked(null, 'voice_intro_s2');
        // Đợi 1 chút rồi chạy animation tay hướng dẫn
        this.time.delayedCall(GameConstants.SCENE1.TIMING.INTRO_DELAY, () => {
            if (this.isIntroActive) this.runHandTutorial();
        });
    }

    private stopIntro() {
        this.isIntroActive = false;
        this.idleManager.start();

        if (this.handHint) {
            this.handHint.setAlpha(0).setPosition(-200, -200);
        }
    }

    /**
     * Tutorial đầu game: Tay cầm màu đỏ tô mẫu
     */
    private runHandTutorial() {
        if (!this.isIntroActive) return;

        // 1. Tìm bộ phận mục tiêu (Lấy bộ phận đầu tiên chưa tô)
        const items = Array.from(this.unfinishedPartsMap.values());
        let target: Phaser.GameObjects.Image | undefined;
        let destX = 0;
        let destY = 0;

        if (items.length > 0) {
            target = items[0]; // Lấy cái đầu tiên
            const hX = target.getData('hintX') || 0;
            const hY = target.getData('hintY') || 0;
            const originScale = target.getData('originScale') || 1;

            // Tính tọa độ đích chính xác
            destX = target.x + (hX * originScale);
            destY = target.y + (hY * originScale);
        } else {
            // Fallback nếu không có part nào (hiếm gặp)
            const UI = GameConstants.SCENE1.UI;
            destX = GameUtils.pctX(this, UI.HAND_INTRO_END_X);
            destY = GameUtils.pctY(this, UI.HAND_INTRO_END_Y);
        }

        // 2. Visual: Nhấp nháy bộ phận đó (nếu có) để gây chú ý
        // if (target) {
        //     this.activeHintTarget = target;
        //     this.tweens.add({
        //         targets: target, 
        //         alpha: { from: 0.01, to: 0.8 },
        //         scale: { from: target.getData('originScale'), to: target.getData('originScale') * 1.005 },
        //         duration: GameConstants.IDLE.FADE_IN, 
        //         yoyo: true, 
        //         repeat: 2,
        //         onComplete: () => {
        //             if (this.activeHintTarget === target) {
        //                  this.activeHintTarget = null;
        //             }
        //         }
        //     });
        // }

        const UI = GameConstants.SCENE1.UI;
        const INTRO = GameConstants.SCENE1.INTRO_HAND;

        // Tính toán tọa độ nút màu đầu tiên (Horizontal Layout)
        // Copy logic from UIScene because we need the exact position of the first button
        const spacingX = GameUtils.pctX(this, UI.PALETTE_SPACING_X);
        const paletteData = GameConstants.PALETTE_DATA;
        const totalItems = paletteData.length + 1;
        const totalWidth = (totalItems - 1) * spacingX;
        const startX = (GameUtils.getW(this) - totalWidth) / 2;

        const paletteY = GameUtils.pctY(this, UI.PALETTE_Y);

        const dragY = destY + 30; // Kéo tay xuống thấp hơn điểm đích một chút để không che mất

        if (!this.handHint) return;

        this.handHint.setOrigin(0, 0);
        // Start from the first color button position
        this.handHint.setPosition(startX, paletteY).setAlpha(0).setScale(0.7);

        // --- CẬP NHẬT LOGIC HINT POINTS ---
        const hintPoints = target?.getData('hintPoints'); // Lấy danh sách điểm gợi ý

        const tweensChain: any[] = [
            {
                alpha: 1,
                x: startX,
                y: paletteY,
                duration: INTRO.MOVE,
                ease: 'Power2',
            },
            { scale: 0.5, duration: INTRO.TAP, yoyo: true, repeat: 0.7 },
        ];

        if (hintPoints && hintPoints.length > 0) {
            // Nếu có danh sách điểm, di chuyển lần lượt qua các điểm
            const originScale = target?.getData('originScale') || 1;
            const baseX = target?.x || 0;
            const baseY = target?.y || 0;

            // Di chuyển đến điểm đầu tiên
            const firstP = hintPoints[0];
            const firstDestX = baseX + (firstP.x * originScale);
            const firstDestY = baseY + (firstP.y * originScale);

            tweensChain.push({ x: firstDestX, y: firstDestY, duration: INTRO.DRAG, delay: 100 });

            // Rub tại điểm đầu tiên
            tweensChain.push({
                x: '-=30',
                y: '-=10',
                duration: INTRO.RUB,
                yoyo: true,
                repeat: 3,
            });

            // Di chuyển qua các điểm còn lại
            for (let i = 1; i < hintPoints.length; i++) {
                const p = hintPoints[i];
                const destX = baseX + (p.x * originScale);
                const destY = baseY + (p.y * originScale);
                tweensChain.push({ x: destX, y: destY, duration: INTRO.DRAG });

                // Rub tại các điểm tiếp theo
                tweensChain.push({
                    x: '-=30',
                    y: '-=10',
                    duration: INTRO.RUB,
                    yoyo: true,
                    repeat: 3,
                });
            }

        } else {
            // Logic cũ: Drag đến center rồi Rub
            tweensChain.push({ x: destX, y: dragY, duration: INTRO.DRAG, delay: 100 });
            tweensChain.push({
                x: '-=30',
                y: '-=10',
                duration: INTRO.RUB,
                yoyo: true,
                repeat: 3,
            });
        }

        tweensChain.push({
            alpha: 0,
            duration: 500,
            onComplete: () => {
                this.handHint?.setPosition(-200, -200);
                // Lặp lại nếu Intro chưa kết thúc
                if (this.isIntroActive)
                    this.time.delayedCall(1000, () =>
                        this.runHandTutorial()
                    );
            },
        });

        // Chuỗi Animation: Hiện -> Ấn chọn màu -> Kéo ra -> Di đi di lại (tô) tại đúng vị trí -> Biến mất
        this.tweens.chain({
            targets: this.handHint,
            tweens: tweensChain,
        });
    }

    /**
     * Gợi ý khi rảnh (Idle Hint): Chọn ngẫu nhiên 1 phần chưa tô để chỉ vào
     */
    private showHint() {
        game.addHint();
        const items = Array.from(this.unfinishedPartsMap.values());
        if (items.length === 0) return;

        // Random 1 bộ phận
        const target = items[Math.floor(Math.random() * items.length)];

        AudioManager.play('hint');

        const IDLE_CFG = GameConstants.IDLE;

        // Visual 1: Nhấp nháy bộ phận đó
        this.activeHintTarget = target;
        this.activeHintTween = this.tweens.add({
            targets: target,
            alpha: { from: 0.01, to: 0.8 },
            scale: { from: target.getData('originScale'), to: target.getData('originScale') * 1.005 },
            duration: IDLE_CFG.FADE_IN,
            yoyo: true,
            repeat: 2,
            onComplete: () => {
                this.activeHintTween = null;
                this.activeHintTarget = null;
                this.idleManager.reset();
            }
        });

        // Visual 2: Bàn tay chỉ vào
        // --- FIX BUG LỆCH VỊ TRÍ (BEST PRACTICE) ---
        // Không dùng target.scaleX vì nó biến thiên khi tween.
        // Dùng originScale (lấy từ Data) để đảm bảo tính toán vị trí luôn chính xác tuyệt đối.
        const hX = target.getData('hintX') || 0;
        const hY = target.getData('hintY') || 0;
        const originScale = target.getData('originScale') || 1;

        // Tính tọa độ đích dựa trên scale gốc
        let destX = target.x + (hX * originScale);
        let destY = target.y + (hY * originScale);

        if (!this.handHint) return;

        // --- CẬP NHẬT: SET ORIGIN (0,0) ĐỂ NGÓN TAY (GÓC TRÁI TRÊN) CHỈ ĐÚNG VÀO ĐIỂM ---
        this.handHint.setOrigin(0, 0);

        // Set vị trí ban đầu (nếu có hint points thì set ở điểm đầu, ko thì destX)
        // Tuy nhiên logic hint là fade in tại chỗ, nên cần xác định chỗ nào

        const hintPoints = target?.getData('hintPoints'); // Lấy danh sách điểm gợi ý

        // Mặc định dùng destX, destY cũ làm điểm xuất phát
        let startHintX = destX;
        let startHintY = destY;

        const tweensChain: any[] = [];

        if (hintPoints && hintPoints.length > 0) {
            const baseX = target?.x || 0;
            const baseY = target?.y || 0;

            // Tính điểm đầu tiên
            const firstP = hintPoints[0];
            startHintX = baseX + (firstP.x * originScale);
            startHintY = baseY + (firstP.y * originScale);

            // 1. Hiện ra tại điểm đầu tiên
            tweensChain.push({ alpha: 1, x: startHintX, y: startHintY, duration: IDLE_CFG.FADE_IN });
            // 2. Tap tại điểm đầu tiên
            tweensChain.push({ scale: 0.5, duration: IDLE_CFG.SCALE, yoyo: true, repeat: 3 });

            // 3. Di chuyển và Tap ở các điểm tiếp theo
            for (let i = 1; i < hintPoints.length; i++) {
                const p = hintPoints[i];
                const dX = baseX + (p.x * originScale);
                const dY = baseY + (p.y * originScale);

                // Di chuyển đến
                tweensChain.push({ x: dX, y: dY, duration: IDLE_CFG.SCALE * 2 });
                // Tap
                tweensChain.push({ scale: 0.5, duration: IDLE_CFG.SCALE, yoyo: true, repeat: 3 });
            }

            // 4. Biến mất
            tweensChain.push({ alpha: 0, duration: IDLE_CFG.FADE_OUT });

        } else {
            // Logic cũ
            startHintX = destX;
            startHintY = destY;

            tweensChain.push({ alpha: 1, x: destX, y: destY, duration: IDLE_CFG.FADE_IN });
            tweensChain.push({ scale: 0.5, duration: IDLE_CFG.SCALE, yoyo: true, repeat: 3 });
            tweensChain.push({ alpha: 0, duration: IDLE_CFG.FADE_OUT });
        }

        // Không dùng OFFSET nữa vì muốn chỉ chính xác
        this.handHint.setPosition(startHintX, startHintY)
            .setAlpha(0).setScale(0.7);

        this.tweens.chain({
            targets: this.handHint,
            tweens: tweensChain
        });
    }

    private stopActiveHint() {
        if (this.activeHintTween) {
            this.activeHintTween.stop();
            this.activeHintTween = null;
        }

        if (this.activeHintTarget) {
            this.tweens.killTweensOf(this.activeHintTarget);
            this.activeHintTarget.setAlpha(0.01); // Reset about PaintManager default alpha
            this.activeHintTarget.setScale(this.activeHintTarget.getData('originScale'));
            this.activeHintTarget = null;
        }

        if (this.handHint) {
            this.tweens.killTweensOf(this.handHint);
            this.handHint.setAlpha(0).setPosition(-200, -200);
        }
    }
}
