import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import type { NumBox } from '../ui/helpers';
import { FLOW_GO_COLOR } from '../flow/events';
// import { COLORS } from '../data/gameData';
import {
    BOARD_ASSET_KEYS,
    COUNT_CONNECT_ASSETS,
    // NUMBER_ASSETS,
    loadAssetGroups,
} from '../assets';
import AudioManager from '../AudioManager';

type SpriteOrArc = Phaser.GameObjects.Arc | Phaser.GameObjects.Image;

type DragState = {
    bag: SpriteOrArc; // giữ tên bag để không phải sửa nhiều logic, nhưng thực tế là "object trái/phải"
    startX: number;
    startY: number;
};

type CountLevel = {
    label: string;
    counts: [number, number];

    // object trái/phải
    objectTextureKeys?: (string | undefined)[];

    // fallback nếu không có texture
    objectFill: number;
    objectStroke: number;
};

export class CountConnectScene extends Phaser.Scene {
    // Phát voice hướng dẫn cho từng màn (level) CountConnect qua AudioManager
    private playGuideVoiceForCurrentLevel() {
        // Ngắt tất cả âm thanh hướng dẫn trước khi phát mới
        const voiceKeys = [
            'voice_guide_connect',
        ];
        voiceKeys.forEach((k) => AudioManager.stop(k));
        const key = voiceKeys[this.currentCountLevelIndex] || voiceKeys[0];
        AudioManager.playWhenReady(key);
    }
    private dataGame!: GameData;

    private boxes: NumBox[] = [];
    private bags: SpriteOrArc[] = []; // giờ là 2 object trái/phải
    private locked = new Set<SpriteOrArc>();

    private boardFallbackGfx?: Phaser.GameObjects.Graphics;
    private boardImage?: Phaser.GameObjects.Image;
    private boardRect = new Phaser.Geom.Rectangle();
    private boardInnerRect = new Phaser.Geom.Rectangle();

    private objectPositions?: { leftX: number; rightX: number; y: number };

    private readonly connectionLineStyle = { width: 6, color: 0x374151, alpha: 0.9 };
    private lines!: Phaser.GameObjects.Graphics;
    private fixedLines?: Phaser.GameObjects.Graphics;

    private fixedConnections: Array<{ bag: SpriteOrArc; box: NumBox; dropX: number }> = [];
    private dragging?: DragState;

    private numberRowY?: number;

    private countingLabels: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Image> = [];
    private isCountingSequence = false;

    private countLevels: CountLevel[] = [];
    private currentCountLevelIndex = 0;
    private lastAudioDuration = 0;

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

    constructor() {
        super('CountConnectScene');
    }

    init(data: { gameData: GameData }) {
        this.dataGame = data.gameData;

        // Khởi tạo trạng thái lần đầu vào game nếu chưa có
        if (this.game.registry.get('firstTimeInGame') === undefined) {
            this.game.registry.set('firstTimeInGame', true);
        }

        // Level 1 = BÓNG: trái/phải đều là 1
        // Level 2 = BI: trái 1, phải 2
        const ballKeys = COUNT_CONNECT_ASSETS.bagTextures ?? [];
        const marbleKeys = COUNT_CONNECT_ASSETS.marbleTextures ?? [];

        const pick2 = (arr: Array<string | undefined>) => [
            arr[0],
            arr[1] ?? arr[0],
        ] as (string | undefined)[];

        this.countLevels = [
            {
                label: 'Bóng',
                counts: [1, 1], // trái/phải đều là 1
                objectTextureKeys: pick2(ballKeys),
                objectFill: 0xdff6ff,
                objectStroke: 0x7cc8ff,
            },
            {
                label: 'Bi',
                counts: [1, 2], // trái 1, phải 2
                objectTextureKeys: pick2(marbleKeys),
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
        // Reset toàn bộ trạng thái kết nối khi vào lại scene (chơi lại)
        this.locked = new Set();
        this.fixedConnections = [];
        if (this.fixedLines) this.fixedLines.clear();
        if (this.lines) this.lines.clear();
        this.dragging = undefined;
        this.clearCountingLabels?.();
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

        const midX = this.boardRect.centerX;
        const numberY = this.numberRowY ?? 140;

        // Tạo dàn asset số (image) theo số lượng maxNumber, không đè lên nhau
        this.boxes = [];
        const maxNumber = this.dataGame.maxNumber;
        const scale = 0.675; // scale nhỏ lại như hình mẫu
        const gap = 0; // khoảng cách giữa các số - tăng lên để test
        // Tính tổng width thực tế của tất cả asset số (sau khi scale)
        let totalW = 0;
        const widths: number[] = [];
        for (let i = 0; i < maxNumber; i++) {
            const n = i + 1;
            const numberKey = `number_${n}`;
            let w = 100; // fallback width
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
            console.log(`[CountConnectScene] Creating number ${n} at cx=${cx}, totalW=${totalW}, midX=${midX}`);
            let image: Phaser.GameObjects.Image | undefined = undefined;
            if (this.textures.exists(numberKey)) {
                image = this.add.image(cx, numberY, numberKey).setOrigin(0.5);
                image.setScale(scale, scale);
                image.setInteractive({ useHandCursor: true });
            }
            // Populate boxes array for hit detection and logic
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
                setNumberTint: image ? (color?: number) => { if (color !== undefined) image.setTint(color); } : undefined,
            });
            cx += widths[i] / 2 + gap;
        }

        this.lines = this.add.graphics().setDepth(4);
        this.fixedLines = this.add.graphics().setDepth(3);

        const objectLayout = this.objectPositions ?? {
            leftX: midX - 160,
            rightX: midX + 160,
            y: this.scale.height * 0.8, // dịch xuống thêm một chút
        };

        const level = this.getCurrentCountLevel();
        const leftKey = level.objectTextureKeys?.[0];
        const rightKey = level.objectTextureKeys?.[1];

        const o1 = this.createObject(objectLayout.leftX, objectLayout.y, 56, leftKey, level.objectFill);
        const o2 = this.createObject(objectLayout.rightX, objectLayout.y, 56, rightKey, level.objectFill);
        this.bags = [o1, o2];

        // layout lại lần nữa để reposition chuẩn (nhất là khi resize / board ratio)
        this.layoutBoard();

        this.applyCurrentLevelToObjects();

        // Phát voice hướng dẫn cho màn hiện tại
        this.playGuideVoiceForCurrentLevel();

        // Hiển thị bàn tay hướng dẫn nối lần đầu vào game
        if (this.game.registry.get('firstTimeInGame')) {
            this.showGuideHand(true);
            this.game.registry.set('firstTimeInGame', false);
        } else {
            // Set timeout 10 giây nếu không thao tác
            this.guideHandTimeout = this.time.delayedCall(10000, () => {
                this.showGuideHand(false);
            });
        }
        this.input.on('pointerdown', this.onDown, this);
        this.input.on('pointermove', this.onMove, this);
        this.input.on('pointerup', this.onUp, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.layoutBoard, this);
            // Reset các asset để khi chơi lại sẽ tạo mới
            this.boardImage = undefined;
            this.bannerBg = undefined;
            this.bannerTextImage = undefined;
        });
    }

    private createObject(
        x: number,
        y: number,
        radius: number,
        textureKey: string | undefined,
        fillColor: number,
        // strokeColor: number
    ): SpriteOrArc {
        if (textureKey && this.textures.exists(textureKey)) {
            // Hiển thị asset bóng/bi cùng tỉ lệ với asset số (scale 0.45)
            const obj = this.add
                .image(x, y, textureKey)
                .setOrigin(0.5)
                .setScale(0.6, 0.6)
                .setInteractive({ useHandCursor: true });
            // Không vẽ stroke cho asset
            return obj;
        }
        // Chỉ tạo hình tròn fill, không stroke
        return this.add
            .circle(x, y, radius, fillColor)
            .setInteractive({ useHandCursor: true }) as Phaser.GameObjects.Arc;
    }

    private onDown(pointer: Phaser.Input.Pointer) {
        if (this.isCountingSequence) return;
        const bag = this.bags.find((b) => b.getBounds().contains(pointer.x, pointer.y));
        if (!bag) return;
        if (this.locked.has(bag)) return;
        this.dragging = { bag, startX: bag.x, startY: bag.y };
        // Ẩn bàn tay hướng dẫn khi người chơi bắt đầu kéo
        this.hideGuideHand();
    }

    private onMove(pointer: Phaser.Input.Pointer) {
        if (!this.dragging) return;

        this.lines.clear();
        this.lines.lineStyle(
            this.connectionLineStyle.width,
            this.connectionLineStyle.color,
            this.connectionLineStyle.alpha
        );
        this.lines.beginPath();
        const start = this.getBagLineStart(this.dragging.bag, pointer.x, pointer.y);

        // const hitBox = this.findBox(pointer.x, pointer.y);

        let endX = pointer.x;
        let endY = pointer.y;

        this.lines.moveTo(start.x, start.y);
        this.lines.lineTo(endX, endY);
        this.lines.strokePath();
    }

    private onUp(pointer: Phaser.Input.Pointer) {
        if (!this.dragging) return;

        const bag = this.dragging.bag;
        const count = bag.getData('count') as number;

        const hit = this.findBox(pointer.x, pointer.y);
        this.lines.clear();

        if (!hit || hit.n !== count) {
            this.shakeObject(bag);
            // Ngắt tất cả voice hướng dẫn trước khi phát âm thanh sai
            ['voice_guide_connect'].forEach((k) => AudioManager.stop(k));
            AudioManager.play('sfx_wrong');
            this.dragging = undefined;
            this.time.delayedCall(500, () => this.showGuideHand(false));
            return;
        }

        // đúng: “khóa” object + highlight ô
        this.locked.add(bag);
        bag.disableInteractive();

        // Nếu dùng asset số thì không vẽ khung highlight
        if (!hit.image) {
            hit.text.setColor('#0b1b2a');
            hit.setNumberTint?.(0x0b1b2a);
        }

        if (!this.fixedConnections.some((conn) => conn.bag === bag)) {
            this.fixedConnections.push({ bag, box: hit, dropX: pointer.x });
            this.redrawFixedLines();
        }

        // Phát âm thanh đúng mỗi lần ghép đúng
        AudioManager.play('sfx_correct');
        const correctSoundKey = this.playCorrectAnswerSound();
        const delay = this.audioDurations[correctSoundKey] || 800;


        this.dragging = undefined;

        this.time.delayedCall(delay, () => {
            // Play counting sequence for the single connected bag
            this.showCountingSequence(() => {
                if (this.locked.size === this.bags.length) {
                    // All items connected, advance level after a delay
                    this.time.delayedCall(800, () => {
                        this.advanceCountLevel();
                    });
                } else {
                    // Not all items connected. Set a timer to show the guide hand after 10s of inactivity.
                    if (this.guideHandTimeout) this.guideHandTimeout.remove(false);
                    this.guideHandTimeout = this.time.delayedCall(10000, () => {
                        this.showGuideHand(false);
                    });
                }
            }, bag);
        });
    }

    // Phát âm thanh đúng tiếng Việt, random 1 trong 4 file
    private playCorrectAnswerSound(): string {
        // Ngắt tất cả voice hướng dẫn trước khi phát âm thanh đúng
        ['voice_guide_connect'].forEach((k) => AudioManager.stop(k));
        const idx = Math.floor(Math.random() * 4) + 1; // 1-4
        const key = `correct_answer_${idx}`;
        AudioManager.playWhenReady?.(key);
        return key;
    }

    private findBox(x: number, y: number) {
        // Tìm box theo vị trí chuột trên asset số
        return this.boxes.find((b) => b.image && b.image.getBounds().contains(x, y));
    }

    private getCurrentCountLevel() {
        return this.countLevels[this.currentCountLevelIndex];
    }

    private updateLevelLabel() {
        if (!this.levelLabel || this.levelLabel.scene == null) return;
        const level = this.getCurrentCountLevel();
        this.levelLabel.setText(`Màn ${this.currentCountLevelIndex + 1} • ${level.label}`);
        this.levelLabel.setPosition(this.boardRect.centerX, this.boardRect.y + 18);
    }

    private applyCurrentLevelToObjects() {
        const level = this.getCurrentCountLevel();

        this.bags.forEach((bag, index) => {
            bag.setData('count', level.counts[index]);

            // Luôn cập nhật texture đúng cho từng level
            const tex = level.objectTextureKeys?.[index];
            if (tex && 'setTexture' in bag && this.textures.exists(tex)) {
                (bag as Phaser.GameObjects.Image).setTexture(tex);
            }
        });

        this.updateLevelLabel();
    }

    private resetNumberBoxes() {
        this.boxes.forEach((box) => {
            // Nếu đã có asset số thì không vẽ/tác động khung/text
            if (box.image) {
                if (box.rect) box.rect.setVisible(false);
                if (box.text) box.text.setVisible(false);
            } else {
                box.text.setColor('#1f5cff');
                box.painted = false;
                box.setNumberTint?.(0xffffff);
            }
        });
    }

    private resetForNextCountLevel() {
        this.locked.clear();
        this.fixedConnections = [];
        this.fixedLines?.clear();
        this.lines.clear();
        this.dragging = undefined;

        this.clearCountingLabels();
        this.resetNumberBoxes();

        // mở lại kéo thả
        this.bags.forEach((bag) => bag.setInteractive({ useHandCursor: true }));

        // đổi texture + count theo level
        this.applyCurrentLevelToObjects();

        // Phát lại voice hướng dẫn khi chuyển màn
        this.playGuideVoiceForCurrentLevel();

        // dùng asset cho thang số
        this.replaceNumberBoxesWithAssets();

        this.redrawFixedLines();
        // Reset trạng thái bàn tay cho màn mới
        this.guideHandShown = false;
        this.hideGuideHand();
        // Set timeout 10 giây cho màn mới
        this.guideHandTimeout = this.time.delayedCall(10000, () => {
            this.showGuideHand(false);
        });
    }

    private advanceCountLevel() {
        if (this.currentCountLevelIndex + 1 < this.countLevels.length) {
            this.currentCountLevelIndex++;
            this.resetForNextCountLevel();
            return;
        }

        // xong 2 level -> qua flow tiếp
        this.game.events.emit(FLOW_GO_COLOR);
    }

    // Thay thế thang số bằng asset hình ảnh
    private replaceNumberBoxesWithAssets() {
        if (!this.boxes.length) return;

        this.boxes.forEach((box) => {
            // Hide the rect and text, only show asset image
            if (box.rect) box.rect.setVisible(false);
            if (box.text) box.text.setVisible(false);

            // Sử dụng asset số từ thư mục public/assets/number
            // Giả sử tên asset là 'number_1', 'number_2', ...
            const numberAssetKey = `number_${box.n}`;
            if (!box.image) {
                box.image = this.add
                    .image(box.cx, box.y, numberAssetKey)
                    .setOrigin(0.5);
                // Ẩn khung rect ngay khi tạo image
                if (box.rect) box.rect.setVisible(false);
            } else {
                box.image.setTexture(numberAssetKey);
                box.image.setVisible(true);
                box.image.setPosition(box.cx, box.y);
                if (box.rect) box.rect.setVisible(false);
            }
        });
    }

    private layoutBoard() {
        if (!this.boardFallbackGfx) return;

        const w = this.scale.width;
        const h = this.scale.height;
        const maxW = Math.min(1400, w * 0.85); // board nhỏ lại
        const maxH = Math.min(840, h * 0.85); // board nhỏ lại

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
        this.numberRowY = innerY + innerH * 0.12;

        const objSpacing = Math.min(innerW * 0.7, 675);
        // Đặt bóng/bi xuống gần đáy board hơn
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

        // this.repositionNumberBoxes(); // Tạm thời disable để test
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

        const { leftX, rightX, y } = this.objectPositions;
        const xs = [leftX, rightX];

        this.bags.forEach((bag, index) => {
            const targetX = xs[index] ?? xs[0];
            bag.setPosition(targetX, y);
        });
    }

    private redrawFixedLines() {
        const gfx = this.fixedLines;
        if (!gfx) return;

        gfx.clear();
        if (!this.fixedConnections.length) return;

        // Group connections by target box
        const connectionsByBox = new Map<NumBox, Array<{ bag: SpriteOrArc; box: NumBox; dropX: number }>>();
        this.fixedConnections.forEach((conn) => {
            if (!connectionsByBox.has(conn.box)) {
                connectionsByBox.set(conn.box, []);
            }
            connectionsByBox.get(conn.box)?.push(conn);
        });

        connectionsByBox.forEach((conns) => {
            const numConnectionsInBox = conns.length;
            const box = conns[0].box; // Tất cả các kết nối trong nhóm này đều đến cùng một box
            let bounds;
            if (box.rect) {
                bounds = box.rect.getBounds();
            } else if (box.image) {
                bounds = box.image.getBounds();
            } else {
                return;
            }

            if (numConnectionsInBox <= 1) {
                // If only one connection, draw as usual
                const { bag, dropX } = conns[0];
                // Clamp dropX to the box's horizontal bounds and set Y to bottom edge
                const endX = Phaser.Math.Clamp(dropX, bounds.left, bounds.right);
                const endY = bounds.bottom;
                const start = this.getBagLineStart(bag, endX, endY);
                gfx.lineStyle(
                    this.connectionLineStyle.width,
                    this.connectionLineStyle.color,
                    this.connectionLineStyle.alpha
                );
                gfx.beginPath();
                gfx.moveTo(start.x, start.y);
                gfx.lineTo(endX, endY);
                gfx.strokePath();
            } else {
                // If multiple connections, use their individual dropX values
                conns.forEach(({ bag, dropX }) => {
                    // Clamp dropX to the box's horizontal bounds and set Y to bottom edge
                    const endX = Phaser.Math.Clamp(dropX, bounds.left, bounds.right);
                    const endY = bounds.bottom;
                    const start = this.getBagLineStart(bag, endX, endY);

                    gfx.lineStyle(
                        this.connectionLineStyle.width,
                        this.connectionLineStyle.color,
                        this.connectionLineStyle.alpha
                    );
                    gfx.beginPath();
                    gfx.moveTo(start.x, start.y);
                    gfx.lineTo(endX, endY);
                    gfx.strokePath();
                });
            }
        });
    }

    private createBoardImageIfNeeded() {
        if (this.boardImage) return;
        if (!this.textures.exists(this.boardAssetKey)) return;

        this.boardImage = this.add
            .image(0, 0, this.boardAssetKey)
            .setDepth(0)
            .setOrigin(0.5);
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
            this.bannerBg = this.add
                .image(0, 0, this.bannerBgKey)
                .setOrigin(0.5, 0.5)
                .setDepth(35);
        }

        if (!this.bannerTextImage && this.textures.exists(this.bannerTextKey)) {
            this.bannerTextImage = this.add
                .image(0, 0, this.bannerTextKey)
                .setOrigin(0.5, 0.5)
                .setDepth(36);
        }

        this.positionBannerAssets();
    }

    private positionBannerAssets() {
        if (!this.bannerBg) return;

        const maxWidth = Math.min(this.scale.width * 1.0, 1300);
        const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;

        const targetWidth = Math.min(maxWidth, this.boardRect.width * 1.0);
        const targetHeight = bgRatio ? targetWidth / bgRatio : this.bannerBg.displayHeight;

        const x = this.boardRect.centerX;
        const y = Math.max(targetHeight / 2 + 8, this.boardRect.y - targetHeight / 2 - 8);

        this.bannerBg.setDisplaySize(targetWidth, targetHeight);
        this.bannerBg.setPosition(x, y);

        if (this.bannerTextImage) {
            // Tăng kích thước asset banner text lên 1.1 lần so với mặc định
            const textRatio = this.getTextureRatio(this.bannerTextKey) ?? 1;
            const textWidth = targetWidth * 0.85; // tăng từ 0.7 lên 0.85
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


    private readonly audioDurations: { [key: string]: number } = {
        '1': 500, // Placeholder duration in milliseconds
        '11': 600, // Placeholder duration in milliseconds
        '12': 550, // Placeholder duration in milliseconds
        '21': 650, // Placeholder duration in milliseconds
        'correct_answer_1': 800,
        'correct_answer_2': 800,
        'correct_answer_3': 800,
        'correct_answer_4': 800,
    };

    private showCountingSequence(onDone?: () => void, bagToCount?: SpriteOrArc) {
        if (this.isCountingSequence) return;
        this.isCountingSequence = true;
        this.clearCountingLabels();

        const bagsToCount = bagToCount ? [bagToCount] : [...this.bags].sort((a, b) => a.x - b.x);

        const runStep = (index: number) => {
            if (index >= bagsToCount.length) {
                this.time.delayedCall(this.lastAudioDuration + 120, () => {
                    this.isCountingSequence = false;
                    onDone?.();
                });
                return;
            }

            const bag = bagsToCount[index];
            const bounds = bag.getBounds();
            const labelX = bounds.centerX;
            const labelY = bounds.bottom + 12;

            const bagCount = bag.getData('count') as number;
            const assetKey = `counting_number_${bagCount}`;
            let label: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
            if (this.textures.exists(assetKey)) {
                label = this.add.image(labelX, labelY, assetKey)
                    .setOrigin(0.5, 0)
                    .setScale(1.2)
                    .setDepth(12);
            } else {
                label = this.add.text(labelX, labelY, String(bagCount), {
                    fontFamily: 'Baloo, Arial',
                    fontSize: '62px',
                    color: '#0b1b2a',
                })
                    .setOrigin(0.5, 0)
                    .setScale(0.45)
                    .setDepth(12);
            }
            this.countingLabels.push(label as Phaser.GameObjects.Text | Phaser.GameObjects.Image);

            let soundKey: string;
            if (this.currentCountLevelIndex === 0) { // Bóng (Ball) screen
                const leftBag = this.bags.sort((a, b) => a.x - b.x)[0];
                soundKey = (bag === leftBag) ? '1' : '11';
            } else { // Bi (Marble) screen
                soundKey = bagCount === 1 ? '12' : '21';
            }
            AudioManager.playWhenReady?.(soundKey);
            const currentStepDelay = this.audioDurations[soundKey] || 480; // Default to 480ms if duration not found
            this.lastAudioDuration = currentStepDelay; // Store the duration

            const originalY = bag.y;
            const animationDuration = Math.max(160, currentStepDelay - 50); // Ensure animation lasts close to audio duration, with a minimum

            this.tweens.add({
                targets: bag,
                y: originalY - 10,
                duration: animationDuration,
                yoyo: true,
                ease: 'Quad.Out',
                onComplete: () => bag.setY(originalY),
            });

            this.tweens.add({
                targets: label,
                scaleX: 1.1,
                scaleY: 1.1,
                duration: animationDuration,
                yoyo: true,
                ease: 'Back.Out',
            });

            this.time.delayedCall(currentStepDelay + 120, () => runStep(index + 1));
        };

        runStep(0);
    }

    private clearCountingLabels() {
        this.countingLabels.forEach((label) => label.destroy());
        this.countingLabels = [];
    }

    // Lấy điểm xuất phát của line nằm sâu hơn về phía quả/bi
    private getBagLineStart(target: SpriteOrArc, towardsX: number, towardsY: number) {
        const dx = towardsX - target.x;
        const dy = towardsY - target.y;
        const len = Math.max(1e-6, Math.hypot(dx, dy));
        // Lùi lại vào trong quả một đoạn nhỏ để line “ăn” vào quả
        const offset =
            target instanceof Phaser.GameObjects.Image
                ? Math.min(20, Math.max(8, Math.min(target.displayWidth, target.displayHeight) * 0.12))
                : Math.min(18, Math.max(6, target.radius * 0.18));

        let adjustedOffset = offset;

        // Check if the connection is diagonal (both dx and dy are significant)
        const angleThreshold = 0.5; // Adjust this value to control what's considered "diagonal"
        if (Math.abs(dx) > len * angleThreshold && Math.abs(dy) > len * angleThreshold) {
            adjustedOffset += 15; // Increased offset for diagonal connections
        }

        return { x: target.x - (dx / len) * adjustedOffset, y: target.y - (dy / len) * adjustedOffset };
    }

    private shakeObject(target: SpriteOrArc, intensity = 12, duration = 220) {
        const originalX = target.x;
        this.tweens.killTweensOf(target);
        this.tweens.add({
            targets: target,
            x: originalX + intensity,
            duration: Math.max(40, Math.floor(duration / 6)),
            yoyo: true,
            repeat: 5,
            ease: 'Sine.inOut',
            onComplete: () => {
                target.x = originalX;
            },
        });
    }

    // Hiển thị bàn tay hướng dẫn nối từ object đến số đúng
    private showGuideHand(first: boolean) {
        // Xóa bàn tay cũ nếu có
        this.hideGuideHand();
        // Chỉ hiện lần đầu hoặc khi timeout
        if (first && this.guideHandShown) return;
        // Chỉ hiện khi chưa ghép đúng hết
        if (this.locked.size === this.bags.length) return;
        if (!this.bags.length || !this.boxes.length) return;
        // Chọn object chưa nối
        const bag = this.bags.find(b => !this.locked.has(b));
        if (!bag) return;
        const count = bag.getData('count') as number;
        // Tìm box đúng
        const box = this.boxes.find(b => b.n === count);
        if (!box || !box.image) return;
        // Tạo sprite bàn tay (asset là 'guide_hand')
        if (!this.textures.exists('guide_hand')) return;
        this.guideHand = this.add.image(bag.x, bag.y, 'guide_hand')
            .setOrigin(0.2, 0.1)
            .setScale(0.5)
            .setDepth(100)
            .setAlpha(0.92);
        // Tween di chuyển bàn tay từ object đến số đúng
        this.guideHandTween = this.tweens.add({
            targets: this.guideHand,
            x: box.image.x,
            y: box.image.getBounds().bottom,
            duration: 900,
            ease: 'Cubic.InOut',
            yoyo: true,
            repeat: -1,
        });
        if (first) this.guideHandShown = true;

        // Set a timer to re-show the hand if the user is idle.
        this.guideHandTimeout = this.time.delayedCall(10000, () => this.showGuideHand(false));
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
