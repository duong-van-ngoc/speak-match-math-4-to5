// CountConnectScene.ts
    import Phaser from 'phaser';
    import type { GameData } from '../data/gameData';
    import type { NumBox } from '../ui/helpers';
    import { FLOW_GO_COUNT } from '../flow/events';
    import { BOARD_ASSET_KEYS, BIRD_ASSET, DUCK_ASSET, loadAssetGroups } from '../assets';
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
    };
    import type { MarkedCluster } from './CountConnectScene';
    export default class CircleMarkScene extends Phaser.Scene {
        // Lưu kết quả khoanh để truyền sang màn nối
        private clusters: MarkedCluster[] = [];
    // Phát voice hướng dẫn cho từng màn (level) CountConnect qua AudioManager
    private playGuideVoiceForCurrentLevel() {
        // Ngắt tất cả âm thanh hướng dẫn trước khi phát mới
        const voiceKeys = ['voice_guide_connect'];
        voiceKeys.forEach((k) => AudioManager.stop(k));
        const key = voiceKeys[this.currentCountLevelIndex] || voiceKeys[0];
        AudioManager.playWhenReady(key);
    }

    // private dataGame!: GameData; // Đã bỏ thang số

    // Đã bỏ thang số
    private bags: SpriteOrArc[] = []; // giờ là 2 cụm (Container) trái/phải
    private locked = new Set<SpriteOrArc>();

    private boardFallbackGfx?: Phaser.GameObjects.Graphics;
    private boardImage?: Phaser.GameObjects.Image;
    private boardRect = new Phaser.Geom.Rectangle();
    private boardInnerRect = new Phaser.Geom.Rectangle();

    private objectPositions?: { leftX: number; rightX: number; y: number };

    private readonly connectionLineStyle = { width: 6, color: 0x374151, alpha: 0.9 };
    private lines!: Phaser.GameObjects.Graphics;
    private fixedLines?: Phaser.GameObjects.Graphics;

    private fixedConnections: Array<{ bag: SpriteOrArc; box: NumBox }> = [];
    // private dragging?: DragState; // unused

    // private numberRowY?: number; // Đã bỏ thang số

    // Đã bỏ counting

    private countLevels: CountLevel[] = [];
    private currentCountLevelIndex = 0;

    private levelLabel?: Phaser.GameObjects.Text;

    private bannerBg?: Phaser.GameObjects.Image;
    private bannerTextImage?: Phaser.GameObjects.Image;

    private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;
    private readonly bannerBgKey = BOARD_ASSET_KEYS.bannerBg;
    private readonly bannerTextKey = BOARD_ASSET_KEYS.bannerText;

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

    init(data: { gameData: GameData }) {
        // Đã bỏ thang số
        // eslint-disable-next-line @typescript-eslint/no-unused-vars

        // Mỗi màn chỉ có 1 asset (chim hoặc vịt), ở giữa board
        this.countLevels = [
            {
                label: DUCK_ASSET.label,
                counts: [1, 0],
                objectTextureKeys: [DUCK_ASSET.icon],
                objectFill: 0xdff6ff,
                objectStroke: 0x7cc8ff,
            },
            {
                label: BIRD_ASSET.label,
                counts: [1, 0],
                objectTextureKeys: [BIRD_ASSET.icon],
                objectFill: 0xffffff,
                objectStroke: 0x6a87ff,
            },
        ];
    }

    preload() {
        loadAssetGroups(this, 'shared', 'countConnect', 'numbers', 'countingNumbers', 'ui');
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
        // Đã bỏ thang số

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

        // Đã bỏ thang số

        // Tạo dàn asset số (image) theo số lượng maxNumber, không đè lên nhau
        // Đã bỏ tạo thang số

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
            if (!this.circling) {
            this.showGuideHand(false);
            }
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
        const img = this.add.image(0, 0, textureKey).setOrigin(0.5).setScale(0.58);
        const frameW = img.width;
        const frameH = img.height;
        if (side === 'left') {
            img.setCrop(0, 0, frameW / 2, frameH);
        } else {
            img.setCrop(frameW / 2, 0, frameW / 2, frameH);
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
        // Cho phép khoanh tự do, không cần bắt đầu từ tâm cụm
        this.circling = {
            bag: undefined as any, // sẽ xác định sau khi khoanh xong
            points: [new Phaser.Math.Vector2(pointer.x, pointer.y)],
        };
        this.hideGuideHand();
    }

    private onMove(pointer: Phaser.Input.Pointer) {
        if (!this.circling) return;

        const pts = this.circling.points;
        const last = pts[pts.length - 1];
        const p = new Phaser.Math.Vector2(pointer.x, pointer.y);

        // lọc bớt điểm cho nhẹ
        if (Phaser.Math.Distance.Between(last.x, last.y, p.x, p.y) < 8) return;
        pts.push(p);

        // Only one cluster, always use red

        // vẽ polyline theo ngón tay
        this.lines.clear();
        this.lines.lineStyle(
            this.connectionLineStyle.width,
            0xff3b30,
            this.connectionLineStyle.alpha
        );
        this.lines.beginPath();
        this.lines.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) this.lines.lineTo(pts[i].x, pts[i].y);
        this.lines.strokePath();
    }

    private onUp() {
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
        const w = Math.max(30, maxX - minX);
        const h = Math.max(30, maxY - minY);

        // Lưu cluster khi khoanh xong
        const clusterColor = bagIndex === 0 ? 'red' : 'blue';
        // Số lượng con vật trong cụm: tạm thời lấy 1 (hoặc bạn có thể đếm theo logic riêng)
        const n = 1;
        this.clusters.push({
            color: clusterColor,
            n,
            x: cx,
            y: cy,
            rx: w / 2,
            ry: h / 2
        });

        // Không cho phép khoanh ngoài board, cho phép vượt ranh giới 30%
        const board = this.boardRect;
        const allowMargin = 0.3; // 30%
        const minXBoard = board.x - board.width * allowMargin;
        const maxXBoard = board.right + board.width * allowMargin;
        const minYBoard = board.y - board.height * allowMargin;
        const maxYBoard = board.bottom + board.height * allowMargin;

        // Nếu có điểm nào vượt quá vùng cho phép thì báo sai luôn
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            if (p.x < minXBoard || p.x > maxXBoard || p.y < minYBoard || p.y > maxYBoard) {
                this.cameras.main.shake(120, 0.01);
                ['voice_guide_connect'].forEach((k) => AudioManager.stop(k));
                AudioManager.play('sfx_wrong');
                this.circling = undefined;
                return;
            }
        }

        // Giới hạn: nửa trên vùng trái, nửa dưới vùng phải
        let inside = 0;
        const assetCenterX = this.boardRect.centerX;
        const assetCenterY = this.boardRect.centerY;
        pts.forEach((p) => {
            let inHalf = false;
            if (bagIndex === 0) {
                // Nửa trên vùng trái
                inHalf = (p.x < assetCenterX) && (p.y < assetCenterY);
            } else {
                // Nửa dưới vùng phải (bình thường)
                inHalf = (p.x > assetCenterX) && (p.y > assetCenterY);
                // Nếu là vịt (level 0), cho phép khoanh nửa trên bên phải nhưng chỉ khi gần giữa
                if (
                    this.getCurrentCountLevel().label === DUCK_ASSET.label &&
                    (p.x > assetCenterX) && (p.y < assetCenterY)
                ) {
                    // Chỉ cho phép nếu x gần assetCenterX (trong 20% chiều rộng board)
                    const boardW = this.boardRect.width;
                    if (Math.abs(p.x - assetCenterX) < boardW * 0.2) {
                        inHalf = true;
                    }
                }
            }
            if (inHalf) inside++;
        });
        // Chỉ cần 30% số điểm nằm trong vùng hợp lệ là được
        if (inside < pts.length * 0.3) {
            this.cameras.main.shake(120, 0.01);
            ['voice_guide_connect'].forEach((k) => AudioManager.stop(k));
            AudioManager.play('sfx_wrong');
            this.circling = undefined;
            return;
        }

        // đúng: khóa vùng
        const bestBag = unlockedBag as Phaser.GameObjects.Container;
        this.locked.add(bestBag);
        this.setClusterInteractive(bestBag, false);

        // Vẽ elip hoàn chỉnh quanh vùng khoanh
        const color = bagIndex === 0 ? 0xff3b30 : 0x2f6cff;
        const ellipseGfx = this.add.graphics().setDepth(999);
        ellipseGfx.lineStyle(5, color, 1);
        ellipseGfx.strokeEllipse(cx, cy, w, h);
        (bestBag as any).ellipseGfx = ellipseGfx;

        AudioManager.play('sfx_correct');
        this.playCorrectAnswerSound();
        this.circling = undefined;
        // Chỉ khi khoanh đủ cả 2 vùng mới qua level
        if (this.locked.size === this.bags.length) {
            this.time.delayedCall(450, () => {
                this.advanceCountLevel();
            });
        }
    }

    // =========================
    // SOUND / CHECK
    // =========================

    private playCorrectAnswerSound() {
        ['voice_guide_connect'].forEach((k) => AudioManager.stop(k));
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
                const img = this.add.image(0, 0, tex).setOrigin(0.5).setScale(0.58);
                const frameW = img.width;
                const frameH = img.height;
                if (index === 0) img.setCrop(0, 0, frameW / 2, frameH);
                else img.setCrop(frameW / 2, 0, frameW / 2, frameH);
                bag.add(img);
            }
            // Không vẽ hình tròn fallback nữa
            if (!this.locked.has(bag)) this.setClusterInteractive(bag, true);
            else this.setClusterInteractive(bag, false);
        });
        this.updateLevelLabel();
    }



    private resetForNextCountLevel() {
        this.locked.clear();
        this.fixedConnections = [];
        this.fixedLines?.clear();
        this.lines.clear();
        this.circling = undefined;
        // Xóa ellipse khoanh quanh asset nếu có
        this.bags.forEach((bagObj) => {
            const bag = bagObj as Phaser.GameObjects.Container;
            if ((bag as any).ellipseGfx) {
                (bag as any).ellipseGfx.destroy();
                (bag as any).ellipseGfx = undefined;
            }
        });
        // Đã bỏ thang số

        // mở lại khoanh
        this.bags.forEach((bagObj) => {
            const bag = bagObj as Phaser.GameObjects.Container;
            this.setClusterInteractive(bag, true);
        });

        // đổi texture + count theo level
        this.applyCurrentLevelToObjects();

        // Phát lại voice hướng dẫn khi chuyển màn
        this.playGuideVoiceForCurrentLevel();

        // Đã bỏ thang số

        this.redrawFixedLines();

        // Hiển thị lại bàn tay hướng dẫn lần đầu tiên khi qua màn mới
        this.guideHandShown = false;
        this.showGuideHand(true);
        this.hideGuideHand();
    }

    private advanceCountLevel() {
        if (this.currentCountLevelIndex + 1 < this.countLevels.length) {
            this.currentCountLevelIndex++;
            this.resetForNextCountLevel();
            return;
        }

        // xong 2 level -> qua flow tiếp, truyền cả clusters sang màn nối
        this.game.events.emit(FLOW_GO_COUNT, { clusters: this.clusters });
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
        // Đã bỏ thang số

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

        // Đã bỏ thang số
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
        const centerY = this.boardRect.centerY;
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

        this.fixedConnections.forEach(({ bag, box }) => {
        let bounds;
        if (box.rect) bounds = box.rect.getBounds();
        else if (box.image) bounds = box.image.getBounds();
        else return;

        const startX = (bag as any).x;
        const startY = (bag as any).y;
        const endX = bounds.centerX;
        const endY = bounds.centerY;

        gfx.lineStyle(this.connectionLineStyle.width, this.connectionLineStyle.color, this.connectionLineStyle.alpha);
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
        if (!this.textures.exists(this.bannerBgKey) && !this.textures.exists(this.bannerTextKey)) return;

        if (!this.bannerBg && this.textures.exists(this.bannerBgKey)) {
        this.bannerBg = this.add.image(0, 0, this.bannerBgKey).setOrigin(0.5, 0.5).setDepth(35);
        }

        if (!this.bannerTextImage && this.textures.exists(this.bannerTextKey)) {
        this.bannerTextImage = this.add.image(0, 0, this.bannerTextKey).setOrigin(0.5, 0.5).setDepth(36);
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

        if (this.bannerTextImage) {
        const textRatio = this.getTextureRatio(this.bannerTextKey) ?? 1;
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
        if (this.locked.size === this.bags.length) return;
        if (!this.bags.length) return;
        if (!this.textures.exists('guide_hand')) return;

        const bagObj = this.bags.find((b) => !this.locked.has(b));
        if (!bagObj) return;

        const bag = bagObj as Phaser.GameObjects.Container;

        this.guideHand = this.add
            .image(bag.x ?? 0, bag.y ?? 0, 'guide_hand')
            .setOrigin(0.2, 0.1)
            .setScale(0.5)
            .setDepth(100)
            .setAlpha(0.92);

        const r = 70;
        this.guideHandTween = this.tweens.addCounter({
            from: 0,
            to: Math.PI * 2,
            duration: 1200,
            repeat: -1,
            onUpdate: (tw) => {
                const a = tw.getValue() ?? 0;
                this.guideHand!.setPosition((bag.x ?? 0) + Math.cos(a) * r, (bag.y ?? 0) + Math.sin(a) * r);
            },
        });

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
    }
