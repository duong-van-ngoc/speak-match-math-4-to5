import Phaser from 'phaser';
import { ConnectSixFlow, type ConnectGroupDef } from '../../logic/connectSixFlow';
import { SceneKeys, TextureKeys, AudioKeys } from '../../consts/Keys';
import { GameConstants } from '../../consts/GameConstants';
import AudioManager from '../../audio/AudioManager';
import { gameSDK, sdk } from '../../main';
import { changeBackground } from '../../utils/BackgroundManager';

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

    private readonly lineStyle = { width: 6, color: 0x374151, alpha: 0.9 };

    // pack
    private groupsData: GroupViewDef[] = [];

    init() {
        this.finishing = false;
        this.draggingGroupId = null;
        this.dragStartByGroupId.clear();

        this.groupsData = GameConstants.CONNECT_SCENE.GROUPS as any as GroupViewDef[];
    }

    constructor() {
        super(SceneKeys.ConnectSixScene);
    }

    create() {
        this.input.enabled = true;



        this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

        // Stop guide voice on interaction
        this.input.once('pointerdown', () => {
            try {
                AudioManager.stop(AudioKeys.Connect_Guide3);
            } catch { }
        });

        this.createBoard();

        // Top Banner
        const CFG_BANNER = GameConstants.CONNECT_SCENE.BANNER;
        const bannerKey = TextureKeys.Connect_TopBanner;
        const bannerX = this.scale.width * CFG_BANNER.X;
        const bannerY = this.scale.height * CFG_BANNER.Y;

        const banner = this.add.image(bannerX, bannerY, bannerKey)
            .setOrigin(0.5)
            .setScale(CFG_BANNER.SCALE)
            .setDepth(10);


        this.flow = new ConnectSixFlow(
            this.groupsData.map(({ id, label, count }) => ({ id, label, count })),
            7
        );

        // SDK initialization if started directly
        if (GameConstants.IS_TEST_CONNECT_ONLY) {
            const TOTAL_STEPS = GameConstants.NATURE_PHENOMENA.TOTAL_LEVELS + this.flow.totalTargets;
            gameSDK.setTotal(TOTAL_STEPS);

            // Ensure background is set if testing directly
            changeBackground('assets/images/bg/background_game.jpg');
        }
        gameSDK.startQuestionTimer();

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
                this.dragStartByGroupId.delete(groupId);
                return;
            }

            const res = this.flow.submitConnect(groupId);
            if (!res) return;

            if (res.ok) {
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

                try {
                    AudioManager.stop(AudioKeys.Connect_Correct);
                    AudioManager.stop(AudioKeys.Connect_Wrong);
                    AudioManager.play(AudioKeys.Connect_Correct);
                } catch { }

                this.tweens.add({ targets: gv.root, scale: 1.06, duration: 120, yoyo: true, repeat: 1 });

                // SDK record
                gameSDK.finishQuestionTimer();
                gameSDK.recordCorrect({ scoreDelta: 1 });
                sdk.score(gameSDK.prepareSubmitData().finalScore);

                const TOTAL_STEPS = GameConstants.NATURE_PHENOMENA.TOTAL_LEVELS + this.flow.totalTargets;
                sdk.progress((GameConstants.NATURE_PHENOMENA.TOTAL_LEVELS + this.flow.connectedTargets) / TOTAL_STEPS);

                if (res.done) {
                    void this.finishMinigameAfterCorrectVoice();
                } else {
                    gameSDK.startQuestionTimer();
                }
            } else {
                try {
                    AudioManager.stop(AudioKeys.Connect_Correct);
                    AudioManager.stop(AudioKeys.Connect_Wrong);
                    AudioManager.play(AudioKeys.Connect_Wrong);
                } catch { }
                this.shake(gv.root);
            }
            this.dragStartByGroupId.delete(groupId);
        });

        this.scale.on('resize', this.layoutScene, this);
        this.layoutScene();

        // Play BGM if not playing
        const bgm = this.sound.get(AudioKeys.BgmNen);
        if (!bgm) {
            this.sound.play(AudioKeys.BgmNen, { loop: true, volume: 0.25 });
        } else if (!bgm.isPlaying) {
            bgm.play({ loop: true, volume: 0.25 });
        }

        // Play intro guide safely
        this.playGuideVoiceSafe();
    }

    private playGuideVoiceSafe() {
        const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;
        if (soundManager.context.state === 'running') {
            AudioManager.play(AudioKeys.Connect_Guide3);
        } else {
            // Wait for first interaction to play if suspended
            const unlockHandler = () => {
                if (soundManager.context.state === 'suspended') {
                    soundManager.context.resume().then(() => {
                        AudioManager.play(AudioKeys.Connect_Guide3);
                    });
                } else {
                    AudioManager.play(AudioKeys.Connect_Guide3);
                }
                this.input.off('pointerdown', unlockHandler);
            };
            this.input.once('pointerdown', unlockHandler);
        }
    }

    private async finishMinigameAfterCorrectVoice() {
        if (this.finishing) return;
        this.finishing = true;

        this.input.enabled = false;
        this.draggingGroupId = null;
        this.tempLine.clear();
        this.dragStartByGroupId.clear();
        for (const gv of this.groupViews.values()) gv.hit.disableInteractive();

        try {
            // Đợi voice "Đúng rồi" phát xong mới chuyển màn
            const audioKey = AudioKeys.Connect_Correct;
            const duration = AudioManager.getDuration(audioKey) || 1.5;

            await new Promise<void>(resolve => {
                let handled = false;
                const done = () => {
                    if (handled) return;
                    handled = true;
                    resolve();
                };
                AudioManager.onceEnd(audioKey, done);
                // Fallback nếu có lỗi load audio
                this.time.delayedCall(duration * 1000 + 500, done);
            });
        } catch { }

        this.scene.start(SceneKeys.EndGame);
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
        const boardKey = TextureKeys.Connect_Board;
        if (this.textures.exists(boardKey)) {
            this.board = this.add.image(0, 0, boardKey).setOrigin(0.5).setDepth(1);
            return;
        }
        this.boardFallbackGfx = this.add.graphics().setDepth(1);
    }

    private createDiceTarget(cx: number, cy: number) {
        this.diceRoot = this.add.container(cx, cy).setDepth(5);

        const size = GameConstants.CONNECT_SCENE.DICE.SIZE;
        this.diceImg = this.add.image(0, 0, TextureKeys.Connect_Dice);
        this.diceImg.setOrigin(0.5, 0.5);
        this.fitImageTo(this.diceImg, size, size);
        this.diceRoot.add(this.diceImg);

        this.diceHit = this.add.rectangle(cx, cy, size + 40, size + 40, 0x000000, 0.001)
            .setDepth(6)
            .setInteractive({ useHandCursor: true });
    }

    private layoutScene() {
        const w = this.scale.width;
        const h = this.scale.height;

        if (this.board) {
            const boardKey = this.board.texture.key;
            const tex = this.textures.get(boardKey);
            const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
            const tw = (src?.width || 1) as number;
            const th = (src?.height || 1) as number;

            const CFG_BOARD = GameConstants.CONNECT_SCENE.BOARD;

            const scale = Math.min((w * CFG_BOARD.W_RATIO) / tw, (h * CFG_BOARD.H_RATIO) / th);
            const boardOffsetY = h * CFG_BOARD.OFFSET_Y_RATIO;

            this.board.setPosition(w / 2, h / 2 + boardOffsetY);
            this.board.setScale(scale);

            const bw = tw * scale;
            const bh = th * scale;

            const padX = bw * CFG_BOARD.PAD_X_RATIO;
            const padTop = bh * CFG_BOARD.PAD_TOP_RATIO;
            const padBottom = bh * CFG_BOARD.PAD_BOTTOM_RATIO;
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

        this.diceRoot.setPosition(r.centerX, r.centerY);
        this.diceHit.setPosition(r.centerX, r.centerY);

        const cornerPadX = r.width * 0.16;
        const cornerPadY = r.height * 0.18;
        const leftX = r.left + cornerPadX;
        const rightX = r.right - cornerPadX;
        const topY = r.top + cornerPadY;
        const bottomY = r.bottom - cornerPadY;

        const posById: Record<string, { x: number; y: number }> = {
            star: { x: leftX, y: topY },
            moon: { x: rightX, y: topY },
            rainbow: { x: leftX, y: bottomY },
            cloud: { x: rightX, y: bottomY },
        };

        this.groupViews.forEach((gv, id) => {
            const pos = posById[id] ?? null;
            if (!pos) return;
            gv.root.setPosition(pos.x, pos.y);
        });
    }

    private createGroupView(g: GroupViewDef) {
        const CFG_ITEM = GameConstants.CONNECT_SCENE.ITEM;
        const hitW = CFG_ITEM.HIT_W;
        const hitH = CFG_ITEM.HIT_H;
        const iconMaxW = CFG_ITEM.ICON_MAX_W;
        const iconMaxH = CFG_ITEM.ICON_MAX_H;

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

            this.draggingGroupId = g.id;
            const b = icon.getBounds();
            const inset = 2;
            const sx = Phaser.Math.Clamp(pointer.x, b.left + inset, b.right - inset);
            const sy = Phaser.Math.Clamp(pointer.y, b.top + inset, b.bottom - inset);
            this.dragStartByGroupId.set(g.id, new Phaser.Math.Vector2(sx, sy));
            this.tweens.add({ targets: root, scale: 1.03, duration: 120, yoyo: true });
        });

        this.groupViews.set(g.id, { id: g.id, label: g.label, count: g.count, root, icon, hit });
    }

    private getConnectLineEndpoints(gv: GroupView, startOverride?: Phaser.Math.Vector2, endOverride?: Phaser.Math.Vector2) {
        const iconBounds = gv.icon.getBounds();
        const iconCenter = new Phaser.Math.Vector2(iconBounds.centerX, iconBounds.centerY);

        const fromRef = startOverride ?? iconCenter;
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
        const key = TextureKeys.Connect_Dice;
        if (this.textures.exists(key)) return;

        const size = 180;
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xffffff, 1);
        g.lineStyle(6, 0x9ca3af, 1);
        g.fillRoundedRect(0, 0, size, size, 18);
        g.strokeRoundedRect(0, 0, size, size, 18);

        // Dot for 7? No, just use 7 dots in a pattern.
        const dotR = 10;
        const dotFill = 0x6b7280;
        // Pattern for 7: 6 around, 1 in center
        const coords: Array<[number, number]> = [
            [size * 0.28, size * 0.28],
            [size * 0.72, size * 0.28],
            [size * 0.28, size * 0.72],
            [size * 0.72, size * 0.72],
            [size * 0.28, size * 0.50],
            [size * 0.72, size * 0.50],
            [size * 0.50, size * 0.50],
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
