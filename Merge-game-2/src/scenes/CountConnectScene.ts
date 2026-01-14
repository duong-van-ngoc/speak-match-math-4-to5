import Phaser from 'phaser';
    import type { GameData } from '../data/gameData';
    import type { NumBox } from '../ui/helpers';
    import {
        BOARD_ASSET_KEYS,
        // COUNT_CONNECT_IMAGE_ASSETS,
        // NUMBER_ASSETS,
        loadAssetGroups,
    } from '../assets';
    import AudioManager from '../AudioManager';


// Dữ liệu cụm khoanh truyền từ màn trước
export type MarkedCluster = {
    color: 'red' | 'blue';
    n: number; // số lượng con vật trong cụm
    x: number; // tâm elip
    y: number;
    rx: number; // bán trục elip
    ry: number;
    imageData?: string; // base64 hoặc textureKey tạm (nếu có)
};

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

    private fixedConnections: Array<{ bag: SpriteOrArc; box: NumBox }> = [];
    private dragging?: DragState;

    private numberRowY?: number;

    // Đã bỏ logic countingLabels, isCountingSequence

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

    constructor() {
        super('CountConnectScene');
    }

    // Nhận thêm clusters từ màn khoanh
    private clusters: MarkedCluster[] = [];
    init(data: { gameData: GameData; clusters?: MarkedCluster[] }) {
        this.dataGame = data.gameData;
        if (data.clusters) {
            this.clusters = data.clusters;
        }
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
        // Đã bỏ clearCountingLabels
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
        const scale = 0.45; // scale nhỏ lại như hình mẫu
        const gap = 0; // khoảng cách giữa các số như hình mẫu
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


        // Nếu có dữ liệu clusters từ màn khoanh thì vẽ các elip đúng vị trí/màu, gom ellipse, asset, hit, text vào container để không bị lệch khi layout lại
        this.bags = [];
        if (this.clusters.length) {
            this.clusters.forEach((cluster, idx) => {
                // Tạo container tại đúng vị trí cluster
                const group = this.add.container(cluster.x, cluster.y).setDepth(10);
                // Vẽ elip màu đúng vị trí (tọa độ local trong container)
                const ellipseGfx = this.add.graphics();
                const stroke = cluster.color === 'red' ? 0xff3b30 : 0x2f6cff;
                ellipseGfx.lineStyle(6, stroke, 1);
                ellipseGfx.strokeEllipse(0, 0, cluster.rx * 2, cluster.ry * 2);

                // Hiển thị asset (ảnh bitmap base64) nếu có imageData
                let assetImg: Phaser.GameObjects.Image | undefined = undefined;
                let tempTextureKey: string | undefined = undefined;
                if (cluster.imageData) {
                    tempTextureKey = `cluster_img_${idx}_${Date.now()}`;
                    if (!this.textures.exists(tempTextureKey)) {
                        this.textures.addBase64(tempTextureKey, cluster.imageData);
                    }
                    assetImg = this.add.image(0, 0, tempTextureKey).setOrigin(0.5);
                    // Scale asset cho vừa elip
                    assetImg.once('texturekeychange', () => {
                        const scaleX = (cluster.rx * 1.5) / (assetImg!.width || 1);
                        const scaleY = (cluster.ry * 1.5) / (assetImg!.height || 1);
                        assetImg!.setScale(Math.min(scaleX, scaleY));
                    });
                }

                // Tạo object ảo để kéo thả (dùng hình tròn trong elip, local 0,0)
                const hit = this.add.circle(0, 0, Math.min(cluster.rx, cluster.ry) * 0.7, 0xffffff, 0.01)
                    .setInteractive({ useHandCursor: true }) as Phaser.GameObjects.Arc;
                // Gắn số lên elip (local 0,0)
                const label = this.add.text(0, 0, String(cluster.n), {
                    fontFamily: 'Baloo, Arial',
                    fontSize: '38px',
                    color: '#0b1b2a',
                }).setOrigin(0.5);
                hit.setData('count', cluster.n);
                // Gom vào container: ellipse, asset, hit, label
                const children = assetImg ? [ellipseGfx, assetImg, hit, label] : [ellipseGfx, hit, label];
                group.add(children);
                // Để kéo thả đúng, push hit vào bags
                this.bags.push(hit);
            });
        }

        // layout lại lần nữa để reposition chuẩn (nhất là khi resize / board ratio)

        this.layoutBoard();

        // Phát voice hướng dẫn cho màn hiện tại

        this.playGuideVoiceForCurrentLevel();

        // Hiển thị bàn tay hướng dẫn nối khi vào màn chơi
        this.showGuideHand(true);
        this.input.once('pointerdown', () => {
            this.hideGuideHand();
            // Nếu bé chưa kéo sau 3s thì hiện lại bàn tay
            this.guideHandTimeout = this.time.delayedCall(3000, () => {
                if (!this.dragging) {
                    this.showGuideHand(false);
                }
            });
        });
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

    // Đã bỏ createObject (không dùng)

    private onDown(pointer: Phaser.Input.Pointer) {
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
        this.lines.moveTo(this.dragging.startX, this.dragging.startY);
        this.lines.lineTo(pointer.x, pointer.y);
        this.lines.strokePath();
    }

    private onUp(pointer: Phaser.Input.Pointer) {
        if (!this.dragging) return;

        const bag = this.dragging.bag;
        const count = bag.getData('count') as number;

        const hit = this.findBox(pointer.x, pointer.y);
        this.lines.clear();

        if (!hit || hit.n !== count) {
            this.cameras.main.shake(120, 0.01);
            // Ngắt tất cả voice hướng dẫn trước khi phát âm thanh sai
            ['voice_guide_connect'].forEach((k) => AudioManager.stop(k));
            AudioManager.play('sfx_wrong');
            this.dragging = undefined;
            // Không hiện lại bàn tay khi sai
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
            this.fixedConnections.push({ bag, box: hit });
            this.redrawFixedLines();
        }

        // Phát âm thanh đúng mỗi lần ghép đúng
        AudioManager.play('sfx_correct');
            // Phát âm thanh đúng theo thứ tự (correct_answer_1, 2, 3, 4)
            this.playCorrectAnswerSound();


        this.dragging = undefined;
        if (this.locked.size === this.bags.length) {
            this.time.delayedCall(450, () => {
                this.advanceCountLevel();
            });
        } // Không hiện lại bàn tay khi chưa xong
    }

    // Phát âm thanh đúng tiếng Việt, random 1 trong 4 file
    private playCorrectAnswerSound() {
        // Ngắt tất cả voice hướng dẫn trước khi phát âm thanh đúng
        ['voice_guide_connect'].forEach((k) => AudioManager.stop(k));
        const idx = Math.floor(Math.random() * 4) + 1; // 1-4
        const key = `correct_answer_${idx}`;
        AudioManager.playWhenReady?.(key);
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
        // Nếu dùng clusters thì không có label
        if (!this.countLevels.length) {
            this.levelLabel.setText('');
            this.levelLabel.setVisible(false);
            return;
        }
        const level = this.getCurrentCountLevel();
        this.levelLabel.setText(`Màn ${this.currentCountLevelIndex + 1} • ${level.label}`);
        this.levelLabel.setPosition(this.boardRect.centerX, this.boardRect.y + 18);
        this.levelLabel.setVisible(true);
    }

    // Không cần applyCurrentLevelToObjects nữa vì đã dùng dữ liệu khoanh

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

        // Đã bỏ clearCountingLabels
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
        // Hiển thị lại bàn tay hướng dẫn nối lần đầu tiên khi qua màn mới
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

        // xong 2 level -> qua flow tiếp (kết thúc)
        this.game.events.emit('FLOW_GO_END', {
            scene: this.scene.key,
            isVictory: true,
            marblesTotal: 0,
            ballsTotal: 0
        }); // Bỏ ép kiểu FlowEndPayload vì không cần thiết
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
        const maxW = Math.min(1100, w * 0.92); // board nhỏ lại
        const maxH = Math.min(540, h * 0.8); // board nhỏ lại

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
        this.numberRowY = innerY + innerH * 0.15;

        // const objSpacing = Math.min(innerW * 0.5, 300); // Đã bỏ vì không dùng
        // Đặt object ở giữa, không còn 2 bên
        const objY = innerY + innerH * 0.72;
        this.objectPositions = {
            leftX: this.boardInnerRect.centerX,
            rightX: this.boardInnerRect.centerX,
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

    private repositionNumberBoxes() {
        if (!this.boxes.length) return;

        const boxW = 64;
        const padding = Math.min(36, this.boardInnerRect.width * 0.05);
        const availableWidth = this.boardInnerRect.width - padding * 2;
        const minGap = 8;

        const gap =
        this.boxes.length > 1
            ? Math.max(
                minGap,
                Math.min(28, (availableWidth - boxW * this.boxes.length) / (this.boxes.length - 1))
            )
            : minGap;

        const totalW = boxW * this.boxes.length + gap * (this.boxes.length - 1);
        const startX = this.boardInnerRect.centerX - totalW / 2 + boxW / 2;

        const y = this.numberRowY ?? this.boardInnerRect.y + this.boardInnerRect.height * 0.12;

        this.boxes.forEach((box, index) => {
            const cx = startX + index * (boxW + gap);
            box.cx = cx;
            box.y = y;
            if (box.image) {
                box.image.setPosition(cx, y);
                if (box.text) box.text.setVisible(false);
            } else {
                box.text.setPosition(cx, y);
            }
        });
    }

    private positionObjects() {
        if (!this.bags.length) return;

        // Nếu có clusters (tọa độ đã là world), giữ nguyên vị trí, không reposition
        if (this.clusters && this.clusters.length) return;

        if (!this.objectPositions) return;
        const centerX = this.objectPositions.leftX;
        const y = this.objectPositions.y;
        this.bags.forEach((bag) => {
            bag.setPosition(centerX, y);
        });
    }

    private redrawFixedLines() {
        const gfx = this.fixedLines;
        if (!gfx) return;

        gfx.clear();
        if (!this.fixedConnections.length) return;

        this.fixedConnections.forEach(({ bag, box }) => {
            // box.rect có thể undefined, dùng box.image nếu là asset số
            let bounds;
            if (box.rect) {
                bounds = box.rect.getBounds();
            } else if (box.image) {
                bounds = box.image.getBounds();
            } else {
                return; // không có gì để nối
            }
            const startX = bag.x;
            const startY = bag.y;
            const endX = bounds.centerX;
            const endY = bounds.centerY;

            gfx.lineStyle(
                this.connectionLineStyle.width,
                this.connectionLineStyle.color,
                this.connectionLineStyle.alpha
            );
            gfx.beginPath();
            gfx.moveTo(startX, startY);
            gfx.lineTo(endX, endY);
            gfx.strokePath();
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

        const maxWidth = Math.min(this.scale.width * 0.9, 720);
        const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;

        const targetWidth = Math.min(maxWidth, this.boardRect.width * 0.9);
        const targetHeight = bgRatio ? targetWidth / bgRatio : this.bannerBg.displayHeight;

        const x = this.boardRect.centerX;
        const y = Math.max(targetHeight / 2 + 8, this.boardRect.y - targetHeight / 2 - 8);

        this.bannerBg.setDisplaySize(targetWidth, targetHeight);
        this.bannerBg.setPosition(x, y);

        if (this.bannerTextImage) {
        // Tăng kích thước asset banner text lên 1.1 lần so với mặc định
        const textRatio = this.getTextureRatio(this.bannerTextKey) ?? 1;
        const textWidth = targetWidth * 0.8; // tăng từ 0.7 lên 0.77
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

    // Đã bỏ logic đếm (counting sequence)

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
            y: box.image.y,
            duration: 900,
            ease: 'Cubic.InOut',
            yoyo: true,
            repeat: -1,
        });
        if (first) this.guideHandShown 