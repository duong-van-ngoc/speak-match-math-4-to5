    // src/game/scenes/LessonScene.ts
    import Phaser from 'phaser';
    import type { LessonPackage, LessonItem } from '../types/lesson';
    import { GAME_WIDTH, GAME_HEIGHT } from '../config';
    import { domBackgroundManager } from '../domBackground';
    import AudioManager from '../../audio/AudioManager';
    import { showGameButtons } from '../../main';

    type AnswerLog = {
    lessonId: string;
    itemId: string;
    optionId: string;
    isCorrect: boolean;
    index: number;
    difficulty: number;
    timestamp: number;
    };

    export class LessonScene extends Phaser.Scene {
    // ✅ chỉ cần 1 lần chạm toàn app là unlock (persist trong runtime)
    private static audioUnlocked = false;

    // ✅ duck CHỈ 1 LẦN DUY NHẤT khi mới vào game (trong runtime)
    private static duckedOnceAtGameStart = false;

    private lesson!: LessonPackage;
    private index = 0;
    private score = 0;

    // bgm volume
    private readonly BGM_NORMAL_VOL = 0.4;
    private readonly BGM_DUCK_VOL = 0.08;

    private boy?: Phaser.GameObjects.Image;

    private promptText!: Phaser.GameObjects.Text;
    private promptImage?: Phaser.GameObjects.Image;

    private questionBar?: Phaser.GameObjects.Image;
    private questionBarBaseWidth = 0;
    private questionBarBaseScaleX = 1;
    private questionBarBaseScaleY = 1;

    private optionImages: Phaser.GameObjects.Image[] = [];
    private optionPanels: Phaser.GameObjects.Image[] = [];

    private lastBinaryCorrectSide: 'left' | 'right' | null = null;
    private lockInput = false;

    private answerLogs: AnswerLog[] = [];

    // ===== AUTO REPLAY PROMPT =====
    private promptReplayTimer?: Phaser.Time.TimerEvent;
    private lastInteractionAt = 0;
    private readonly PROMPT_REPLAY_DELAY_MS = 10_000;

    constructor() {
        super('LessonScene');
    }

    init(data: { lesson: LessonPackage }) {
        (window as any).__currentLesson = data.lesson;
        console.log('POOL size', window.__lessonPool?.length);
    


        this.lesson = data.lesson;

        // reset state mỗi lần vào lesson
        this.index = 0;
        this.score = 0;
        this.answerLogs = [];
        this.lockInput = false;

        // clear option cũ (an toàn)
        this.optionImages.forEach((img) => img.destroy());
        this.optionPanels.forEach((p) => p.destroy());
        this.optionImages = [];
        this.optionPanels = [];
    }

    private setBgmVolumeSafe(v: number) {
        const bgm: any = (window as any).phaserBgm;
        if (!bgm) return;

        try {
        // Phaser Sound
        if (typeof bgm.setVolume === 'function') {
            bgm.setVolume(v);
            return;
        }
        // Phaser Sound (property)
        if (typeof bgm.volume === 'number') {
            bgm.volume = v;
            return;
        }
        // Howler Howl (nếu lỡ gán bgm từ Howler)
        if (typeof bgm.volume === 'function') {
            bgm.volume(v);
            return;
        }
        } catch {}
    }

    private ensureBgm() {
        const w = window as any;

        if (w.phaserBgm && w.phaserBgm.isPlaying) {
        // luôn giữ bgm ở mức thường khi đảm bảo bgm
        this.setBgmVolumeSafe(this.BGM_NORMAL_VOL);
        return;
        }

        const bgm = this.sound.add('bgm_main', {
        loop: true,
        volume: this.BGM_NORMAL_VOL,
        });
        bgm.play();
        w.phaserBgm = bgm;

        this.setBgmVolumeSafe(this.BGM_NORMAL_VOL);
    }

    /**
     * duckAtGameStart = true  -> chỉ duck đúng 1 lần duy nhất toàn game runtime
     * duckAtGameStart = false -> không duck
     */
    private playCurrentPrompt(duckAtGameStart = false) {
        if (!LessonScene.audioUnlocked) return;

        const item = this.lesson.items[this.index];
        if (!item) return;

        const audioKey = item.promptAudio || this.lesson.defaultPromptAudio || null;
        if (!audioKey) return;

        const shouldDuckOnce =
        duckAtGameStart && !LessonScene.duckedOnceAtGameStart;

        if (shouldDuckOnce) {
        LessonScene.duckedOnceAtGameStart = true;
        this.setBgmVolumeSafe(this.BGM_DUCK_VOL);
        }

        // ⚠️ AudioManager.playOneShot của bạn phải hỗ trợ callback kết thúc.
        // Nếu chưa có callback, nói mình để mình đưa bản AudioManager tương thích.
        AudioManager.playOneShot(audioKey, 1.0, () => {
        if (shouldDuckOnce) this.setBgmVolumeSafe(this.BGM_NORMAL_VOL);
        });
    }

    // ===== replay helpers =====
    private clearPromptReplayTimer() {
        if (this.promptReplayTimer) {
        this.promptReplayTimer.remove(false);
        this.promptReplayTimer = undefined;
        }
    }

    private resetPromptReplayTimer() {
        this.clearPromptReplayTimer();

        // chưa unlock audio thì khỏi set timer
        if (!LessonScene.audioUnlocked) return;

        const scheduledAt = Date.now();
        this.promptReplayTimer = this.time.delayedCall(
        this.PROMPT_REPLAY_DELAY_MS,
        () => {
            if (this.lastInteractionAt > scheduledAt) return;
            if (!this.scene.isActive()) return;
            if (!this.scene.isVisible()) return;

            // ✅ auto replay: KHÔNG duck
            this.playCurrentPrompt(false);

            this.resetPromptReplayTimer();
        }
        );
    }

    private markInteraction() {
        this.lastInteractionAt = Date.now();
        this.resetPromptReplayTimer();
    }

    async create() {
        (window as any).lessonScene = this;

        // --- SDK: Khởi tạo trạng thái và set tổng số câu hỏi ---
        // Khai báo irukaGameState vào global Window
        (window as any).irukaGameState = {
            startTime: Date.now(),
            currentScore: 0,
        };
        // Nếu có levels thì set tổng cho SDK
        // Import sdk từ main
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        // import { sdk } from '../../main';
        // Nếu có levels thì set tổng cho SDK
        try {
            // import động để tránh lỗi vòng lặp import
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mainMod = await import('../../main');
            if ((this as any).levels && mainMod.sdk && mainMod.sdk.progress) {
                const totalLevels = (this as any).levels.length;
                mainMod.sdk.progress({ levelIndex: 0, total: totalLevels });
            }
            // Set tổng số câu hỏi cho SDK
            const irukaSdk = await import('@iruka-edu/mini-game-sdk');
            irukaSdk.game.setTotal?.(5); // Sửa lại số 5 nếu cần
        } catch {}

        domBackgroundManager.setBackground();

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.clearPromptReplayTimer();
        });

        // ===== HEADER =====
        const centerX = GAME_WIDTH / 2 + 60;
        const centerY = 60;

        if (this.textures.exists('question_bar')) {
        const baseDisplayWidth = GAME_WIDTH * 0.4;
        const bar = this.add.image(centerX, centerY, 'question_bar').setOrigin(0.5);

        const texW = bar.width || 1;
        bar.setScale(baseDisplayWidth / texW);

        this.questionBar = bar;
        this.questionBarBaseWidth = bar.displayWidth;
        this.questionBarBaseScaleX = bar.scaleX;
        this.questionBarBaseScaleY = bar.scaleY;
        }

        // Prompt TEXT fallback
        this.promptText = this.add
        .text(centerX, centerY, '', {
            font: '700 35px "Baloo 2"',
            color: '#ffffff',
            align: 'center',
            padding: { top: 10, bottom: 10 },
        })
        .setOrigin(0.5, 0.7)
        .setDepth(1)
        .setVisible(false);

        this.promptImage = undefined;

        // ✅ luôn render câu hỏi + options ngay (không phụ thuộc unlock)
        this.showQuestion();

        // ===== Unlock audio chỉ lần đầu =====
        if (LessonScene.audioUnlocked) {
        this.ensureBgm();

        // ✅ chỉ duck 1 lần duy nhất toàn game runtime (lần phát prompt đầu tiên)
        this.playCurrentPrompt(true);

        this.markInteraction();
        } else {
        const tapBlocker = this.add
            .rectangle(
            GAME_WIDTH / 2,
            GAME_HEIGHT / 2,
            GAME_WIDTH,
            GAME_HEIGHT,
            0x000000,
            0.001
            )
            .setDepth(999)
            .setInteractive();

        tapBlocker.once('pointerdown', () => {
            LessonScene.audioUnlocked = true;
            tapBlocker.destroy();

            this.ensureBgm();

            // ✅ chỉ duck 1 lần duy nhất toàn game runtime
            this.playCurrentPrompt(true);

            this.markInteraction();
        });
        }

        // ===== Nhân vật đồng hành =====
        const characterKeys = ['char'];
        const availableKeys = characterKeys.filter((key) => this.textures.exists(key));

        if (availableKeys.length > 0) {
        const chosenKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];

        const baseX = 140;
        const baseY = GAME_HEIGHT - 40;

        this.boy = this.add.image(baseX, baseY, chosenKey).setOrigin(0.5, 1);

        const MAX_H = 350;
        const MAX_W = 220;

        const texW = this.boy.width || 1;
        const texH = this.boy.height || 1;

        const scale = Math.min(MAX_H / texH, MAX_W / texW);
        this.boy.setScale(scale);

        this.boy.setDepth(-1);

        this.tweens.add({
            targets: this.boy,
            y: this.boy.y - 10,
            duration: 1000,
            yoyo: true,
            repeat: -1,
        });
        }

        showGameButtons();
        (window as any).__preloadRunning = false;

    }

    // ===== Hiển thị 1 câu hỏi =====
    private updateQuestionBarToFitPromptImage() {
        if (!this.questionBar || !this.promptImage) return;

        const padding = 120;
        const neededWidth = this.promptImage.displayWidth + padding;

        const baseWidth = this.questionBarBaseWidth || this.questionBar.displayWidth || 1;

        let scaleX = this.questionBarBaseScaleX;
        if (neededWidth > baseWidth) {
        scaleX = this.questionBarBaseScaleX * (neededWidth / baseWidth);
        }

        this.questionBar.setScale(scaleX, this.questionBarBaseScaleY);
        this.questionBar.setPosition(this.promptImage.x, this.promptImage.y);
    }

    private showQuestion() {
        const item = this.lesson.items[this.index];
        if (!item) {
        this.endLesson();
        return;
        }

        this.lockInput = false;

        const centerX = GAME_WIDTH / 2 + 60;
        const centerY = 60;

        if (this.questionBar) {
            this.questionBar.setScale(this.questionBarBaseScaleX, this.questionBarBaseScaleY);
            this.questionBar.setPosition(centerX, centerY);
            }
        const promptKey =
        (item as any).promptImage || (this.lesson as any).defaultPromptImage;

        if (this.promptImage) {
        this.promptImage.destroy();
        this.promptImage = undefined;
        }

        if (promptKey && this.textures.exists(promptKey)) {
        this.promptText.setVisible(false);

        this.promptImage = this.add
            .image(centerX, centerY, promptKey)
            .setOrigin(0.5)
            .setDepth(1);

        if (this.questionBar) {
        const baseBarW = this.questionBarBaseWidth || this.questionBar.displayWidth;
        const baseBarH = (this.questionBar.height || 1) * this.questionBarBaseScaleY; // base display height
        const maxW = baseBarW * 0.9;
        const maxH = baseBarH * 0.9;


            const texW = this.promptImage.width || 1;
            const texH = this.promptImage.height || 1;

            const s = Math.min(maxW / texW, maxH / texH);
            this.promptImage.setScale(s);
        }

        this.updateQuestionBarToFitPromptImage();
        } else {
        const text = item.promptText || (this.lesson as any).defaultPromptText || '';
        this.promptText.setText(text);
        this.promptText.updateText();
        this.promptText.setVisible(true);
        }

        // clear options cũ
        this.optionImages.forEach((img) => img.destroy());
        this.optionPanels.forEach((p) => p.destroy());
        this.optionImages = [];
        this.optionPanels = [];

        this.renderOptions(item);
    }

    private computeItemScale(
        opts: LessonItem['options'],
        panelWidth: number,
        panelHeight: number,
        padding: number = 40
    ): number {
        const maxW = panelWidth - padding;
        const maxH = panelHeight - padding;

        let maxOriginalW = 0;
        let maxOriginalH = 0;

        opts.forEach((opt) => {
        const tex = this.textures.get(opt.image);
        if (!tex) return;

        const frame = tex.getSourceImage() as HTMLImageElement;
        const w = frame.width;
        const h = frame.height;

        if (!w || !h) return;

        if (w > maxOriginalW) maxOriginalW = w;
        if (h > maxOriginalH) maxOriginalH = h;
        });

        if (maxOriginalW === 0 || maxOriginalH === 0) return 1;

        const scaleToFit = Math.min(maxW / maxOriginalW, maxH / maxOriginalH);
        return Math.min(1, scaleToFit);
    }

    private alignImageBottomInPanel(
        img: Phaser.GameObjects.Image,
        panelCenterY: number,
        panelHeight: number,
        paddingBottom: number = 30
    ) {
        const scaledHeight = img.height * img.scaleY;
        const panelBottom = panelCenterY + panelHeight / 2;
        const bottomY = panelBottom - paddingBottom;
        img.setY(bottomY - scaledHeight / 2);
    }

    private addOptionShakeAnimation(icon: Phaser.GameObjects.Image) {
        this.tweens.add({
        targets: icon,
        angle: { from: -3, to: 3 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        });
    }

    private arrangeBinaryOptionsByCorrect(item: LessonItem): LessonItem['options'] {
        const opts = [...item.options];
        if (opts.length !== 2) return opts;

        const correct = opts.find((o) => o.id === item.correctOptionId);
        const wrong = opts.find((o) => o.id !== item.correctOptionId);
        if (!correct || !wrong) return opts;

        let correctSide: 'left' | 'right';
        if (this.lastBinaryCorrectSide === null) {
        correctSide = Math.random() < 0.5 ? 'left' : 'right';
        } else {
        correctSide = this.lastBinaryCorrectSide === 'left' ? 'right' : 'left';
        }

        this.lastBinaryCorrectSide = correctSide;
        return correctSide === 'left' ? [correct, wrong] : [wrong, correct];
    }

    private renderOptions(item: LessonItem) {
        let opts = [...item.options];
        const count = opts.length;

        if (count === 2) opts = this.arrangeBinaryOptionsByCorrect(item);

        const centerY = GAME_HEIGHT / 2 + 40;

        this.optionImages.forEach((img) => img.destroy());
        this.optionPanels.forEach((p) => p.destroy());
        this.optionImages = [];
        this.optionPanels = [];

        const alignByHeight = this.lesson.concept === 'HEIGHT';

        if (count === 2) {
        const spacing = 440;
        const startX = GAME_WIDTH / 2 - ((count - 1) * spacing) / 2 + 60;
        const panelY = centerY;
        const panelW = 420;
        const panelH = 520;

        const scale = this.computeItemScale(opts, panelW, panelH, 60) * 0.8;

        opts.forEach((opt, idx) => {
            const x = startX + idx * spacing;

            const panel = this.add
            .image(x, panelY, 'panel_bg')
            .setOrigin(0.5)
            .setDisplaySize(panelW, panelH);
            panel.setInteractive({ useHandCursor: true });

            const img = this.add.image(x, panelY, opt.image).setOrigin(0.5);
            img.setScale(scale);
            img.setInteractive({ useHandCursor: true });

            if (alignByHeight) this.alignImageBottomInPanel(img, panelY, panelH, 40);

            this.addOptionShakeAnimation(img);

            const handleClick = () => this.onSelect(item, opt.id, img, panel);
            panel.on('pointerdown', handleClick);
            img.on('pointerdown', handleClick);

            panel.setData('panelKeys', {
            base: 'panel_bg',
            correct: 'panel_bg_correct',
            wrong: 'panel_bg_wrong',
            });

            this.optionImages.push(img);
            this.optionPanels.push(panel);
        });
        } else if (count === 3) {
        const spacing = 310;
        const startX = GAME_WIDTH / 2 - spacing + 80;
        const panelY = centerY + 10;
        const panelW = 300;
        const panelH = 400;

        const scale = this.computeItemScale(opts, panelW, panelH, 50);

        opts.forEach((opt, idx) => {
            const x = startX + idx * spacing;

            const panel = this.add
            .image(x, panelY, 'panel_bg')
            .setOrigin(0.5)
            .setDisplaySize(panelW, panelH);
            panel.setInteractive({ useHandCursor: true });

            const img = this.add.image(x, panelY, opt.image).setOrigin(0.5);
            img.setScale(scale);
            img.setInteractive({ useHandCursor: true });

            if (alignByHeight) this.alignImageBottomInPanel(img, panelY, panelH, 35);

            this.addOptionShakeAnimation(img);

            const handleClick = () => this.onSelect(item, opt.id, img, panel);
            panel.on('pointerdown', handleClick);
            img.on('pointerdown', handleClick);

            panel.setData('panelKeys', {
            base: 'panel_bg',
            correct: 'panel_bg_correct',
            wrong: 'panel_bg_wrong',
            });

            this.optionImages.push(img);
            this.optionPanels.push(panel);
        });
        } else if (count === 4) {
        const colSpacing = 430;
        const rowSpacing = 290;

        const centerX = GAME_WIDTH / 2 + 60;
        const topY = centerY - rowSpacing / 2;
        const bottomY = centerY + rowSpacing / 2;

        const positions = [
            { x: centerX - colSpacing / 2, y: topY },
            { x: centerX + colSpacing / 2, y: topY },
            { x: centerX - colSpacing / 2, y: bottomY },
            { x: centerX + colSpacing / 2, y: bottomY },
        ];

        const panelW = 420;
        const panelH = 280;

        const scale = this.computeItemScale(opts, panelW, panelH, 40);

        opts.forEach((opt, idx) => {
            const pos = positions[idx] ?? positions[positions.length - 1];

            const panel = this.add
            .image(pos.x, pos.y, 'panel_bg_1')
            .setOrigin(0.5)
            .setDisplaySize(panelW, panelH);
            panel.setInteractive({ useHandCursor: true });

            const img = this.add.image(pos.x, pos.y, opt.image).setOrigin(0.5);
            img.setScale(scale);
            img.setInteractive({ useHandCursor: true });

            if (alignByHeight) this.alignImageBottomInPanel(img, pos.y, panelH, 30);

            this.addOptionShakeAnimation(img);

            const handleClick = () => this.onSelect(item, opt.id, img, panel);
            panel.on('pointerdown', handleClick);
            img.on('pointerdown', handleClick);

            panel.setData('panelKeys', {
            base: 'panel_bg_1',
            correct: 'panel_bg_1_correct',
            wrong: 'panel_bg_1_wrong',
            });

            this.optionImages.push(img);
            this.optionPanels.push(panel);
        });
        } else {
        const spacing = 240;
        const startX = GAME_WIDTH / 2 - ((count - 1) * spacing) / 2;
        const panelY = centerY + 10;
        const panelW = 320;
        const panelH = 380;

        const scale = this.computeItemScale(opts, panelW, panelH, 40);

        opts.forEach((opt, idx) => {
            const x = startX + idx * spacing;

            const panel = this.add
            .image(x, panelY, 'panel_bg')
            .setOrigin(0.5)
            .setDisplaySize(panelW, panelH);
            panel.setInteractive({ useHandCursor: true });

            const img = this.add.image(x, panelY, opt.image).setOrigin(0.5);
            img.setScale(scale);
            img.setInteractive({ useHandCursor: true });

            if (alignByHeight) this.alignImageBottomInPanel(img, panelY, panelH, 35);

            this.addOptionShakeAnimation(img);

            const handleClick = () => this.onSelect(item, opt.id, img, panel);
            panel.on('pointerdown', handleClick);
            img.on('pointerdown', handleClick);

            panel.setData('panelKeys', {
            base: 'panel_bg',
            correct: 'panel_bg_correct',
            wrong: 'panel_bg_wrong',
            });

            this.optionImages.push(img);
            this.optionPanels.push(panel);
        });
        }
    }

    private onSelect(
        item: LessonItem,
        optId: string,
        img: Phaser.GameObjects.Image,
        panel: Phaser.GameObjects.Image
    ) {
        this.markInteraction();

        if (this.lockInput) return;
        this.lockInput = true;

        AudioManager.stopAllExceptBgm();

        const isCorrect = optId === item.correctOptionId;

        const keys = panel.getData('panelKeys') as
        | { base: string; correct: string; wrong: string }
        | undefined;

        const baseKey = keys?.base ?? 'panel_bg';
        const correctKey = keys?.correct ?? 'panel_bg_correct';
        const wrongKey = keys?.wrong ?? 'panel_bg_wrong';

        this.answerLogs.push({
        lessonId: this.lesson.lessonId,
        itemId: item.id,
        optionId: optId,
        isCorrect,
        index: this.index,
        difficulty: item.difficulty,
        timestamp: Date.now(),
        });

        if (isCorrect) {
        this.score++;
        AudioManager.play('correct');
        AudioManager.playRandomCorrectAnswer();

        if (this.textures.exists(correctKey)) panel.setTexture(correctKey);

        const targets: Phaser.GameObjects.GameObject[] = [panel, img];

        this.tweens.add({
            targets,
            scaleX: panel.scaleX * 1.03,
            scaleY: panel.scaleY * 1.03,
            yoyo: true,
            duration: 150,
            repeat: 1,
            onComplete: () => {
            this.time.delayedCall(1100, () => {
                this.clearPromptReplayTimer();

                this.scene.pause();
                this.scene.setVisible(false);
                this.scene.launch('HintScene', { item, concept: this.lesson.concept });
            });
            },
        });
        } else {
        AudioManager.play('wrong');

        if (this.textures.exists(wrongKey)) panel.setTexture(wrongKey);

        const targets: Phaser.GameObjects.GameObject[] = [panel, img];

        this.tweens.add({
            targets,
            x: '+=10',
            yoyo: true,
            duration: 70,
            repeat: 3,
            onComplete: () => {
            panel.setTexture(baseKey);
            this.lockInput = false;
            },
        });
        }
    }

    public goToNextQuestionFromHint() {
        this.scene.setVisible(true);
        this.nextQuestion();
    }

    private nextQuestion() {
        this.markInteraction();

        this.index++;
        domBackgroundManager.setBackground();
        this.showQuestion();

        // ✅ các câu tiếp theo: KHÔNG duck
        if (LessonScene.audioUnlocked) {
        this.ensureBgm();
        this.playCurrentPrompt(false);
        }
    }

    private endLesson() {
        this.clearPromptReplayTimer();
        console.log('Answer logs:', this.answerLogs);

        this.scene.start('SummaryScene', {
        score: this.score,
        total: this.lesson.items.length,
        });
    }

    public restartLevel() {
        if (!this.lesson) return;

        this.markInteraction();

        AudioManager.stopAllExceptBgm();
        AudioManager.play('sfx-click');

        this.index = 0;
        this.score = 0;
        this.lockInput = false;
        this.answerLogs = [];

        this.optionImages.forEach((img) => img.destroy());
        this.optionPanels.forEach((panel) => panel.destroy());
        this.optionImages = [];
        this.optionPanels = [];

        domBackgroundManager.setBackground();
        this.showQuestion();

        // ✅ restart cũng KHÔNG duck (vì chỉ duck lúc mới vào game)
        if (LessonScene.audioUnlocked) {
        this.ensureBgm();
        this.playCurrentPrompt(false);
        this.resetPromptReplayTimer();
        }
    }

    public goToNextLevel() {
        this.markInteraction();

        AudioManager.stopAllExceptBgm();
        AudioManager.play('sfx-click');

        if (!this.lesson) return;
        if (this.lockInput) return;

        this.lockInput = true;

        const item = this.lesson.items[this.index];
        if (item) {
        this.answerLogs.push({
            lessonId: this.lesson.lessonId,
            itemId: item.id,
            optionId: 'SKIP',
            isCorrect: false,
            index: this.index,
            difficulty: item.difficulty,
            timestamp: Date.now(),
        });
        }

        this.nextQuestion();
    }
    }
