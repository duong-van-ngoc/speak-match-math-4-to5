    import Phaser from 'phaser';
    import { ConnectSixFlow, type ConnectGroupDef } from '../logic/connectSixFlow';
    import { CONNECT_SIX_ASSET_KEYS } from '../assets/assetKeys';
    import { createTopBanner } from '../ui/TopBanner';
    import AudioManager from '../audio/AudioManager';

    // ===== ASSETS (keys only; paths are loaded in PreloadScene) =====
    // - Board: CONNECT_SIX_ASSET_KEYS.board
    // - Banner: CONNECT_SIX_ASSET_KEYS.topBanner (+ CONNECT_SIX_ASSET_KEYS.topBannerText)
    // - Center dice: CONNECT_SIX_ASSET_KEYS.dice
    // - Vehicles: pack `spriteKey` values (e.g. veh_car, veh_bike, ...)

    type GroupViewDef = ConnectGroupDef & {
    spriteKey: string;
    x: number;
    y: number;
    cols?: number;
    };

    type GroupView = {
    id: string;
    label: string;
    count: number;
    root: Phaser.GameObjects.Container;
    icon: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
    hit: Phaser.GameObjects.Rectangle;
    };

    export default class ConnectSixScene extends Phaser.Scene {
    private flow!: ConnectSixFlow;

    private promptText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;

    private board?: Phaser.GameObjects.Image;
    private boardFallbackGfx?: Phaser.GameObjects.Graphics;
    private boardContentRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);

    // dice target
    private diceRoot!: Phaser.GameObjects.Container;
    private diceHit!: Phaser.GameObjects.Rectangle;
    private diceImg!: Phaser.GameObjects.Image;

    // groups
    private groupViews = new Map<string, GroupView>();

    // drawing
    private tempLine!: Phaser.GameObjects.Graphics;
    private fixedLines!: Phaser.GameObjects.Graphics;
    private draggingGroupId: string | null = null;
    private dragStartByGroupId = new Map<string, Phaser.Math.Vector2>();
    private finishing = false;

    // Line tuning (edge-to-edge)
    // Pencil-like line: thicker, dark graphite tone with slight transparency.
    private readonly lineStyle = { width: 6, color: 0x374151, alpha: 0.9 };
    // Note: pip layout was used previously for snapping to dice dots.

    // pack (nhận từ GameScene)
    private groupsData: GroupViewDef[] = [];

    init(data: { pack?: { groups: GroupViewDef[] } }) {
        // Nếu GameScene truyền pack thì dùng, không có thì fallback demo
        this.groupsData =
        data?.pack?.groups ??
        [
            { id: 'scooters', label: 'xe máy', count: 6, spriteKey: 'veh_scooter', x: 260, y: 170, cols: 3 },
            { id: 'bikes', label: 'xe đạp', count: 6, spriteKey: 'veh_bike', x: 1020, y: 170, cols: 3 },
            { id: 'boats', label: 'thuyền', count: 6, spriteKey: 'veh_boat', x: 260, y: 560, cols: 3 },
            { id: 'helis', label: 'máy bay', count: 4, spriteKey: 'veh_heli', x: 1020, y: 560, cols: 2 },
        ];
    }

    constructor() {
        super('ConnectSixScene');
    }

    create() {
        try {
        (window as any).setGameButtonsVisible?.(true);
        } catch {}

        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
        // If the stage 3 guide voice is still playing, stop it as soon as the child interacts.
        this.input.once('pointerdown', () => {
        try {
            AudioManager.stop('voice_stage3_guide');
        } catch {}
        });

        this.createBoard();
        createTopBanner(
        this,
        { bannerKey: CONNECT_SIX_ASSET_KEYS.topBanner, textKey: CONNECT_SIX_ASSET_KEYS.topBannerTextConnect },
        { yRatio: 0.09, scale: 0.52 }
        );

        this.flow = new ConnectSixFlow(
        this.groupsData.map(({ id, label, count }) => ({ id, label, count })),
        6
        );

        // UI text (audio-only; no TTS fallback)
        this.promptText = this.add.text(640, 18, '', {
        fontFamily: 'Arial',
        fontSize: '30px',
        color: '#1f2937',
        }).setOrigin(0.5, 0).setVisible(false);

        this.feedbackText = this.add.text(640, 60, '', {
        fontFamily: 'Arial',
        fontSize: '26px',
        color: '#111827',
        }).setOrigin(0.5, 0).setVisible(false);

        this.setPrompt('Con nối các nhóm có 6 phương tiện vào con xúc xắc ở giữa nhé');
        this.setFeedback('Kéo từ nhóm và thả vào xúc xắc');

        // Lines
        this.fixedLines = this.add.graphics().setDepth(10);
        this.tempLine = this.add.graphics().setDepth(11);

        this.ensureDiceTexture();

        // Dice in center
        this.createDiceTarget(640, 360);

        // Groups around
        this.groupsData.forEach(g => this.createGroupView(g));

        // pointer events for dragging line
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!this.draggingGroupId) return;
        const gv = this.groupViews.get(this.draggingGroupId);
        if (!gv) return;

        this.tempLine.clear();
        this.tempLine.lineStyle(this.lineStyle.width, this.lineStyle.color, this.lineStyle.alpha);
        this.tempLine.beginPath();
        const from = this.dragStartByGroupId.get(gv.id) ?? this.getIconEdgeTowardPoint(gv, p.x, p.y);
        this.tempLine.moveTo(from.x, from.y);
        this.tempLine.lineTo(p.x, p.y);
        this.tempLine.strokePath();
        });

        this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (!this.draggingGroupId) return;
        const groupId = this.draggingGroupId;
        this.draggingGroupId = null;

        this.tempLine.clear();

        const gv = this.groupViews.get(groupId);
        if (!gv) return;

        const overDice = this.diceHit.getBounds().contains(p.x, p.y);
        if (!overDice) {
            this.setFeedback('Con thả vào con xúc xắc ở giữa nhé');
            this.dragStartByGroupId.delete(groupId);
            return;
        }

        const res = this.flow.submitConnect(groupId);
        if (!res) return;

        if (res.ok) {
            // vẽ line cố định từ mép ảnh -> mép chấm trên xúc xắc
            const dragFrom = this.dragStartByGroupId.get(groupId);
            const dropTo = this.getDiceDropPoint(p.x, p.y);
            const { from, to } = this.getConnectLineEndpoints(gv, dragFrom, dropTo);
            this.fixedLines.lineStyle(this.lineStyle.width, this.lineStyle.color, this.lineStyle.alpha);
            this.fixedLines.beginPath();
            this.fixedLines.moveTo(from.x, from.y);
            this.fixedLines.lineTo(to.x, to.y);
            this.fixedLines.strokePath();
            this.playConnectResultAnim(true, to);

            gv.hit.disableInteractive();

            this.setFeedback('Đúng rồi!', { voice: false });
            try {
            AudioManager.playWhenReady?.('sfx_correct');
            } catch {}

            this.tweens.add({ targets: gv.root, scale: 1.06, duration: 120, yoyo: true, repeat: 1 });

            if (res.done) {
            this.setPrompt('Hoàn thành!', { voice: false });
            this.setFeedback('Con giỏi quá!', { voice: false });
            void this.finishMinigameAfterCorrectVoice();
            } else {
            this.playCorrectVoice();
            this.setPrompt(`Con nối tiếp nhé (${this.flow.connectedTargets}/${this.flow.totalTargets})`);
            }
        } else {
            this.setFeedback('Chưa đúng. Con chỉ nối nhóm có 6 thôi nhé!');
            try {
            AudioManager.playWhenReady?.('sfx_wrong');
            } catch {}
            this.shake(gv.root);
        }
        this.dragStartByGroupId.delete(groupId);
        });

        this.scale.off('resize', this.layoutScene, this);
        this.scale.on('resize', this.layoutScene, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off('resize', this.layoutScene, this);
        });

        this.layoutScene();
    }

    // ===== helpers =====
    private setPrompt(text: string, opts?: { voice?: boolean }) {
        this.promptText.setText(text);
        void opts;
    }

    private setFeedback(text: string, opts?: { voice?: boolean }) {
        this.feedbackText.setText(text);
        void opts;
    }

    private playCorrectVoice() {
        try {
        AudioManager.playCorrectAnswer();
        } catch {}
    }

    private async finishMinigameAfterCorrectVoice() {
        if (this.finishing) return;
        this.finishing = true;

        // Prevent further drags / taps while we play the final feedback.
        this.input.enabled = false;
        this.draggingGroupId = null;
        this.tempLine.clear();
        this.dragStartByGroupId.clear();
        for (const gv of this.groupViews.values()) gv.hit.disableInteractive();

        try {
        AudioManager.stopAllVoices?.();
        } catch {}

        // Only finish the stage after the "correct" voice is done playing.
        try {
        await AudioManager.playCorrectAnswerAndWait();
        } catch {}

        // Optional completion voice.
        try {
        if (AudioManager.has('voice_complete')) {
            await AudioManager.playVoiceInterruptAndWait?.('voice_complete', { timeoutMs: 8000 });
        }
        } catch {}

        this.events.emit('minigame:done', {
        ok: true,
        connected: this.flow.connectedTargets,
        totalTargets: this.flow.totalTargets,
        });
    }

    private shake(target: Phaser.GameObjects.Container) {
        const x0 = target.x;
        this.tweens.add({
        targets: target,
        x: x0 + 10,
        duration: 60,
        yoyo: true,
        repeat: 3,
        onComplete: () => target.setX(x0),
        });
    }

    private playConnectResultAnim(ok: boolean, at: Phaser.Math.Vector2) {
        if (!ok) return;
        // Neutral "success" pulse (no color tint, no green tick).
        // Burst ring at the connection point.
        const g = this.add.graphics().setDepth(50);
        g.lineStyle(6, 0xffffff, 0.95);
        g.strokeCircle(0, 0, 18);
        g.lineStyle(4, 0x374151, 0.6);
        g.strokeCircle(0, 0, 18);

        g.setPosition(at.x, at.y);
        g.setScale(0.35);
        g.setAlpha(0.95);

        this.tweens.add({
        targets: g,
        scale: 1.25,
        alpha: 0,
        duration: 420,
        ease: 'Sine.easeOut',
        onComplete: () => g.destroy(),
        });
    }

    private createBoard() {
        const boardKey = CONNECT_SIX_ASSET_KEYS.board;
        if (this.textures.exists(boardKey)) {
        this.board = this.add.image(0, 0, boardKey).setOrigin(0.5).setDepth(1);
        return;
        }
        this.boardFallbackGfx = this.add.graphics().setDepth(1);
    }

    private createDiceTarget(cx: number, cy: number) {
        this.diceRoot = this.add.container(cx, cy).setDepth(5);

        const size = 150;
        this.diceImg = this.add.image(0, 0, CONNECT_SIX_ASSET_KEYS.dice);
        this.diceImg.setOrigin(0.5, 0.5);
        this.fitImageTo(this.diceImg, size, size);
        this.diceRoot.add(this.diceImg);

        // hit area
        this.diceHit = this.add.rectangle(cx, cy, size + 40, size + 40, 0x000000, 0.001)
        .setDepth(6)
        .setInteractive({ useHandCursor: true });

        // (optional) bấm vào xúc xắc nhắc lại luật
        this.diceHit.on('pointerdown', () => {
        try {
            AudioManager.stop('voice_stage3_guide');
        } catch {}
        this.setFeedback('Con thả nhóm có 6 vào đây nhé');
        });
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

        const scale = Math.min((w * 0.96) / tw, (h * 0.78) / th);
        const boardOffsetY = h * 0.07;

        this.board.setAngle(0);
        this.board.setPosition(w / 2, h / 2 + boardOffsetY);
        this.board.setScale(scale);

        const bw = tw * scale;
        const bh = th * scale;

        const padX = bw * 0.065;
        const padTop = bh * 0.14;
        const padBottom = bh * 0.1;
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

        const r = this.boardContentRect;
        if (r.width <= 0 || r.height <= 0) return;

        // Dice in center of board
        this.diceRoot.setPosition(r.centerX, r.centerY);
        this.diceHit.setPosition(r.centerX, r.centerY);

        // Groups around inside board
        // Put 4 group images evenly into the 4 corners of the board content area.
        const cornerPadX = r.width * 0.16;
        const cornerPadY = r.height * 0.18;
        const leftX = r.left + cornerPadX;
        const rightX = r.right - cornerPadX;
        const topY = r.top + cornerPadY;
        const bottomY = r.bottom - cornerPadY;

        const posById: Record<string, { x: number; y: number }> = {
        scooters: { x: leftX, y: topY },
        boats: { x: rightX, y: topY },
        bikes: { x: leftX, y: bottomY },
        helis: { x: rightX, y: bottomY },
        };

        this.groupViews.forEach((gv, id) => {
        const pos = posById[id] ?? null;
        if (!pos) return;
        gv.root.setPosition(pos.x, pos.y);
        });
    }

    private createGroupView(g: GroupViewDef) {
        const hitW = 260;
        const hitH = 220;
        const iconMaxW = 320;
        const iconMaxH = 250;

        const root = this.add.container(g.x, g.y).setDepth(2);

        const icon = this.textures.exists(g.spriteKey)
        ? this.add.image(0, -10, g.spriteKey)
        : this.add.circle(0, -10, 56, 0xfca5a5, 1).setStrokeStyle(3, 0xef4444);
        if (icon instanceof Phaser.GameObjects.Image) {
        icon.setOrigin(0.5, 0.5);
        this.fitImageTo(icon, iconMaxW, iconMaxH);
        }

        const hit = this.add.rectangle(0, 0, hitW, hitH, 0x000000, 0.001)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

        root.add([icon, hit]);

        hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.flow.isConnected(g.id)) return;
        try {
            AudioManager.stop('voice_stage3_guide');
        } catch {}

        this.draggingGroupId = g.id;
        // Start from the child's touch point, but clamp it inside the icon bounds.
        const b = icon.getBounds();
        const inset = 2;
        const sx = Phaser.Math.Clamp(pointer.x, b.left + inset, b.right - inset);
        const sy = Phaser.Math.Clamp(pointer.y, b.top + inset, b.bottom - inset);
        this.dragStartByGroupId.set(g.id, new Phaser.Math.Vector2(sx, sy));
        this.setFeedback(`Con kéo từ nhóm ${g.label} vào xúc xắc nhé`);
        this.tweens.add({ targets: root, scale: 1.03, duration: 120, yoyo: true });
        });

        this.groupViews.set(g.id, { id: g.id, label: g.label, count: g.count, root, icon, hit });
    }

    private getConnectLineEndpoints(gv: GroupView, startOverride?: Phaser.Math.Vector2, endOverride?: Phaser.Math.Vector2) {
        const iconBounds = gv.icon.getBounds();
        const iconCenter = new Phaser.Math.Vector2(iconBounds.centerX, iconBounds.centerY);

        const fromRef = startOverride ?? iconCenter;
        // End at the child's drop point (clamped inside the dice).
        const to = (endOverride ?? this.getDiceDropPoint(fromRef.x, fromRef.y)).clone();

        const from = startOverride ?? (this.getRectEdgePoint(iconBounds, to, iconCenter) ?? iconCenter.clone());
        return { from, to };
    }

    private getDiceDropPoint(x: number, y: number) {
        const rect = this.diceImg.getBounds();
        const inset = 6;
        return new Phaser.Math.Vector2(
        Phaser.Math.Clamp(x, rect.left + inset, rect.right - inset),
        Phaser.Math.Clamp(y, rect.top + inset, rect.bottom - inset)
        );
    }

    private getIconEdgeTowardPoint(gv: GroupView, targetX: number, targetY: number) {
        const iconBounds = gv.icon.getBounds();
        const iconCenter = new Phaser.Math.Vector2(iconBounds.centerX, iconBounds.centerY);
        const target = new Phaser.Math.Vector2(targetX, targetY);
        return this.getRectEdgePoint(iconBounds, target, iconCenter) ?? iconCenter;
    }

    private getRectEdgePoint(rect: Phaser.Geom.Rectangle, from: Phaser.Math.Vector2, to: Phaser.Math.Vector2) {
        const line = new Phaser.Geom.Line(from.x, from.y, to.x, to.y);
        const pts = Phaser.Geom.Intersects.GetLineToRectangle(line, rect);
        if (!pts || pts.length === 0) return null;

        let best = pts[0];
        let bestD = Phaser.Math.Distance.Between(from.x, from.y, best.x, best.y);
        for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const d = Phaser.Math.Distance.Between(from.x, from.y, p.x, p.y);
        if (d < bestD) {
            bestD = d;
            best = p;
        }
        }
        return new Phaser.Math.Vector2(best.x, best.y);
    }

    private ensureDiceTexture() {
        const key = CONNECT_SIX_ASSET_KEYS.dice;
        if (this.textures.exists(key)) return;

        const size = 180;
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xffffff, 1);
        g.lineStyle(6, 0x9ca3af, 1);
        g.fillRoundedRect(0, 0, size, size, 18);
        g.strokeRoundedRect(0, 0, size, size, 18);

        const dotR = 10;
        const dotFill = 0x6b7280;
        const coords: Array<[number, number]> = [
        [size * 0.28, size * 0.28],
        [size * 0.72, size * 0.28],
        [size * 0.28, size * 0.50],
        [size * 0.72, size * 0.50],
        [size * 0.28, size * 0.72],
        [size * 0.72, size * 0.72],
        ];
        coords.forEach(([x, y]) => {
        g.fillStyle(dotFill, 1);
        g.fillCircle(x, y, dotR);
        });

        g.generateTexture(key, size, size);
        g.destroy();
    }

    private fitImageTo(img: Phaser.GameObjects.Image, maxW: number, maxH: number) {
        const tex = this.textures.get(img.texture.key);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        const tw = (src?.width || 1) as number;
        const th = (src?.height || 1) as number;
        img.setScale(Math.min(maxW / tw, maxH / th));
    }
    }
