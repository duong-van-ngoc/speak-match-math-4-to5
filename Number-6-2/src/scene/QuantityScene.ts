    import Phaser from 'phaser';
    import { createTopBanner } from '../ui/TopBanner';
    import { COUNT_AND_PAINT_ASSET_KEYS } from '../assets/assetKeys';
    import AudioManager from '../audio/AudioManager';

    // =========================
    // TINH CHỈNH BỐ CỤC (dễ chỉnh)
    // =========================
    // Tất cả các thông số dưới đây có thể chỉnh mà không ảnh hưởng logic game.
    const COUNT_AND_PAINT_TUNING = {
    board: {
        // Board được scale đều để vừa màn hình.
        scaleW: 0.9,
        scaleH: 0.78,
        offsetY: 0.06,

        // Khung nội dung bên trong board (tính theo tỉ lệ của board sau khi scale).
        padX: 0.065,
        padTop: 0.12,
        padBottom: 0.18,
    },
    objects: {
        // Vùng đặt item (tính theo boardContentRect).
        areaW: 0.78,
        areaH: 0.52,
        centerY: 0.28,

        // Khoảng cách lưới (tính theo boardContentRect).
        gapX: 0.028,
        gapY: 0.055,

        // 5 item -> xếp vòng tròn (tính theo vùng item).
        ringRX: 0.5,
        ringRY: 0.5,
        ringSlotW: 0.5,
        ringSlotH: 0.5,

        // Scale item.
        baseScaleMul: 1.25,
        perIndexScaleStep: 0.03,
        maxScaleMul: 2.6,
    },
    circles: {
        // Dãy vòng tròn nằm BÊN TRONG boardContentRect.
        areaW: 1.1,
        yFromBottom: -0.02,
        minGap: 0,
    },
    countLabel: {
        // Số nhảy khi đếm (khi trả lời đúng).
        scale: 0.62,
        yFromSprite: 0.37,
        // Với layout 4/6 item (grid), đẩy số xuống một chút.
        grid46ExtraY: 14,
        // Và cho asset số to hơn một chút.
        grid46ScaleMul: 1.18,
    },
    perItem: {
        // Tinh chỉnh theo từng item (theo index). Có thể thêm nếu cần.
        offsetX: [10, 0, 0, 0, 0, 0] as number[],
        offsetY: [0, 10, 10, 10, 10, 10] as number[],
        scaleMul: [1.3, 1.3, 1.3, 1.3, 1.3, 1.3] as number[],
    },
    perObject: {
        // Tinh chỉnh theo từng loại object (áp dụng cho TẤT CẢ item trong level đó)
        // Ví dụ:
        // [COUNT_AND_PAINT_ASSET_KEYS.scooter]: { scaleMul: 1.15, offsetY: 8 },
        // Mặc định tăng giãn dọc (spreadYMul / gapYMul).
        [COUNT_AND_PAINT_ASSET_KEYS.bicycle]: { scaleMul: 1.15, offsetX: 0, offsetY: 20, spreadYMul: 1.1, gapYMul: 1.15 },
        [COUNT_AND_PAINT_ASSET_KEYS.car]: {
            scaleMul: 1.6,
            offsetX: 0,
            offsetY: 0,
            spreadYMul: 1.5,
            gapYMul: 1.4,
            indexScaleStepMul: 0,
            ignorePerItemOffsets: true,
            ignorePerItemScaleMul: true,
        },
        [COUNT_AND_PAINT_ASSET_KEYS.airplane]: {
            scaleMul: 1.6,
            offsetX: 0,
            offsetY: 0,
            spreadYMul: 1.5,
            gapYMul: 1.4,
            labelOffsetY: 14,
            labelScaleMul: 0.9,
            indexScaleStepMul: 0,
            ignorePerItemOffsets: true,
            ignorePerItemScaleMul: true,
        },
        [COUNT_AND_PAINT_ASSET_KEYS.boat]: {
            scaleMul: 1.55,
            offsetX: 5,
            offsetY: 12,
            spreadYMul: 1.8,
            gapYMul: 1.2,
            labelOffsetY: 14,
            labelScaleMul: 0.8,
            indexScaleStepMul: 0,
            ignorePerItemOffsets: true,
            ignorePerItemScaleMul: true,
        },
        [COUNT_AND_PAINT_ASSET_KEYS.scooter]: {
            scaleMul: 1.6,
            offsetX: 0,
            offsetY: 0,
            spreadYMul: 1.5,
            gapYMul: 1.4,
            indexScaleStepMul: 0,
            ignorePerItemOffsets: true,
            ignorePerItemScaleMul: true,
        },
    } as Record<
        string,
        {
            scaleMul?: number;
            offsetX?: number;
            offsetY?: number;
            spreadXMul?: number; // dãn ngang (grid + vòng tròn)
            spreadYMul?: number; // dãn dọc (grid + vòng tròn)
            gapXMul?: number; // dãn ngang riêng cho grid
            gapYMul?: number; // dãn dọc riêng cho grid
            labelOffsetY?: number; // đẩy số đếm theo asset
            labelScaleMul?: number; // scale số đếm theo asset
            indexScaleStepMul?: number; // hệ số nhân cho scale tăng theo index (0 = tắt)
            ignorePerItemOffsets?: boolean; // bỏ offset theo index (dùng khi muốn thẳng hàng)
            ignorePerItemScaleMul?: boolean; // bỏ scaleMul theo index (dùng khi muốn thẳng hàng)
        }
    >,
    } as const;

        type CountPaintLevel = {
        objectKey: string;     // key texture của đồ vật
        objectCount: number;   // số lượng đồ vật cần đếm
        };

        export const COUNT_AND_PAINT_COMPLETE_EVENT = 'count-and-paint-complete';

export class CountAndPaintScene extends Phaser.Scene {
    // UI ASSETS (keys only; paths are loaded in PreloadScene)
    // - Board: COUNT_AND_PAINT_ASSET_KEYS.board
    // - Banner: COUNT_AND_PAINT_ASSET_KEYS.topBanner (+ COUNT_AND_PAINT_ASSET_KEYS.topBannerText)
    // - Objects: COUNT_AND_PAINT_ASSET_KEYS.bicycle / car / airplane / boat / scooter
    // - Vòng tròn: COUNT_AND_PAINT_ASSET_KEYS.circleEmpty
        // ====== CONFIG "LOGIC" ======
        private readonly maxCircles = 10;     // luôn 10 vòng
        private brushRadius = 24;
        private brushColor = 0xff4f4f; // màu đỏ cho nét tô
        private fillThreshold = 0.8;          // % tô đạt (0..1)
        private paintGridSize = 12;
        private readonly boardKey = COUNT_AND_PAINT_ASSET_KEYS.board;

        // ====== DATA LEVEL (đổi data là ra game khác) ======
        private levels: CountPaintLevel[] = [
            { objectKey: COUNT_AND_PAINT_ASSET_KEYS.bicycle, objectCount: 5 },
            { objectKey: COUNT_AND_PAINT_ASSET_KEYS.car, objectCount: 6 },
            { objectKey: COUNT_AND_PAINT_ASSET_KEYS.airplane, objectCount: 4 },
            { objectKey: COUNT_AND_PAINT_ASSET_KEYS.boat, objectCount: 6 },
            { objectKey: COUNT_AND_PAINT_ASSET_KEYS.scooter, objectCount: 6 },
        ];
        private currentLevelIndex = 0;
        private levelOrder: number[] = [];
        private levelOrderPos = 0;

        // ====== STATE / OBJECTS ======
    private state: 'playing' | 'checking' | 'result' = 'playing';
    private objectSprites: Phaser.GameObjects.Image[] = [];
    private circleSprites: Phaser.GameObjects.Image[] = [];
    private countLabels: Phaser.GameObjects.GameObject[] = [];
    private board?: Phaser.GameObjects.Image;
    private boardContentRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);
    private autoCheckScheduled = false;
    private hasPaintedSinceLastRelease = false;

    constructor() {
        super('CountAndPaintScene');
        }

    init(data: { levelIndex?: number; levelOrder?: number[] } = {}) {
        const max = Math.max(1, this.levels.length);

        const rawOrder = Array.isArray(data?.levelOrder) ? data.levelOrder : undefined;
        if (rawOrder?.length) {
        const normalized = rawOrder
            .map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.floor(x) : -1))
            .filter((x) => x >= 0 && x < max);
        const unique: number[] = [];
        for (const x of normalized) if (!unique.includes(x)) unique.push(x);
        this.levelOrder = unique.length ? unique : Array.from({ length: max }, (_, i) => i);
        } else {
        const requested = data?.levelIndex;
        const start =
            typeof requested === 'number' && Number.isFinite(requested) ? Math.max(0, Math.min(Math.floor(requested), max - 1)) : 0;
        this.levelOrder = Array.from({ length: max }, (_, i) => (start + i) % max);
        }

        this.levelOrderPos = 0;
        this.currentLevelIndex = this.levelOrder[0] ?? 0;
    }

    create() {
        try {
        (window as any).setGameButtonsVisible?.(true);
        } catch {}

        this.ensurePlaceholderTextures();
        this.createBoard();
        // Banner like Arrange High/Low (optional assets; safe no-op if missing).
        createTopBanner(
        this,
        { bannerKey: COUNT_AND_PAINT_ASSET_KEYS.topBanner, textKey: COUNT_AND_PAINT_ASSET_KEYS.topBannerText },
        { yRatio: 0.09, scale: 0.52 }
        );

        this.scale.off('resize', this.layoutUi, this);
        this.scale.on('resize', this.layoutUi, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off('resize', this.layoutUi, this);
            });

    this.layoutUi();
    // Start from the requested/randomized level index (set in init()).
    this.showLevel(this.currentLevelIndex);

    const maybeCheckOnRelease = () => {
        if (this.state !== 'playing') return;
        if (!this.hasPaintedSinceLastRelease) return;
        this.hasPaintedSinceLastRelease = false;
        this.maybeScheduleAutoCheck();
    };

    this.input.on('pointerup', maybeCheckOnRelease);
    // For touch/mouse releasing outside the canvas.
    this.input.on('pointerupoutside', maybeCheckOnRelease);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.off('pointerup', maybeCheckOnRelease);
        this.input.off('pointerupoutside', maybeCheckOnRelease);
    });
    }

        // ====== LEVEL FLOW ======
    private showLevel(index: number) {
        this.clearLevel();
        this.currentLevelIndex = index;
        this.state = 'playing';
        this.autoCheckScheduled = false;
        this.hasPaintedSinceLastRelease = false;

        const level = this.levels[this.currentLevelIndex];
        this.drawObjects(level);
        this.drawCircles();
        try {
          AudioManager.playStage1PaintPrompt(level.objectKey);
        } catch {}
    }

        private nextLevel() {
            const nextPos = this.levelOrderPos + 1;
            if (nextPos >= this.levelOrder.length) {
            this.state = 'result';

            // Báo cho scene điều phối (GameScene) để chuyển sang game tiếp theo.
            this.time.delayedCall(350, () => {
                try {
                AudioManager.playWhenReady?.('voice_complete');
                } catch {}
                this.events.emit(COUNT_AND_PAINT_COMPLETE_EVENT);
            });
            return;
            }

            this.levelOrderPos = nextPos;
            const nextIndex = this.levelOrder[this.levelOrderPos] ?? 0;
            this.showLevel(nextIndex);
        }

        private clearLevel() {
            this.objectSprites.forEach((s) => s.destroy());
            this.objectSprites = [];

            this.circleSprites.forEach((c) => {
            (c.getData('paintGfx') as Phaser.GameObjects.Graphics | undefined)?.destroy();
            (c.getData('maskGfx') as Phaser.GameObjects.Graphics | undefined)?.destroy();
            c.destroy();
            });
            this.circleSprites = [];

            this.countLabels.forEach((t) => t.destroy());
            this.countLabels = [];
        }

    private layoutUi() {
        const w = this.scale.width;
        const h = this.scale.height;

        if (this.board) {
            // Giữ board đúng asset gốc (không xoay / không kéo méo); chỉ scale đều cho vừa màn.
            const tex = this.textures.get(this.boardKey);
            const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
            const tw = (src?.width || 1) as number;
            const th = (src?.height || 1) as number;

            const scale = Math.min((w * COUNT_AND_PAINT_TUNING.board.scaleW) / tw, (h * COUNT_AND_PAINT_TUNING.board.scaleH) / th);
            const boardOffsetY = h * COUNT_AND_PAINT_TUNING.board.offsetY;

            this.board.setAngle(0);
            this.board.setPosition(w / 2, h / 2 + boardOffsetY);
            this.board.setScale(scale);

            const bw = tw * scale;
            const bh = th * scale;

            // Vùng nội dung bên trong board (tỉ lệ tune theo khung Rectangle 1.png).
            const padX = bw * COUNT_AND_PAINT_TUNING.board.padX;
            const padTop = bh * COUNT_AND_PAINT_TUNING.board.padTop;
            const padBottom = bh * COUNT_AND_PAINT_TUNING.board.padBottom;

            const boardCenterY = h / 2 + boardOffsetY;
        this.boardContentRect.setTo(
            w / 2 - bw / 2 + padX,
            boardCenterY - bh / 2 + padTop,
            bw - padX * 2,
            bh - padTop - padBottom
        );
        }
    }

    private createBoard() {
        if (!this.textures.exists(this.boardKey)) return;
        this.board = this.add.image(0, 0, this.boardKey).setOrigin(0.5).setDepth(0);
    }

            // ====== DRAW OBJECTS (ĐỒ VẬT) ======
            private drawObjects(level: CountPaintLevel) {
                const count = level.objectCount;
                const rect = this.boardContentRect.width > 0 ? this.boardContentRect : new Phaser.Geom.Rectangle(0, 0, this.scale.width, this.scale.height);
                const perObjTune = COUNT_AND_PAINT_TUNING.perObject[level.objectKey] ?? {};

                const areaW = rect.width * COUNT_AND_PAINT_TUNING.objects.areaW;
                const areaH = rect.height * COUNT_AND_PAINT_TUNING.objects.areaH;
                const centerX = rect.centerX;
                const centerY = rect.y + rect.height * COUNT_AND_PAINT_TUNING.objects.centerY;

                const positions: Array<{ x: number; y: number }> = [];
                let slotW = 0;
                let slotH = 0;

                // Quy tắc xếp:
                // - 6 item: 2 hàng x 3 cột
                // - 4 item: 2 hàng x 2 cột
                // - 5 item: xếp vòng tròn
                if (count === 5) {
                // Dãn ra thêm chút vì item đang to.
                const rX = areaW * COUNT_AND_PAINT_TUNING.objects.ringRX * (perObjTune.spreadXMul ?? 1);
                const rY = areaH * COUNT_AND_PAINT_TUNING.objects.ringRY * (perObjTune.spreadYMul ?? 1);
                const startAngle = -Math.PI / 2;
                for (let i = 0; i < count; i++) {
                    const a = startAngle + (i * Math.PI * 2) / count;
                    positions.push({ x: centerX + Math.cos(a) * rX, y: centerY + Math.sin(a) * rY });
                }

                // Ước lượng kích thước ô để tính scale
                slotW = areaW * COUNT_AND_PAINT_TUNING.objects.ringSlotW;
                slotH = areaH * COUNT_AND_PAINT_TUNING.objects.ringSlotH;
                } else {
                const rows = count === 4 || count === 6 ? 2 : Math.min(2, count);
                const cols = count === 4 ? 2 : count === 6 ? 3 : Math.ceil(count / rows);

                const gapX =
                rect.width *
                COUNT_AND_PAINT_TUNING.objects.gapX *
                (perObjTune.gapXMul ?? 1);
                const gapY =
                rect.height *
                COUNT_AND_PAINT_TUNING.objects.gapY *
                (perObjTune.gapYMul ?? 1);

                slotW = (areaW - (cols - 1) * gapX) / cols;
                slotH = (areaH - (rows - 1) * gapY) / rows;

                const startX = centerX - areaW / 2 + slotW / 2;
                const startY = centerY - areaH / 2 + slotH / 2;

            for (let i = 0; i < count; i++) {
                const r = Math.floor(i / cols);
                const c = i % cols;
                positions.push({ x: startX + c * (slotW + gapX), y: startY + r * (slotH + gapY) });
            }
            }

            // Dãn vị trí (grid + vòng tròn) mà không làm nhỏ item.
            // Giữ scale dựa trên slotW/slotH ổn định, nhưng tăng khoảng cách hiển thị.
            const spreadX = perObjTune.spreadXMul ?? 1;
            const spreadY = perObjTune.spreadYMul ?? 1;
            if (spreadX !== 1 || spreadY !== 1) {
                for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                if (!p) continue;
                p.x = centerX + (p.x - centerX) * spreadX;
                p.y = centerY + (p.y - centerY) * spreadY;
                }
            }

            for (let i = 0; i < count; i++) {
            const p = positions[i];
            const baseX = p?.x ?? centerX;
            const baseY = p?.y ?? centerY;
                const perItemDx = perObjTune.ignorePerItemOffsets ? 0 : (COUNT_AND_PAINT_TUNING.perItem.offsetX[i] ?? 0);
                const perItemDy = perObjTune.ignorePerItemOffsets ? 0 : (COUNT_AND_PAINT_TUNING.perItem.offsetY[i] ?? 0);
                const perObjDx = perObjTune.offsetX ?? 0;
                const perObjDy = perObjTune.offsetY ?? 0;
                const x = baseX + perItemDx + perObjDx;
                const y = baseY + perItemDy + perObjDy;

                const sprite = this.add.image(x, y, level.objectKey).setOrigin(0.5).setDepth(2);

                // scale vừa ô
                const base = this.getScaleForTexture(level.objectKey, slotW, slotH);
                const indexScaleStepMul = perObjTune.indexScaleStepMul ?? 1;
                const perItemBoost = 1 + i * COUNT_AND_PAINT_TUNING.objects.perIndexScaleStep * indexScaleStepMul;
                const perItemMul = perObjTune.ignorePerItemScaleMul ? 1 : (COUNT_AND_PAINT_TUNING.perItem.scaleMul[i] ?? 1);
                const perObjMul = perObjTune.scaleMul ?? 1;
                const scale = Math.min(
                base * COUNT_AND_PAINT_TUNING.objects.baseScaleMul * perItemBoost * perItemMul * perObjMul,
                base * COUNT_AND_PAINT_TUNING.objects.maxScaleMul
                );
                sprite.setScale(scale);

                (sprite as any).baseScaleX = sprite.scaleX;
                (sprite as any).baseScaleY = sprite.scaleY;

                this.objectSprites.push(sprite);
                }
            }

            private getScaleForTexture(textureKey: string, maxWidth: number, maxHeight: number) {
                const tex = this.textures.get(textureKey);
                const source = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
                const tw = (source?.width || 1) as number;
                const th = (source?.height || 1) as number;

                const sx = (maxWidth * 0.85) / tw;
                const sy = (maxHeight * 0.85) / th;
                return Math.min(sx, sy);
            }

            // ====== DRAW CIRCLES (VÒNG TRÒN) ======
            private drawCircles() {
                const rect =
                this.boardContentRect.width > 0
                    ? this.boardContentRect
                    : new Phaser.Geom.Rectangle(0, 0, this.scale.width, this.scale.height);

                // Dãy vòng tròn nằm TRONG board, nhưng đẩy xuống thấp hơn.
                const centerX = rect.centerX;
                const areaW = rect.width * COUNT_AND_PAINT_TUNING.circles.areaW;
                const y = rect.bottom - rect.height * COUNT_AND_PAINT_TUNING.circles.yFromBottom;

                const texImg = this.textures.get(COUNT_AND_PAINT_ASSET_KEYS.circleEmpty).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
                const texW = (texImg.width || 1) as number;

                const MIN_GAP = COUNT_AND_PAINT_TUNING.circles.minGap;
                const fitScale = (areaW - (this.maxCircles - 1) * MIN_GAP) / (this.maxCircles * texW);

                const circleScale = fitScale; // đơn giản: fit là scale
                const circleW = texW * circleScale;

                const gapX =
                this.maxCircles > 1
                    ? Math.max(MIN_GAP, (areaW - this.maxCircles * circleW) / (this.maxCircles - 1))
                    : 0;

                const startX =
                centerX - (circleW * this.maxCircles + gapX * (this.maxCircles - 1)) / 2 + circleW / 2;

                for (let i = 0; i < this.maxCircles; i++) {
                const x = startX + i * (circleW + gapX);

                const circle = this.add
                    .image(x, y, COUNT_AND_PAINT_ASSET_KEYS.circleEmpty)
                    .setOrigin(0.5)
                    .setScale(circleScale)
                    .setInteractive({ useHandCursor: true })
                    .setDepth(2);

                // paint layer (vẽ nét tô)
                const paintGfx = this.add.graphics().setDepth(3);

                // mask để nét tô không tràn ra ngoài
                const maskGfx = this.make.graphics({ x: 0, y: 0 }, false);
                maskGfx.fillStyle(0xffffff);
                maskGfx.fillCircle(circle.x, circle.y, (circle.displayWidth / 2) * 0.93);
                const circleMask = maskGfx.createGeometryMask();
                paintGfx.setMask(circleMask);

                circle.setData('paintGfx', paintGfx);
                circle.setData('maskGfx', maskGfx);
                circle.setData('mask', circleMask);
                circle.setData('paintSet', new Set<string>());
                circle.setData('gridSize', this.paintGridSize);
                circle.setData('isFilled', false);

                circle.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                    if (this.state !== 'playing') return;
                    // Cho phép chạm vào vòng đã tô để xóa (bé có thể sửa “tô quá” mà không cần reset tất cả).
                    if (circle.getData('isFilled')) {
                        this.clearFilledCircle(circle);
                        return;
                    }
                    this.paintInCircle(circle, pointer);
                });

                circle.on('pointermove', (pointer: Phaser.Input.Pointer) => {
                    if (this.state !== 'playing') return;
                    if (!pointer.isDown) return;
                    this.paintInCircle(circle, pointer);
                });

                this.circleSprites.push(circle);
                }
            }

            // ====== PAINT + % FILL (LOGIC CHÍNH) ======
        private paintInCircle(circle: Phaser.GameObjects.Image, pointer: Phaser.Input.Pointer) {
                const paintGfx = circle.getData('paintGfx') as Phaser.GameObjects.Graphics;
                if (!paintGfx) return;
                if (circle.getData('isFilled')) return;

                const dx = pointer.worldX - circle.x;
                const dy = pointer.worldY - circle.y;

                const radius = (circle.displayWidth / 2) * 1.0;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) return;

            // vẽ chấm
            paintGfx.fillStyle(this.brushColor, 0.95);
            paintGfx.fillCircle(pointer.worldX, pointer.worldY, this.brushRadius);
            this.hasPaintedSinceLastRelease = true;

                // cập nhật lưới để tính % tô
                const gridSize = (circle.getData('gridSize') as number) || this.paintGridSize;
                const paintedSet = circle.getData('paintSet') as Set<string>;

                const nx = dx / radius;
                const ny = dy / radius;

                const brushN = this.brushRadius / radius;
                const rCells = Math.ceil((brushN * gridSize) / 2) + 1;

                const cx = Math.floor(((nx + 1) / 2) * gridSize);
                const cy = Math.floor(((ny + 1) / 2) * gridSize);

            for (let gx = cx - rCells; gx <= cx + rCells; gx++) {
            for (let gy = cy - rCells; gy <= cy + rCells; gy++) {
                    if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize) continue;

                    const cellNx = ((gx + 0.5) / gridSize) * 2 - 1;
                    const cellNy = ((gy + 0.5) / gridSize) * 2 - 1;

                    // chỉ lấy ô nằm trong hình tròn
                    if (cellNx * cellNx + cellNy * cellNy > 1) continue;

                    // chỉ lấy ô nằm trong vùng brush
                    const ddx = cellNx - nx;
                    const ddy = cellNy - ny;
                    if (ddx * ddx + ddy * ddy <= brushN * brushN) {
                    paintedSet.add(`${gx},${gy}`);
                }
            }
            }

            this.lockCircleIfFilled(circle);
        }

        private lockCircleIfFilled(circle: Phaser.GameObjects.Image) {
            if (circle.getData('isFilled')) return;
            if (this.getCircleFillRatio(circle) < this.fillThreshold) return;

            circle.setData('isFilled', true);
            circle.setTexture(COUNT_AND_PAINT_ASSET_KEYS.circleFilledRed);

            const paintGfx = circle.getData('paintGfx') as Phaser.GameObjects.Graphics | undefined;
            if (paintGfx) {
            paintGfx.clear();
            // Bỏ mask cho lớp paint (KHÔNG destroy GeometryMask dùng chung).
            (paintGfx as any).clearMask?.();
            }
        }

        private clearFilledCircle(circle: Phaser.GameObjects.Image) {
            if (this.state !== 'playing') return;

            circle.setData('isFilled', false);
            circle.setTexture(COUNT_AND_PAINT_ASSET_KEYS.circleEmpty);

            const paintGfx = circle.getData('paintGfx') as Phaser.GameObjects.Graphics | undefined;
            const paintedSet = circle.getData('paintSet') as Set<string> | undefined;
            const mask = circle.getData('mask');

            paintedSet?.clear();
            paintGfx?.clear();
            if (paintGfx) {
                try {
                    (paintGfx as any).clearMask?.(true);
                } catch {}
                paintGfx.setMask(mask);
            }

            // Xem thao tác xóa như một “thay đổi” để auto-check khi thả tay.
            this.hasPaintedSinceLastRelease = true;
        }

        private maybeScheduleAutoCheck() {
            if (this.autoCheckScheduled) return;
            if (this.state !== 'playing') return;

            const level = this.levels[this.currentLevelIndex];
            const filled = this.countFilledCircles();
            if (filled < level.objectCount) return;

            this.autoCheckScheduled = true;
            this.time.delayedCall(120, () => {
            this.autoCheckScheduled = false;
            if (!this.scene.isActive()) return;
            if (this.state !== 'playing') return;
            const stillFilled = this.countFilledCircles();
            if (stillFilled < level.objectCount) return;
            this.checkAnswer();
            });
        }

        private getNumberAssetKey(n: number): string | null {
            switch (n) {
            case 1:
                return this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.number1) ? COUNT_AND_PAINT_ASSET_KEYS.number1 : null;
            case 2:
                return this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.number2) ? COUNT_AND_PAINT_ASSET_KEYS.number2 : null;
            case 3:
                return this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.number3) ? COUNT_AND_PAINT_ASSET_KEYS.number3 : null;
            case 4:
                return this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.number4) ? COUNT_AND_PAINT_ASSET_KEYS.number4 : null;
            case 5:
                return this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.number5) ? COUNT_AND_PAINT_ASSET_KEYS.number5 : null;
            case 6:
                return this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.number6) ? COUNT_AND_PAINT_ASSET_KEYS.number6 : null;
            default:
                return null;
            }
        }

        private getCircleFillRatio(circle: Phaser.GameObjects.Image): number {
                const gridSize = (circle.getData('gridSize') as number) || this.paintGridSize;
                const paintedSet = circle.getData('paintSet') as Set<string>;
                if (!paintedSet) return 0;

                let circleCells = 0;
                for (let gx = 0; gx < gridSize; gx++) {
                for (let gy = 0; gy < gridSize; gy++) {
                    const nx = ((gx + 0.5) / gridSize) * 2 - 1;
                    const ny = ((gy + 0.5) / gridSize) * 2 - 1;
                    if (nx * nx + ny * ny <= 1) circleCells++;
                }
                }
                if (circleCells === 0) return 0;

                return paintedSet.size / circleCells;
            }

            private countFilledCircles(): number {
                let count = 0;
                for (const circle of this.circleSprites) {
                if (this.getCircleFillRatio(circle) >= this.fillThreshold) count++;
                }
                return count;
            }

            // ====== CHECK (ĐÚNG/SAI) ======
            private checkAnswer() {
                this.state = 'checking';

                const level = this.levels[this.currentLevelIndex];
                const filled = this.countFilledCircles();
                const isCorrect = filled === level.objectCount;

                if (isCorrect) {
                void (async () => {
                    this.markCorrectCirclesGreen();
                    try {
                    AudioManager.playWhenReady?.('sfx_correct');
                    } catch {}
                    const correctVoice = (async () => {
                    try {
                        await AudioManager.playCorrectAnswerAndWait();
                    } catch {}
                    })();

                    // Wait for the "correct" voice to finish, then guide "count again",
                    // then start counting voices 1..N.
                    await correctVoice;
                    try {
                    await AudioManager.playStage1CountAgainAndWait();
                    } catch {}
                    this.showCountNumbers(level.objectCount, () => {
                    this.time.delayedCall(450, () => this.nextLevel());
                    });
                })();
                return;
                }

                this.shakeCircles();
                void (async () => {
                try {
                    if (AudioManager.has('sfx_wrong')) {
                    // Let the "wrong" voice play while showing shake/reset.
                    AudioManager.playWhenReady?.('sfx_wrong');
                    }
                } catch {}
                this.time.delayedCall(450, () => {
                    // Sai thì xóa để bé tô lại từ đầu.
                    this.resetCirclesPaint();
                    this.state = 'playing';
                });
                })();
            }

            private markCorrectCirclesGreen() {
                for (const circle of this.circleSprites) {
                const ratio = this.getCircleFillRatio(circle);
                if (ratio < this.fillThreshold) {
                    // Khi đúng: xóa các nét tô thừa ở những vòng chưa đạt ngưỡng (không tính điểm).
                    const paintGfx = circle.getData('paintGfx') as Phaser.GameObjects.Graphics | undefined;
                    const paintedSet = circle.getData('paintSet') as Set<string> | undefined;
                    const mask = circle.getData('mask');

                    paintedSet?.clear();
                    paintGfx?.clear();
                    if (paintGfx) paintGfx.setMask(mask);

                    circle.setData('isFilled', false);
                    circle.setTexture(COUNT_AND_PAINT_ASSET_KEYS.circleEmpty);
                    circle.setInteractive({ useHandCursor: true });
                    continue;
                }

                circle.setData('isFilled', true);
                circle.disableInteractive();
                circle.setTexture(COUNT_AND_PAINT_ASSET_KEYS.circleFilledGreen);

                const paintGfx = circle.getData('paintGfx') as Phaser.GameObjects.Graphics | undefined;
                if (paintGfx) {
                paintGfx.clear();
                // Bỏ mask cho lớp paint (KHÔNG destroy GeometryMask dùng chung).
                (paintGfx as any).clearMask?.();
                }
                }
            }

            private resetCirclesPaint() {
                this.circleSprites.forEach((circle) => {
                const paintGfx = circle.getData('paintGfx') as Phaser.GameObjects.Graphics | undefined;
                const paintedSet = circle.getData('paintSet') as Set<string> | undefined;
                let mask = circle.getData('mask');
                const maskGfx = circle.getData('maskGfx') as Phaser.GameObjects.Graphics | undefined;
                if ((!mask || (mask as any).graphics == null) && maskGfx) {
                    mask = (maskGfx as any).createGeometryMask?.();
                    circle.setData('mask', mask);
                }

                circle.setData('isFilled', false);
                circle.setTexture(COUNT_AND_PAINT_ASSET_KEYS.circleEmpty);

                paintedSet?.clear();
                paintGfx?.clear();
                if (paintGfx) {
                    try {
                    (paintGfx as any).clearMask?.();
                    } catch {}
                    paintGfx.setMask(mask);
                }

                // Giữ interactive để bé có thể thao tác lại.
                circle.setInteractive({ useHandCursor: true });
                });
            }

            private shakeCircles() {
                this.tweens.add({
                targets: this.circleSprites,
                x: '+=10',
                yoyo: true,
                duration: 60,
                repeat: 3,
                });
            }

            // ====== HIỆN SỐ ĐẾM (hiệu ứng đếm) ======
            private showCountNumbers(n: number, onDone?: () => void) {
                this.countLabels.forEach((t) => t.destroy());
                this.countLabels = [];

            const max = Math.min(n, this.objectSprites.length);
            const stepDelay = 320;
            const voiceTimeoutMs = 4000;
            const level = this.levels[this.currentLevelIndex];
            const perObj = (level && COUNT_AND_PAINT_TUNING.perObject[level.objectKey]) || {};
            const labelOffsetY = perObj.labelOffsetY ?? 0;
            const labelScaleMul = perObj.labelScaleMul ?? 1;
            const isGrid46 = level?.objectCount === 4 || level?.objectCount === 6;
            const gridExtraY = isGrid46 ? COUNT_AND_PAINT_TUNING.countLabel.grid46ExtraY : 0;
            const gridScaleMul = isGrid46 ? COUNT_AND_PAINT_TUNING.countLabel.grid46ScaleMul : 1;
            const targetScale = COUNT_AND_PAINT_TUNING.countLabel.scale * labelScaleMul * gridScaleMul;
            const startScale = targetScale * 0.6;

            const step = (i: number) => {
            if (!this.scene.isActive()) return;
            if (i >= max) {
                onDone?.();
                    return;
                }

                const s = this.objectSprites[i];
                const baseScaleX = (s as any).baseScaleX ?? s.scaleX;
                const baseScaleY = (s as any).baseScaleY ?? s.scaleY;

                const labelY =
                    s.y + s.displayHeight * COUNT_AND_PAINT_TUNING.countLabel.yFromSprite + labelOffsetY + gridExtraY;
                const numberKey = this.getNumberAssetKey(i + 1);
                const label =
                    numberKey
                    ? this.add.image(s.x, labelY, numberKey).setOrigin(0.5, 0).setDepth(10)
                    : this.add
                        .text(s.x, labelY, `${i + 1}`, {
                            fontFamily: 'Baloo, Arial',
                            fontSize: '55px',
                            fontStyle: 'normal',
                            color: '#000000',
                        })
                        .setOrigin(0.5, 0)
                        .setDepth(10);

                (label as any).setScale?.(startScale);

                // Nhảy + pop theo từng item (đếm lần lượt)
                this.tweens.add({ targets: label, scaleX: targetScale, scaleY: targetScale, duration: 180, ease: 'Back.Out' });
                this.tweens.add({ targets: s, y: s.y - 18, duration: 120, yoyo: true, ease: 'Quad.Out' });
                this.tweens.add({
                    targets: s,
                    scaleX: baseScaleX * 1.12,
                    scaleY: baseScaleY * 1.12,
                    duration: 140,
                    yoyo: true,
                    ease: 'Back.Out',
                });

                this.countLabels.push(label);

                const voiceId = `voice_count_${i + 1}`;
                if (AudioManager.has(voiceId)) {
                    const delayP = new Promise<void>((r) => this.time.delayedCall(stepDelay, () => r()));
                    const voiceP = AudioManager.playAndWait(voiceId, { timeoutMs: voiceTimeoutMs }).then(() => undefined);
                    void Promise.all([delayP, voiceP]).then(() => step(i + 1));
                } else {
                    this.time.delayedCall(stepDelay, () => step(i + 1));
                }
                };

                step(0);
            }

            private ensurePlaceholderTextures() {
                const createRect = (key: string, fill: number) => {
                if (this.textures.exists(key)) return;
                const g = this.make.graphics({ x: 0, y: 0 });
                g.fillStyle(fill, 1);
                g.fillRoundedRect(0, 0, 220, 180, 28);
                g.lineStyle(8, 0xffffff, 0.85);
                g.strokeRoundedRect(10, 10, 200, 160, 22);
                g.generateTexture(key, 220, 180);
                g.destroy();
                };

                // Fallback textures nếu chưa được preload (để scene chạy không crash).
                createRect(COUNT_AND_PAINT_ASSET_KEYS.bicycle, 0x60a5fa);
                createRect(COUNT_AND_PAINT_ASSET_KEYS.car, 0x34d399);
                createRect(COUNT_AND_PAINT_ASSET_KEYS.airplane, 0xfbbf24);
                createRect(COUNT_AND_PAINT_ASSET_KEYS.boat, 0x38bdf8);
                createRect(COUNT_AND_PAINT_ASSET_KEYS.scooter, 0x34d399);

            if (!this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.circleEmpty)) {
            // UI vòng tròn: 128x128, viền 3px, màu #0A6080 (theo thiết kế)
            const size = 128;
            const stroke = 3;
            const r = size / 2 - stroke / 2;
            const g = this.make.graphics({ x: 0, y: 0 });
            g.clear();
            g.fillStyle(0xffffff, 0); // transparent fill
            g.fillCircle(size / 2, size / 2, r);
            g.lineStyle(stroke, 0x0a6080, 1);
            g.strokeCircle(size / 2, size / 2, r);
            g.generateTexture(COUNT_AND_PAINT_ASSET_KEYS.circleEmpty, size, size);
            g.destroy();
            }

            if (!this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.circleFilledRed)) {
            // UI vòng tròn đã tô: nền đỏ + viền (theo mock).
            const size = 128;
            const stroke = 3;
            const r = size / 2 - stroke / 2;
            const g = this.make.graphics({ x: 0, y: 0 });
            g.clear();
            g.fillStyle(0xff4f4f, 1);
            g.fillCircle(size / 2, size / 2, r);
            g.lineStyle(stroke, 0x0a6080, 1);
            g.strokeCircle(size / 2, size / 2, r);
            g.generateTexture(COUNT_AND_PAINT_ASSET_KEYS.circleFilledRed, size, size);
            g.destroy();
            }

            if (!this.textures.exists(COUNT_AND_PAINT_ASSET_KEYS.circleFilledGreen)) {
            // UI vòng tròn đúng: nền xanh + viền (theo mock).
            const size = 128;
            const stroke = 3;
            const r = size / 2 - stroke / 2;
            const g = this.make.graphics({ x: 0, y: 0 });
            g.clear();
            g.fillStyle(0x00c853, 1);
            g.fillCircle(size / 2, size / 2, r);
            g.lineStyle(stroke, 0x0a6080, 1);
            g.strokeCircle(size / 2, size / 2, r);
            g.generateTexture(COUNT_AND_PAINT_ASSET_KEYS.circleFilledGreen, size, size);
            g.destroy();
            }
        }
            }
