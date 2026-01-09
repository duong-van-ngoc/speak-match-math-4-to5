    import Phaser from 'phaser';
    import { GroupCountFlow, type GroupDef } from '../logic/groupCountFlow';
    import { VoiceGuide } from '../voice/VoiceGuide';
    import { createTopBanner } from '../ui/TopBanner';
import { COUNT_GROUPS_ASSET_KEYS } from '../assets/assetKeys';
import CountGroupsDetailScene from './CountGroupsDetailScene';
import AudioManager from '../audio/AudioManager';

const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';

    type GroupViewDef = GroupDef & {
    spriteKey: string;
    x: number;
    y: number;
    cols?: number;
    };

type GroupView = {
  id: string;
  label: string;
  img: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  root: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Rectangle;
};

export default class CountGroupsScene extends Phaser.Scene {
    // UI ASSETS (keys only; paths are loaded in PreloadScene)
    // - Board: COUNT_GROUPS_ASSET_KEYS.board
    // - Banner: COUNT_GROUPS_ASSET_KEYS.topBanner (+ COUNT_GROUPS_ASSET_KEYS.topBannerText)
    // - Vehicles: COUNT_GROUPS_ASSET_KEYS.vehCar / vehBike / vehHeli / vehBoat / vehScooter
    private flow!: GroupCountFlow;
    private voice!: VoiceGuide;

    private promptText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private board?: Phaser.GameObjects.Image;
    private boardFallbackGfx?: Phaser.GameObjects.Graphics;
    private boardContentRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);
    private hintHand!: Phaser.GameObjects.Image;
    private hintTween?: Phaser.Tweens.Tween;
    private hintTimer?: Phaser.Time.TimerEvent;
    private hintBaseScale = 0.38;
    // Fine-tune hand hint placement relative to the target group root.
    private readonly handHintOffset = { x: 60, y: 50 };
    // Manual tuning: move the whole 5-icon cluster up/down (positive = down).
    private readonly groupClusterOffsetY: number = -30;
    private activeGroupId: string | null = null;
    private stage2IntroPlayed = false;
    private readonly stage2Order = ['cars', 'bikes', 'helis', 'boats', 'scooters'] as const;
    private lastStage2HintVoiceGroupId: string | null = null;
    private lastStage2HintVoiceAt = 0;

    private groupViews = new Map<string, GroupView>();

    // DATA: chỉ nội dung + asset + layout
    private groupsData: GroupViewDef[] = [
        { id: 'cars', label: 'ô tô',        count: 1, spriteKey: COUNT_GROUPS_ASSET_KEYS.vehCar,     x: 240, y: 170 },
        { id: 'bikes', label: 'xe đạp',     count: 1, spriteKey: COUNT_GROUPS_ASSET_KEYS.vehBike,    x: 1040, y: 170 },
        { id: 'helis', label: 'trực thăng', count: 1, spriteKey: COUNT_GROUPS_ASSET_KEYS.vehHeli,    x: 640, y: 360 },
        { id: 'boats', label: ' con thuyền',     count: 1, spriteKey: COUNT_GROUPS_ASSET_KEYS.vehBoat,    x: 240, y: 550 },
        { id: 'scooters', label: 'xe máy',  count: 1, spriteKey: COUNT_GROUPS_ASSET_KEYS.vehScooter, x: 1040, y: 550 },
    ];

    constructor() {
        super('CountGroupsScene');
    }

    private isAudioUnlocked(): boolean {
        try {
        return !!(window as any)[AUDIO_UNLOCKED_KEY];
        } catch {
        return false;
        }
    }

    // Called by rotateOrientation.ts when rotating from portrait -> landscape on stage 2 main screen.
    public replayStage2GuideAndPrompt() {
        if (!(this.scene as any)?.isActive?.()) return;
        void (async () => {
        try {
            if (AudioManager.has('voice_stage2_guide')) {
            await AudioManager.playVoiceInterruptAndWait?.('voice_stage2_guide', { timeoutMs: 8000 });
            }
        } catch {}
        if (!this.scene.isActive()) return;
        const next = this.getNextStage2Target();
        if (!next) return;
        this.showHintAt(next, { forceVoice: true });
        })();
    }

    init() {
        // Scene instance can be reused across replays; reset one-time flags.
        this.stage2IntroPlayed = false;
        this.activeGroupId = null;
        this.lastStage2HintVoiceGroupId = null;
        this.lastStage2HintVoiceAt = 0;
    }

    create() {
        try {
        (window as any).setGameButtonsVisible?.(true);
        } catch {}

        // Canvas is configured as transparent in `src/main.ts`, so don't draw an opaque backdrop here.

        // Ensure the detail scene is registered (phaser requires scenes to be added before launch).
        try {
        if (!this.scene.get('CountGroupsDetailScene')) {
            this.scene.add('CountGroupsDetailScene', CountGroupsDetailScene, false);
        }
        } catch {
        // ignore (already added / available)
        }

        this.ensurePlaceholderVehicleTextures();
        this.ensureHandHintTexture();
        this.createBoard();
        // Banner like Arrange High/Low (optional assets; safe no-op if missing).
        createTopBanner(
        this,
        { bannerKey: COUNT_GROUPS_ASSET_KEYS.topBanner, textKey: COUNT_GROUPS_ASSET_KEYS.topBannerTextRead },
        { yRatio: 0.09, scale: 0.52 }
        );

        this.voice = new VoiceGuide({ enabled: true });

        this.flow = new GroupCountFlow(this.groupsData.map(({ id, label, count }) => ({ id, label, count })));

        this.promptText = this.add.text(640, 26, '', {
        fontFamily: 'Arial',
        fontSize: '30px',
        color: '#1f2937',
        }).setOrigin(0.5, 0);

        this.feedbackText = this.add.text(640, 70, '', {
        fontFamily: 'Arial',
        fontSize: '26px',
        color: '#111827',
        }).setOrigin(0.5, 0);

        this.groupsData.forEach((g) => this.createGroupView(g));

        this.setPrompt('Con bấm vào một hình để đọc tên nhé');
        this.setFeedback('');

        // Gợi ý: bàn tay asset chỉ vào ô tô.
        const handKey = COUNT_GROUPS_ASSET_KEYS.handHint;
        this.hintHand = this.add.image(0, 0, handKey).setDepth(20);
        this.hintHand.setScale(this.hintBaseScale);
        this.hintHand.setAngle(-12);
        this.hintHand.setVisible(false);

        this.scale.off('resize', this.layoutScene, this);
        this.scale.on('resize', this.layoutScene, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off('resize', this.layoutScene, this);
        this.clearHint();
        });

        this.layoutScene();
        // Stage 2: play guide2 once after audio is unlocked, then guide the child step-by-step.
        const onAudioUnlocked = () => this.startStage2AudioFlow();
        window.addEventListener(AUDIO_UNLOCKED_EVENT, onAudioUnlocked, { once: true });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        window.removeEventListener(AUDIO_UNLOCKED_EVENT, onAudioUnlocked);
        });

        this.startStage2AudioFlow();
    }

    private getNextStage2Target(): (typeof this.stage2Order)[number] | null {
        for (const id of this.stage2Order) {
        if (!this.flow?.isCompleted?.(id)) return id;
        }
        return null;
    }

    private scheduleHintToNext(delayMs: number) {
        const next = this.getNextStage2Target();
        if (!next) return;
        this.scheduleHintTo(next, delayMs);
    }

    private startStage2AudioFlow() {
        if (!this.isAudioUnlocked()) return;
        if (this.stage2IntroPlayed) return;
        void (async () => {
        try {
            // Ensure audio is fully unlocked before playing guide/prompt.
            await AudioManager.unlockAndWarmup?.();
        } catch {}
        if (this.stage2IntroPlayed) return;
        this.stage2IntroPlayed = true;
        try {
            // 1) Play the general guide first (guide2).
            if (AudioManager.has('voice_stage2_guide')) {
            await AudioManager.playAndWait('voice_stage2_guide', { timeoutMs: 8000 });
            }
        } catch {}
        if (!this.scene.isActive()) return;
        const next = this.getNextStage2Target();
        if (!next) return;
        this.showHintAt(next, { forceVoice: true });
        })();
    }

    // mọi text bé nhìn thấy -> auto voice
    private setPrompt(text: string, audioKey?: string, opts?: { voice?: boolean }) {
        this.promptText.setText(text);
        if (opts?.voice === false) return;
        this.voice.speak(text, audioKey);
    }

    private setFeedback(text: string, audioKey?: string, opts?: { voice?: boolean }) {
        this.feedbackText.setText(text);
        if (opts?.voice === false) return;
        if (text.trim()) this.voice.speak(text, audioKey);
    }

    private createGroupView(g: GroupViewDef) {
        const root = this.add.container(g.x, g.y).setDepth(5);

        const img = this.textures.exists(g.spriteKey)
        ? this.add.image(0, 0, g.spriteKey)
        : this.add.circle(0, 0, 64, 0x93c5fd, 1).setStrokeStyle(3, 0x60a5fa);

        // fit image to target box
        const targetW = 200;
        const targetH = 150;
        if (img instanceof Phaser.GameObjects.Image) {
        const tex = this.textures.get(img.texture.key);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const tw = (src?.width || 1) as number;
        const th = (src?.height || 1) as number;
        img.setScale(Math.min(targetW / tw, targetH / th));
        }

        const hit = this.add
        .rectangle(0, 0, 240, 190, 0x000000, 0.001)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        root.add([img, hit]);
        hit.on('pointerdown', () => this.onGroupClicked(g.id));

        this.groupViews.set(g.id, { id: g.id, label: g.label, img, root, hit });
    }

    private onGroupClicked(groupId: string) {
        this.clearHint();
        if (this.flow.isCompleted(groupId)) {
        this.setFeedback('Nhóm này con làm xong rồi!');
        return;
        }

        // Enforce stage-2 order: finish cars -> bikes -> helis -> boats -> scooters.
        const required = this.getNextStage2Target();
        if (required && groupId !== required) {
        this.setFeedback('', undefined, { voice: false });
        this.showHintAt(required);
        return;
        }

        const g = this.flow.selectGroup(groupId);
        if (!g) return;

        const groupData = this.groupsData.find((x) => x.id === g.id);

        this.setActiveGroup(groupId);

        // Enter a dedicated "sub screen" instead of showing a popup over the main screen.
        // Main scene is put to sleep so it won't render behind.
        try {
        this.scene.stop('CountGroupsDetailScene');
        } catch {}

        // Stop any ongoing stage-2 voice when entering the sub screen to avoid carryover.
        try {
        AudioManager.stopAllVoices();
        } catch {}

        this.scene.launch('CountGroupsDetailScene', {
        groupId: g.id,
        label: g.label,
        spriteKey: groupData?.spriteKey,
        progress: { current: this.flow.completedCount, total: this.flow.totalCount },
        });

        const detail = this.scene.get('CountGroupsDetailScene') as Phaser.Scene;
        detail.events.once('exit', (result: { ok: boolean; transcript: string } | null) => {
        // Wake and resume the main scene when closing the sub screen.
        this.scene.wake();

        if (result?.ok) {
            this.onSpoken(true, g.count);
            return;
        }

        // User backed out (or closed) without completing the step.
        this.setFeedback('');
        if (this.flow.completedCount > 0) {
            this.setPrompt(`Con bấm vào hình khác để đọc tiếp (${this.flow.completedCount}/${this.flow.totalCount})`);
        } else {
            this.setPrompt('Con bấm vào một hình để đọc tên nhé');
        }
        // If not completed, show hint again after a bit.
        this.scheduleHintToNext(2000);
        });

        this.scene.sleep();
    }

    private onSpoken(ok: boolean, expectedCount: number) {
        if (!ok) {
        this.setFeedback('Chưa đúng. Con thử lại nhé!', undefined, { voice: false });
        try {
            AudioManager.playStage2Praise(false);
            AudioManager.playWhenReady?.('sfx_wrong');
        } catch {}
        return;
        }

        const res = this.flow.submitCount(expectedCount);
        if (!res) return;

        const view = this.groupViews.get(res.groupId);
        if (!view) return;

        if (res.ok) {
        view.hit.disableInteractive();
        this.setFeedback('Giỏi lắm! Con đọc đúng rồi!', undefined, { voice: false });
        try {
            AudioManager.playStage2Praise(true);
            AudioManager.playWhenReady?.('sfx_correct');
        } catch {}
        this.setActiveGroup(null);

        this.tweens.add({ targets: view.root, scale: 1.06, duration: 120, yoyo: true, repeat: 1 });
        }

        if (res.done) {
        this.setPrompt('Hoàn thành!', undefined, { voice: false });
        this.setFeedback('Con giỏi quá!', undefined, { voice: false });
        try {
            AudioManager.playWhenReady?.('voice_complete');
        } catch {}
        this.time.delayedCall(400, () => {
            this.events.emit('minigame:done', {
            ok: true,
            completed: this.flow.completedCount,
            total: this.flow.totalCount,
            });
        });
        } else {
        this.setPrompt(`Con bấm vào hình khác để đọc tiếp (${this.flow.completedCount}/${this.flow.totalCount})`);
        // After finishing the current sub-screen, point to the next item (then speak).
        const next = this.getNextStage2Target();
        if (next) this.time.delayedCall(350, () => this.showHintAt(next));
        }
    }

    private setActiveGroup(groupId: string | null) {
        this.activeGroupId = groupId;
        if (groupId) this.moveHintHandTo(groupId);
        else this.hintHand?.setVisible(false);
    }

    private moveHintHandTo(groupId: string) {
        const view = this.groupViews.get(groupId);
        if (!view || !this.hintHand) return;
        const k = this.getUiScale();
        this.hintHand.setVisible(true);
        this.hintHand.setScale(this.hintBaseScale * k);
        this.hintHand.setPosition(view.root.x + this.handHintOffset.x * k, view.root.y + this.handHintOffset.y * k);
    }

    private createBoard() {
        // Use the same board asset as Quantity scene.
        const boardKey = COUNT_GROUPS_ASSET_KEYS.board;
        if (this.textures.exists(boardKey)) {
        this.board = this.add.image(0, 0, boardKey).setOrigin(0.5).setDepth(1);
        return;
        }

        // Fallback (should not happen if PreloadScene loaded Rectangle 1.png).
        this.boardFallbackGfx = this.add.graphics().setDepth(1);
    }

    private layoutScene() {
        const w = this.scale.width;
        const h = this.scale.height;

        // Layout board
        if (this.board) {
        const boardKey = this.board.texture.key;
        const tex = this.textures.get(boardKey);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const tw = (src?.width || 1) as number;
        const th = (src?.height || 1) as number;

        // Slightly smaller and pushed down to make room for banner.
        const scale = Math.min((w * 0.96) / tw, (h * 0.78) / th);
        const boardOffsetY = h * 0.07;

        this.board.setAngle(0);
        this.board.setPosition(w / 2, h / 2 + boardOffsetY);
        this.board.setScale(scale);

        const bw = tw * scale;
        const bh = th * scale;

        // Content rect inside the board frame.
        const padX = bw * 0.065;
        const padTop = bh * 0.14;
        const padBottom = bh * 0.10;
        const boardCenterY = h / 2 + boardOffsetY;

        this.boardContentRect.setTo(
            w / 2 - bw / 2 + padX,
            boardCenterY - bh / 2 + padTop,
            bw - padX * 2,
            bh - padTop - padBottom
        );
        } else if (this.boardFallbackGfx) {
        const bw = w * 0.92;
        const bh = h * 0.82;
        const x = w / 2 - bw / 2;
        const y = h / 2 - bh / 2 + h * 0.06;

        this.boardFallbackGfx.clear();
        this.boardFallbackGfx.fillStyle(0xffffff, 1);
        this.boardFallbackGfx.lineStyle(6, 0x0ea5e9, 1);
        this.boardFallbackGfx.fillRoundedRect(x, y, bw, bh, 22);
        this.boardFallbackGfx.strokeRoundedRect(x, y, bw, bh, 22);

        const padX = bw * 0.06;
        const padTop = bh * 0.14;
        const padBottom = bh * 0.1;
        this.boardContentRect.setTo(x + padX, y + padTop, bw - padX * 2, bh - padTop - padBottom);
        }

        // Layout 5 items inside content rect
        if (this.boardContentRect.width > 0) {
        // Layout: heli in center, 4 others in 4 corners.
        const r = this.boardContentRect;
        const cornerPadX = r.width * 0.18;
        const cornerPadY = r.height * 0.20;

        const leftX = r.left + cornerPadX;
        const rightX = r.right - cornerPadX;
        const topY = r.top + cornerPadY;
        const bottomY = r.bottom - cornerPadY;

        const posById: Record<string, { x: number; y: number }> = {
            cars: { x: leftX, y: topY },
            bikes: { x: rightX, y: topY },
            helis: { x: r.centerX, y: r.centerY },
            boats: { x: leftX, y: bottomY },
            scooters: { x: rightX, y: bottomY },
        };

        this.groupViews.forEach((v, id) => {
            const pos = posById[id];
            if (!pos) return;
            v.root.setPosition(pos.x, pos.y);
        });

        // Nudge the whole cluster so the visual top/bottom margins inside the board are equal,
        // taking actual rendered bounds into account (icons have different heights).
        const ids = ['cars', 'bikes', 'helis', 'boats', 'scooters'] as const;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let any = false;
        for (const id of ids) {
            const v = this.groupViews.get(id);
            if (!v) continue;
            // Use the vehicle image bounds (not the hit area / tick) to balance margins visually.
            const b = v.img.getBounds();
            minY = Math.min(minY, b.top);
            maxY = Math.max(maxY, b.bottom);
            any = true;
        }
        if (any) {
            const topMargin = minY - r.top;
            const bottomMargin = r.bottom - maxY;
            const dy = (bottomMargin - topMargin) / 2;
            if (Math.abs(dy) > 0.5) {
            for (const id of ids) {
                const v = this.groupViews.get(id);
                if (!v) continue;
                v.root.y += dy;
            }
            }
        }

        // Manual tweak after auto-balance.
        if (this.groupClusterOffsetY !== 0) {
        for (const id of ids) {
            const v = this.groupViews.get(id);
            if (!v) continue;
            v.root.y += this.groupClusterOffsetY;
        }
        }
        }

        // If a group is active, keep the hint hand near it.
        if (this.activeGroupId) this.moveHintHandTo(this.activeGroupId);
    }

    private scheduleHintTo(groupId: string, delayMs: number) {
        if (this.flow?.isCompleted?.(groupId)) return;
        if (this.hintTimer) {
        try {
            this.hintTimer.remove(false);
        } catch {}
        }
        this.hintTimer = this.time.delayedCall(delayMs, () => {
        if (this.activeGroupId && this.activeGroupId !== groupId) return;
        if (this.flow?.isCompleted?.(groupId)) return;
        this.showHintAt(groupId);
        });
    }

    private showHintAt(groupId: string, opts?: { voice?: boolean; forceVoice?: boolean }) {
        this.moveHintHandTo(groupId);
        // Speak exactly when the hand points (only for the current required item).
        const allowVoice = opts?.voice !== false;
        const forceVoice = opts?.forceVoice === true;
        const required = this.getNextStage2Target();
        if (allowVoice && required && groupId === required) {
        const now = Date.now();
        const tooSoon = this.lastStage2HintVoiceGroupId === groupId && now - this.lastStage2HintVoiceAt < 2500;
        if (forceVoice || !tooSoon) {
            this.lastStage2HintVoiceGroupId = groupId;
            this.lastStage2HintVoiceAt = now;
            try {
            AudioManager.playStage2ItemPrompt(groupId);
            } catch {}
        }
        }
        try {
        this.hintTween?.stop();
        } catch {}

        const startScale = this.hintBaseScale * this.getUiScale();
        this.hintHand.setScale(startScale);
        this.hintTween = this.tweens.add({
        targets: this.hintHand,
        scale: startScale * 1.08,
        duration: 240,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        });
    }

    private getUiScale() {
        return Math.min(this.scale.width / 1280, this.scale.height / 720);
    }

    private clearHint() {
        if (this.hintTimer) {
        try {
            this.hintTimer.remove(false);
        } catch {}
        this.hintTimer = undefined;
        }
        if (this.hintTween) {
        try {
            this.hintTween.stop();
        } catch {}
        this.hintTween = undefined;
        }
        this.hintHand?.setVisible(false);
    }

    private ensurePlaceholderVehicleTextures() {
        const ensure = (key: string, fill: number) => {
        if (this.textures.exists(key)) return;
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(fill, 1);
        g.fillRoundedRect(0, 0, 260, 200, 26);
        g.lineStyle(6, 0xffffff, 0.9);
        g.strokeRoundedRect(10, 10, 240, 180, 22);
        g.generateTexture(key, 260, 200);
        g.destroy();
        };

        // Nếu chưa có asset thật, tạo placeholder để bố cục vẫn giống.
        ensure(COUNT_GROUPS_ASSET_KEYS.vehCar, 0x97ceff); // ô tô
        ensure(COUNT_GROUPS_ASSET_KEYS.vehBike, 0xffd294); // xe đạp
        ensure(COUNT_GROUPS_ASSET_KEYS.vehHeli, 0xcff15e); // máy bay
        ensure(COUNT_GROUPS_ASSET_KEYS.vehBoat, 0xffc526); // con thuyền
        ensure(COUNT_GROUPS_ASSET_KEYS.vehScooter, 0xff7677); // xe máy
    }

    private ensureHandHintTexture() {
        const key = COUNT_GROUPS_ASSET_KEYS.handHint;
        if (this.textures.exists(key)) return;

        // Fallback (should not happen if PreloadScene loaded assets/icon/hand.png).
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xfbbf24, 1);
        g.fillRoundedRect(0, 0, 120, 120, 28);
        g.lineStyle(6, 0xffffff, 0.9);
        g.strokeRoundedRect(8, 8, 104, 104, 24);
        g.generateTexture(key, 120, 120);
        g.destroy();
    }
    }
