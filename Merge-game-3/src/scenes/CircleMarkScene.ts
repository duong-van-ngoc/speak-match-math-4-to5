// CountConnectScene.ts
    import Phaser from 'phaser';
    import type { GameData } from '../data/gameData';
    import type { NumBox } from '../ui/helpers';
 import { FLOW_GO_END, type FlowEndPayload } from '../flow/events';
    import { BOARD_ASSET_KEYS, OBJECT_ASSET_KEYS, loadAssetGroups } from '../assets';
    import AudioManager from '../AudioManager';

    type SpriteOrArc =
    | Phaser.GameObjects.Arc
    | Phaser.GameObjects.Image
    | Phaser.GameObjects.Container;

    // type DragState removed (unused)

    type CountLevel = {
        label: string;
        counts: [number, number];
        objectTextureKeys?: (string | undefined)[];
        objectFill: number;
        objectStroke: number;
        bannerTextKey: string;
        voiceGuideKey: string;
    };
export default class CircleMarkScene extends Phaser.Scene {
    // Phát voice hướng dẫn cho từng màn (level) CountConnect qua AudioManager
    private playGuideVoiceForCurrentLevel() {
        // Ngắt tất cả âm thanh hướng dẫn trước khi phát mới
        this.countLevels.forEach((level) => {
            if (level.voiceGuideKey) AudioManager.stop(level.voiceGuideKey);
        });
        const level = this.getCurrentCountLevel();
        if (level.voiceGuideKey) AudioManager.playWhenReady(level.voiceGuideKey);
    }

    private dataGame!: GameData;
    private boxes: NumBox[] = [];
    private numberRowY?: number;

    private phase: 'circle' | 'connect' = 'circle';

    private bags: SpriteOrArc[] = []; // giờ là 2 cụm (Container) trái/phải
    private locked = new Set<SpriteOrArc>();

    private boardFallbackGfx?: Phaser.GameObjects.Graphics;
    private boardImage?: Phaser.GameObjects.Image;
    private boardRect = new Phaser.Geom.Rectangle();
    private boardInnerRect = new Phaser.Geom.Rectangle();

    private objectPositions?: { leftX: number; rightX: number; y: number };

    private readonly connectionLineStyle = { width: 6, alpha: 0.95 };
    private readonly connectLineColor = 0x000000;
    private lines!: Phaser.GameObjects.Graphics;
    private fixedLines?: Phaser.GameObjects.Graphics;

    private fixedConnections: Array<{ bag: SpriteOrArc; box: NumBox; color: number }> = [];
    private dragging?: { bag: SpriteOrArc };

    // Đã bỏ counting

    private countLevels: CountLevel[] = [];
    private currentCountLevelIndex = 0;

    private levelLabel?: Phaser.GameObjects.Text;

    private bannerBg?: Phaser.GameObjects.Image;
    private bannerTextImage?: Phaser.GameObjects.Image;

    private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;
    private readonly bannerBgKey = BOARD_ASSET_KEYS.bannerBg;

    private guideHand?: Phaser.GameObjects.Image;
    private guideHandTween?: Phaser.Tweens.Tween;
    private guideHandTimeout?: Phaser.Time.TimerEvent;
    private guideHandShown = false;

    // ✅ state khoanh
    private circling?: {
        bag: Phaser.GameObjects.Container;
        points: Phaser.Math.Vector2[];
    };

    constructor() {
        super('CircleMarkScene');
    }

    init(_data: { gameData: GameData }) {
        this.dataGame = _data.gameData;

        // Mỗi màn chỉ có 1 asset (chim hoặc vịt), ở giữa board
        this.countLevels = [
            {
                label: 'Thuyền',
                counts: [2, 3],
                objectTextureKeys: [OBJECT_ASSET_KEYS.boatCircle],
                objectFill: 0xdff6ff,
                objectStroke: 0x7cc8ff,
                bannerTextKey: 'banner_title_4',
                voiceGuideKey: 'voice_guide_24',
            },
        ];
    }

    preload() {
        loadAssetGroups(this, 'shared', 'colorScene', 'numbers', 'ui');
    }

    create() {
        // Reset về level đầu tiên khi chơi lại
        this.currentCountLevelIndex = 0;

        // Reset toàn bộ trạng thái khi vào lại scene (chơi lại)
        this.locked = new Set();
        this.fixedConnections = [];
        if (this.fixedLines) this.fixedLines.clear();
        if (this.lines) this.lines.clear();
        this.circling = undefined;
        this.dragging = undefined;
        this.phase = 'circle';
        this.boxes = [];

        this.boardFallbackGfx = this.add.graphics().setDepth(0);
        this.layoutBoard();
        this.scale.on('resize', this.layoutBoard, this);

        this.levelLabel = this.add
        .text(this.boardRect.centerX, this.boardRect.y + 18, '', {
            fontFamily: 'Baloo, Arial',
            fontSize: '26px',
            color: '#0b1b2a',
        })
        .setOrigin(0.5, 0)
        .setDepth(6);

        this.updateLevelLabel();
        this.levelLabel.setVisible(false);

        this.createNumberAssets();

        this.lines = this.add.graphics().setDepth(4);
        this.fixedLines = this.add.graphics().setDepth(3);

        // ...objectLayout removed: unused...


        // Tạo 1 asset ở giữa, nhưng chia thành 2 vùng khoanh trái/phải
        const level = this.getCurrentCountLevel();
        const key = level.objectTextureKeys?.[0];
        const centerX = this.boardRect.centerX;
        const centerY = this.boardRect.centerY;
        // Kiểm tra asset đã load chưa
        if (key && !this.textures.exists(key)) {
            // eslint-disable-next-line no-console
            console.warn('Asset chưa được load hoặc sai tên:', key);
        }
        // Hai vùng khoanh: trái và phải, cùng nằm trên 1 asset ở giữa
        const leftCluster = this.buildHalfAssetContainer(centerX, centerY, key, level.objectFill, 'left');
        const rightCluster = this.buildHalfAssetContainer(centerX, centerY, key, level.objectFill, 'right');
        this.bags = [leftCluster, rightCluster];

        // layout lại lần nữa để reposition chuẩn (nhất là khi resize / board ratio)
        this.layoutBoard();

        // đảm bảo cụm đúng level (rebuild con + data)
        this.applyCurrentLevelToObjects();

        // Phát voice hướng dẫn cho màn hiện tại
        this.playGuideVoiceForCurrentLevel();

        // Hiển thị bàn tay hướng dẫn khoanh khi vào màn chơi
        this.showGuideHand(true);
        this.input.once('pointerdown', () => {
        this.hideGuideHand();
        // Nếu bé chưa thao tác sau 3s thì hiện lại bàn tay
        this.guideHandTimeout = this.time.delayedCall(3000, () => {
            const idle = this.phase === 'circle' ? !this.circling : !this.dragging;
            if (idle) this.showGuideHand(false);
        });
        });

        this.input.on('pointerdown', this.onDown, this);
        this.input.on('pointermove', this.onMove, this);
        this.input.on('pointerup', this.onUp, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off('resize', this.layoutBoard, this);
        this.hideGuideHand();

        // Reset các asset để khi chơi lại sẽ tạo mới
        this.boardImage = undefined;
        this.bannerBg = undefined;
        this.bannerTextImage = undefined;
        });
    }

    private createNumberAssets() {
        this.boxes = [];
        const midX = this.boardRect.centerX;
        const numberY = this.numberRowY ?? 100;
        const maxNumber = this.dataGame.maxNumber;
        const scale = 0.45;
        const gap = 0;
        let totalW = 0;
        const widths: number[] = [];
        for (let i = 0; i < maxNumber; i++) {
            const n = i + 1;
            const numberKey = `number_${n}`;
            let w = 100;
            if (this.textures.exists(numberKey)) {
                const tex = this.textures.get(numberKey);
                const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
                if (src) w = (src as any).width || 100;
            }
            widths.push(w * scale);
            totalW += w * scale;
        }
        totalW += gap * (maxNumber - 1);
        let cx = midX - totalW / 2;
        for (let i = 0; i < maxNumber; i++) {
            cx += widths[i] / 2;
            const n = i + 1;
            const numberKey = `number_${n}`;
            let image: Phaser.GameObjects.Image | undefined = undefined;
            if (this.textures.exists(numberKey)) {
                image = this.add.image(cx, numberY, numberKey).setOrigin(0.5);
                image.setScale(scale, scale);
            }
            this.boxes.push({
                n,
                cx,
                y: numberY,
                image,
                rect: undefined as any,
                text: undefined as any,
                w: 0,
                h: 0,
                painted: false,
            });
            cx += widths[i] / 2 + gap;
        }
    }

    private repositionNumberBoxes() {
        if (!this.boxes.length) return;
        const midX = this.boardInnerRect.centerX;
        const maxNumber = this.dataGame.maxNumber;
        const scale = 0.45;
        const gap = 0;
        let totalW = 0;
        const widths: number[] = [];
        for (let i = 0; i < maxNumber; i++) {
            const n = i + 1;
            const numberKey = `number_${n}`;
            let w = 100;
            if (this.textures.exists(numberKey)) {
                const tex = this.textures.get(numberKey);
                const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
                if (src) w = (src as any).width || 100;
            }
            widths.push(w * scale);
            totalW += w * scale;
        }
        totalW += gap * (maxNumber - 1);
        let cx = midX - totalW / 2;
        const y = this.numberRowY ?? this.boardInnerRect.y + this.boardInnerRect.height * 0.12;
        this.boxes.forEach((box, i) => {
            cx += widths[i] / 2;
            box.cx = cx;
            box.y = y;
            if (box.image) box.image.setPosition(cx, y);
            cx += widths[i] / 2 + gap;
        });
    }

    private findBox(x: number, y: number) {
        return this.boxes.find((b) => b.image && b.image.getBounds().contains(x, y));
    }

    // =========================
    // ✅ CỤM (CLUSTER) LOGIC
    // =========================


    // Tạo container chứa nửa asset (trái/phải)
    private buildHalfAssetContainer(
        x: number,
        y: number,
        textureKey: string | undefined,
        fallbackFill: number,
        side: 'left' | 'right'
    ) {
        // Đảm bảo asset luôn dưới đường khoanh (container depth thấp, ellipse sẽ setDepth cao hơn hẳn)
        const container = this.add.container(x, y);

        if (!textureKey || !this.textures.exists(textureKey)) {
            // fallback (tuỳ bạn có muốn)
            const c = this.add.circle(0, 0, 32, fallbackFill) as Phaser.GameObjects.Arc;
            container.add(c);
            this.setClusterInteractive(container, true);
            return container;
        }

        // Giảm kích thước asset nhỏ lại để vừa board hơn
        const img = this.add.image(0, 0, textureKey).setOrigin(0.5).setScale(0.52);
        const frameW = img.width;
        const frameH = img.height;
        // Để tránh lộ đường cắt ở giữa, cho overlap 2px
        const overlap = 2;
        if (side === 'left') {
            img.setCrop(0, 0, frameW / 2 + overlap, frameH);
        } else {
            img.setCrop(frameW / 2 - overlap, 0, frameW / 2 + overlap, frameH);
        }
        container.add(img);
        this.setClusterInteractive(container, true);
        return container;
    }

    private setClusterInteractive(container: Phaser.GameObjects.Container, enabled: boolean) {
        container.iterate((child: any) => {
        if (!child) return;
        if (enabled) child.setInteractive?.({ useHandCursor: true });
        else child.disableInteractive?.();
        });
    }

    // =========================
    // INPUT: KHOANH
    // =========================

    private onDown(pointer: Phaser.Input.Pointer) {
        if (this.phase === 'circle') {
            // Cho phép khoanh tự do, không cần bắt đầu từ tâm cụm
            this.circling = {
                bag: undefined as any, // sẽ xác định sau khi khoanh xong
                points: [new Phaser.Math.Vector2(pointer.x, pointer.y)],
            };
            this.hideGuideHand();
            return;
        }

        // CONNECT phase: kéo đường nối từ cụm đã khoanh tới số
        // Vì 2 container trái/phải overlap bounds (cùng vị trí), không dùng bounds để pick bag.
        // Chọn theo nửa màn: trái -> nhóm thuyền nhỏ (đỏ), phải -> nhóm thuyền to (xanh).
        const bagObj = pointer.x < this.boardRect.centerX ? this.bags[0] : this.bags[1];
        if (!bagObj) return;
        if (!this.locked.has(bagObj)) return;
        if (this.fixedConnections.find((c) => c.bag === bagObj)) return; // đã nối rồi

        this.dragging = { bag: bagObj };
        this.hideGuideHand();
    }

    private onMove(pointer: Phaser.Input.Pointer) {
        if (this.phase === 'circle') {
            if (!this.circling) return;

            const pts = this.circling.points;
            const last = pts[pts.length - 1];
            const p = new Phaser.Math.Vector2(pointer.x, pointer.y);

            // lọc bớt điểm cho nhẹ
            if (Phaser.Math.Distance.Between(last.x, last.y, p.x, p.y) < 8) return;
            pts.push(p);

            // Màu nét vẽ theo nhóm đang khoanh: nhóm thuyền nhỏ (trái) màu đỏ, nhóm thuyền to (phải) màu xanh
            const unlockedBag = this.bags.find((bag) => !this.locked.has(bag));
            const bagIndex = unlockedBag ? this.bags.indexOf(unlockedBag) : 0;
            const strokeColor = bagIndex === 0 ? 0xff3b30 : 0x2f6cff;

            // vẽ polyline theo ngón tay
            this.lines.clear();
            this.lines.lineStyle(this.connectionLineStyle.width, strokeColor, this.connectionLineStyle.alpha);
            this.lines.beginPath();
            this.lines.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) this.lines.lineTo(pts[i].x, pts[i].y);
            this.lines.strokePath();
            return;
        }

        if (!this.dragging) return;
        this.lines.clear();
        // CONNECT line luôn màu đen
        this.lines.lineStyle(this.connectionLineStyle.width, this.connectLineColor, this.connectionLineStyle.alpha);
        this.lines.beginPath();
        const cp = (this.dragging.bag as any).connectPoint as { x: number; y: number } | undefined;
        const startX = cp?.x ?? (this.dragging.bag as any).x;
        const startY = cp?.y ?? (this.dragging.bag as any).y;
        this.lines.moveTo(startX, startY);
        this.lines.lineTo(pointer.x, pointer.y);
        this.lines.strokePath();
    }

    private onUp(pointer: Phaser.Input.Pointer) {
        if (this.phase === 'circle') {
            if (!this.circling) return;
            const pts = this.circling.points;
            this.lines.clear();
            if (pts.length < 10) {
                this.circling = undefined;
                return;
            }
            // Tìm vùng chưa khoanh
            const unlockedBag = this.bags.find((bag) => !this.locked.has(bag));
            if (!unlockedBag) {
                this.circling = undefined;
                return;
            }

            // GỘP: Tính bounding box và các biến chỉ 1 lần
            const bagIndex = this.bags.indexOf(unlockedBag);
            let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
            for (let i = 1; i < pts.length; i++) {
                if (pts[i].x < minX) minX = pts[i].x;
                if (pts[i].x > maxX) maxX = pts[i].x;
                if (pts[i].y < minY) minY = pts[i].y;
                if (pts[i].y > maxY) maxY = pts[i].y;
            }
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const wRaw = maxX - minX;
            const hRaw = maxY - minY;
            if (wRaw < 120 || hRaw < 120) {
                this.cameras.main.shake(120, 0.01);
                this.playWrongSound();
                this.circling = undefined;
                return;
            }
            const w = Math.max(120, wRaw);
            const h = Math.max(120, hRaw);

            // Không cho phép khoanh ngoài board, cho phép vượt ranh giới 30%
            const board = this.boardRect;
            const allowMargin = 0.3;
            const minXBoard = board.x - board.width * allowMargin;
            const maxXBoard = board.right + board.width * allowMargin;
            const minYBoard = board.y - board.height * allowMargin;
            const maxYBoard = board.bottom + board.height * allowMargin;
            // "Cấm khoanh ở góc": vùng góc bị loại (25% theo cả chiều rộng và chiều cao của board)
            const cornerW = board.width * 0.25;
            const cornerH = board.height * 0.25;
            const cornerRects = [
                new Phaser.Geom.Rectangle(board.x, board.y, cornerW, cornerH), // top-left
                new Phaser.Geom.Rectangle(board.right - cornerW, board.y, cornerW, cornerH), // top-right
                new Phaser.Geom.Rectangle(board.x, board.bottom - cornerH, cornerW, cornerH), // bottom-left
                new Phaser.Geom.Rectangle(board.right - cornerW, board.bottom - cornerH, cornerW, cornerH), // bottom-right
            ];
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                if (p.x < minXBoard || p.x > maxXBoard || p.y < minYBoard || p.y > maxYBoard) {
                    this.cameras.main.shake(120, 0.01);
                    this.playWrongSound();
                    this.circling = undefined;
                    return;
                }
                if (cornerRects.some((r) => r.contains(p.x, p.y))) {
                    this.cameras.main.shake(120, 0.01);
                    this.playWrongSound();
                    this.circling = undefined;
                    return;
                }
            }

            // Ràng buộc theo nửa trái / nửa phải (nhóm thuyền nhỏ ở trái, thuyền to ở phải)
            const assetCenterX = this.boardRect.centerX;
            let inside = 0;
            pts.forEach((p) => {
                const inHalf = bagIndex === 0 ? p.x < assetCenterX : p.x > assetCenterX;
                if (inHalf) inside++;
            });
            if (inside < pts.length * 0.3) {
                this.cameras.main.shake(120, 0.01);
                this.playWrongSound();
                this.circling = undefined;
                return;
            }

            // đúng: khóa vùng
            const bestBag = unlockedBag as Phaser.GameObjects.Container;
            this.locked.add(bestBag);
            this.setClusterInteractive(bestBag, false);

            const color = bagIndex === 0 ? 0xff3b30 : 0x2f6cff;
            const ellipseGfx = this.add.graphics().setDepth(999);
            ellipseGfx.lineStyle(5, color, 1);
            ellipseGfx.strokeEllipse(cx, cy, w, h);
            (bestBag as any).ellipseGfx = ellipseGfx;
            // Lưu điểm nối theo tâm vùng khoanh để khi nối đường sẽ đúng vị trí nhóm (như hình mẫu)
            (bestBag as any).connectPoint = { x: cx, y: cy };

            AudioManager.play('sfx_correct');
            this.playCorrectAnswerSound();
            this.circling = undefined;

            // Khoanh đủ 2 nhóm -> chuyển sang CONNECT phase (phải nối số tương ứng mới endgame)
            if (this.locked.size === this.bags.length) {
                this.phase = 'connect';
                this.guideHandShown = false;
                this.showGuideHand(true);
            }
            return;
        }

        if (!this.dragging) return;
        const bag = this.dragging.bag;
        this.lines.clear();
        const hit = this.findBox(pointer.x, pointer.y);
        if (!hit) {
            this.cameras.main.shake(120, 0.01);
            this.playWrongSound();
            this.dragging = undefined;
            this.redrawFixedLines();
            return;
        }

        const level = this.getCurrentCountLevel();
        const bagIndex = this.bags.indexOf(bag);
        // Theo asset: nhóm trái là thuyền nhỏ (3), nhóm phải là thuyền to (2)
        const expectedNumber = bagIndex === 0 ? level.counts[1] : level.counts[0];
        if (hit.n !== expectedNumber) {
            this.cameras.main.shake(120, 0.01);
            this.playWrongSound();
            this.dragging = undefined;
            this.redrawFixedLines();
            return;
        }

        this.fixedConnections.push({ bag, box: hit, color: this.connectLineColor });
        this.redrawFixedLines();
        AudioManager.play('sfx_correct');
        this.playCorrectAnswerSound();
        this.dragging = undefined;

        if (this.fixedConnections.length >= this.bags.length) {
            const payload: FlowEndPayload = { marblesTotal: 0, ballsTotal: 0 };
            this.time.delayedCall(450, () => this.game.events.emit(FLOW_GO_END, payload));
        }
    }

    // =========================
    // SOUND / CHECK
    // =========================

    private playCorrectAnswerSound() {
        AudioManager.stopGuideVoices();
        const idx = Math.floor(Math.random() * 4) + 1; // 1-4
        const key = `correct_answer_${idx}`;
        AudioManager.playWhenReady?.(key);
    }

    // ...findBox removed: unused...

    private getCurrentCountLevel() {
        return this.countLevels[this.currentCountLevelIndex];
    }

    private updateLevelLabel() {
        if (!this.levelLabel || this.levelLabel.scene == null) return;
        const level = this.getCurrentCountLevel();
        this.levelLabel.setText(`Màn ${this.currentCountLevelIndex + 1} • ${level.label}`);
        this.levelLabel.setPosition(this.boardRect.centerX, this.boardRect.y + 18);
    }

    // ✅ rebuild cụm theo level hiện tại
    private applyCurrentLevelToObjects() {
        const level = this.getCurrentCountLevel();
        this.bags.forEach((bagObj, index) => {
            const bag = bagObj as Phaser.GameObjects.Container;
            bag.removeAll(true);
            const tex = level.objectTextureKeys?.[0];
            if (tex && this.textures.exists(tex)) {
                // Giảm scale để asset nhỏ hơn, đồng bộ với buildHalfAssetContainer
                const img = this.add.image(0, 0, tex).setOrigin(0.5).setScale(0.52);
                const frameW = img.width;
                const frameH = img.height;
                // Để tránh lộ đường cắt ở giữa, cho overlap 2px
                const overlap = 2;
                if (index === 0) img.setCrop(0, 0, frameW / 2 + overlap, frameH);
                else img.setCrop(frameW / 2 - overlap, 0, frameW / 2 + overlap, frameH);
                bag.add(img);
            }
            // Không vẽ hình tròn fallback nữa
            if (!this.locked.has(bag)) this.setClusterInteractive(bag, true);
            else this.setClusterInteractive(bag, false);
        });
        this.updateLevelLabel();
    }



    // =========================
    // LAYOUT
    // =========================

    private layoutBoard() {
        if (!this.boardFallbackGfx) return;

        const w = this.scale.width;
        const h = this.scale.height;
        const maxW = Math.min(1100, w * 0.92);
        const maxH = Math.min(540, h * 0.8);

        const ratio = this.getBoardAssetRatio();
        let boardW = maxW;
        let boardH = maxH;

        if (ratio) {
        boardH = boardW / ratio;
        if (boardH > maxH) {
            boardH = maxH;
            boardW = boardH * ratio;
        }
        }

        const boardX = (w - boardW) / 2;
        const boardY = Math.max(80, h * 0.16);

        this.boardRect.setTo(boardX, boardY, boardW, boardH);

        const padX = boardW * 0.05;
        const padTop = boardH * 0.15;
        const padBottom = boardH * 0.18;

        const innerX = boardX + padX;
        const innerY = boardY + padTop;
        const innerW = boardW - padX * 2;
        const innerH = boardH - padTop - padBottom;

        this.boardInnerRect.setTo(innerX, innerY, innerW, innerH);
        // Thang số
        this.numberRowY = innerY + innerH * 0.05;

        const objSpacing = Math.min(innerW * 0.5, 300);
        const objY = innerY + innerH * 0.72;

        this.objectPositions = {
        leftX: this.boardInnerRect.centerX - objSpacing / 2,
        rightX: this.boardInnerRect.centerX + objSpacing / 2,
        y: objY,
        };

        this.createBoardImageIfNeeded();
        if (this.boardImage) {
        this.boardImage.setPosition(boardX + boardW / 2, boardY + boardH / 2);
        this.boardImage.setDisplaySize(boardW, boardH);
        this.boardFallbackGfx.clear();
        } else {
        this.drawBoardFrame();
        }

        this.repositionNumberBoxes();
        this.positionObjects();
        this.redrawFixedLines();
        this.ensureBannerAssets();
        this.updateLevelLabel();
    }

    private drawBoardFrame() {
        if (!this.boardFallbackGfx) return;

        const corner = Math.min(28, this.boardRect.height * 0.08);

        this.boardFallbackGfx.clear();
        this.boardFallbackGfx
        .fillStyle(0xffffff, 1)
        .fillRoundedRect(this.boardRect.x, this.boardRect.y, this.boardRect.width, this.boardRect.height, corner);

        this.boardFallbackGfx
        .lineStyle(6, 0x1d4ed8, 1)
        .strokeRoundedRect(this.boardRect.x, this.boardRect.y, this.boardRect.width, this.boardRect.height, corner);
    }



    private positionObjects() {
        if (!this.bags.length || !this.objectPositions) return;
        // Đặt cả hai vùng khoanh vào giữa board
        const centerX = this.boardRect.centerX;
        const centerY = this.boardRect.centerY + Math.min(92, this.boardRect.height * 0.12);
        this.bags.forEach((bag) => {
            (bag as Phaser.GameObjects.Container).setPosition(centerX, centerY);
        });
    }

    // (giữ nguyên) fixedLines hiện không dùng trong khoanh, nhưng để không đụng logic khác
    private redrawFixedLines() {
        const gfx = this.fixedLines;
        if (!gfx) return;

        gfx.clear();
        if (!this.fixedConnections.length) return;

        this.fixedConnections.forEach(({ bag, box, color }) => {
        let bounds;
        if (box.rect) bounds = box.rect.getBounds();
        else if (box.image) bounds = box.image.getBounds();
        else return;

        const cp = (bag as any).connectPoint as { x: number; y: number } | undefined;
        const startX = cp?.x ?? (bag as any).x;
        const startY = cp?.y ?? (bag as any).y;
        const endX = bounds.centerX;
        const endY = bounds.centerY;

        gfx.lineStyle(this.connectionLineStyle.width, color, this.connectionLineStyle.alpha);
        gfx.beginPath();
        gfx.moveTo(startX, startY);
        gfx.lineTo(endX, endY);
        gfx.strokePath();
        });
    }

    private createBoardImageIfNeeded() {
        if (this.boardImage) return;
        if (!this.textures.exists(this.boardAssetKey)) return;

        this.boardImage = this.add.image(0, 0, this.boardAssetKey).setDepth(0).setOrigin(0.5);
    }

    private getBoardAssetRatio() {
        if (!this.textures.exists(this.boardAssetKey)) return undefined;
        const tex = this.textures.get(this.boardAssetKey);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
        if (!src) return undefined;
        const width = (src as any).width || 1;
        const height = (src as any).height || 1;
        return width / height;
    }

    private ensureBannerAssets() {
        if (!this.textures.exists(this.bannerBgKey)) return;

        if (!this.bannerBg && this.textures.exists(this.bannerBgKey)) {
            this.bannerBg = this.add.image(0, 0, this.bannerBgKey).setOrigin(0.5, 0.5).setDepth(35);
        }

        // Use per-level bannerTextKey
        const level = this.getCurrentCountLevel();
        const key = level.bannerTextKey;
        if (!this.bannerTextImage && key && this.textures.exists(key)) {
            this.bannerTextImage = this.add.image(0, 0, key).setOrigin(0.5, 0.5).setDepth(36);
        }

        this.positionBannerAssets();
    }

    private positionBannerAssets() {
        if (!this.bannerBg) return;

        const maxWidth = Math.min(this.scale.width * 0.9, 720);
        const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;

        const targetWidth = Math.min(maxWidth, this.boardRect.width * 0.9);
        const targetHeight = bgRatio ? targetWidth / bgRatio : this.bannerBg.displayHeight;

        const x = this.boardRect.centerX;
        const y = Math.max(targetHeight / 2 + 8, this.boardRect.y - targetHeight / 2 - 8);

        this.bannerBg.setDisplaySize(targetWidth, targetHeight);
        this.bannerBg.setPosition(x, y);

        // Use per-level bannerTextKey
        const level = this.getCurrentCountLevel();
        const key = level.bannerTextKey;
        if (this.bannerTextImage && key) {
            const textRatio = this.getTextureRatio(key) ?? 1;
            const textWidth = targetWidth * 0.8;
            const textHeight = textRatio ? textWidth / textRatio : this.bannerTextImage.displayHeight;
            this.bannerTextImage.setDisplaySize(textWidth, textHeight);
            this.bannerTextImage.setPosition(x, y);
        }
    }

    private getTextureRatio(key: string) {
        if (!this.textures.exists(key)) return undefined;
        const tex = this.textures.get(key);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
        if (!src) return undefined;
        const width = (src as any).width || 1;
        const height = (src as any).height || 1;
        return width / height;
    }

    // ...COUNTING SEQUENCE REMOVED...

    // =========================
    // GUIDE HAND (khoanh quanh cụm)
    // =========================

    private showGuideHand(first: boolean) {
        this.hideGuideHand();
        if (first && this.guideHandShown) return;
        if (this.phase === 'circle' && this.locked.size === this.bags.length) return;
        if (!this.bags.length) return;
        if (!this.textures.exists('guide_hand')) return;

        const bagObj =
            this.phase === 'circle'
                ? (!this.locked.has(this.bags[0]) ? this.bags[0] : this.bags.find((b) => !this.locked.has(b)))
                : this.bags.find((b) => this.locked.has(b) && !this.fixedConnections.find((c) => c.bag === b));
        if (!bagObj) return;

        const bag = bagObj as Phaser.GameObjects.Container;
        const cp = (bag as any).connectPoint as { x: number; y: number } | undefined;
        const startX = this.phase === 'connect' ? (cp?.x ?? (bag.x ?? 0)) : (bag.x ?? 0);
        const startY = this.phase === 'connect' ? (cp?.y ?? (bag.y ?? 0)) : (bag.y ?? 0);

        this.guideHand = this.add
            .image(startX, startY, 'guide_hand')
            .setOrigin(0.2, 0.1)
            .setScale(0.5)
            .setDepth(100)
            .setAlpha(0.92);

        if (this.phase === 'circle') {
            // Hướng dẫn khoanh: ưu tiên khoanh nhóm bên trái trước.
            // Vì 2 container trái/phải trùng position (chỉ khác crop), dùng offset để đưa bàn tay tới đúng nửa ảnh.
            const r = 62;
            const isLeft = bagObj === this.bags[0];
            const offsetX = (isLeft ? -1 : 1) * Math.min(140, this.boardRect.width * 0.18);
            const offsetY = -Math.min(30, this.boardRect.height * 0.05);
            this.guideHandTween = this.tweens.addCounter({
                from: 0,
                to: Math.PI * 2,
                duration: 1200,
                repeat: -1,
                onUpdate: (tw) => {
                    const a = tw.getValue() ?? 0;
                    const ax = (bag.x ?? 0) + offsetX;
                    const ay = (bag.y ?? 0) + offsetY;
                    this.guideHand!.setPosition(ax + Math.cos(a) * r, ay + Math.sin(a) * r);
                },
            });
        } else {
            const level = this.getCurrentCountLevel();
            const bagIndex = this.bags.indexOf(bagObj);
            const expectedNumber = bagIndex === 0 ? level.counts[1] : level.counts[0];
            const box = this.boxes.find((b) => b.n === expectedNumber);
            if (!box?.image) return;
            this.guideHandTween = this.tweens.add({
                targets: this.guideHand,
                x: box.image.x,
                y: box.image.y,
                duration: 900,
                ease: 'Cubic.InOut',
                yoyo: true,
                repeat: -1,
            });
        }

        if (first) this.guideHandShown = true;
    }

    private hideGuideHand() {
        if (this.guideHand) {
        this.guideHand.destroy();
        this.guideHand = undefined;
        }
        if (this.guideHandTween) {
        this.guideHandTween.stop();
        this.guideHandTween = undefined;
        }
        if (this.guideHandTimeout) {
        this.guideHandTimeout.remove(false);
        this.guideHandTimeout = undefined;
        }
    }

    // Phát âm thanh sai
    private playWrongSound() {
        AudioManager.stopGuideVoices();
        AudioManager.play('sfx_wrong');
    }
}
