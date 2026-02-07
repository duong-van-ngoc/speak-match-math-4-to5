import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import type { NumBox } from '../ui/helpers';
import { FLOW_GO_END } from '../flow/events';
// import { COLORS } from '../data/gameData';
import {
    BOARD_ASSET_KEYS,
    // NUMBER_ASSETS,
    loadAssetGroups,

} from '../assets';
import AudioManager from '../AudioManager';
// Các type cần thiết cho class
type SpriteOrArc = Phaser.GameObjects.Arc | Phaser.GameObjects.Image;
type DragState = {
    bag: SpriteOrArc;
    startX: number;
    startY: number;
    connectionIndex: number;
};
type CountLevel = {
    label: string;
    targetNumbers: number[]; // Số đúng cho từng lần nối
    objectTextureKeys?: (string | undefined)[];
    objectFill: number;
    objectStroke: number;
    bannerTextKey: string;
    voiceGuideKey: string;
};
export class CountConnectScene extends Phaser.Scene {
    // Lưu offset cho từng lần nối (không phải property động)
    // private connectionOffsets: { x: number; y: number }[] = []; -> UNUSED, removed
    // Vị trí xuất phát cho từng lần nối: [lần 1, lần 2]
    // Các điểm bắt đầu trên asset cho từng lần nối (tương đối so với tâm asset)
    private static connectOffsets = [
        { x: -160, y: -10 }, // trái trên - dịch lên trên
        { x: 220, y: 60 }     // giữa phải - dịch xuống dưới
    ];

    // Asset key cho bóng và bi
    static duckKeys = ['duck_elip'];
    static birdKeys = ['bird_elip'];

    // Phát voice hướng dẫn cho từng màn (level) CountConnect qua AudioManager
    private playGuideVoiceForCurrentLevel() {
        AudioManager.stopGuideVoices();
        const level = this.getCurrentCountLevel();
        if (level.voiceGuideKey) AudioManager.playWhenReady(level.voiceGuideKey);
    }
    private dataGame!: GameData;

    private boxes: NumBox[] = [];
    private bag?: SpriteOrArc; // chỉ còn 1 object
    private locked = false;

    private boardFallbackGfx?: Phaser.GameObjects.Graphics;
    private boardImage?: Phaser.GameObjects.Image;
    private boardRect = new Phaser.Geom.Rectangle();
    private boardInnerRect = new Phaser.Geom.Rectangle();

    private objectPosition?: { x: number; y: number };

    private readonly connectionLineStyle = { width: 6, color: 0x374151, alpha: 0.9 };
    private lines!: Phaser.GameObjects.Graphics;
    private fixedLines?: Phaser.GameObjects.Graphics;

    private fixedConnections: Array<{ bag: SpriteOrArc; box: NumBox; connectionIndex: number }> = [];
    private dragging?: DragState;

    private numberRowY?: number;

    // Đã bỏ logic đếm số

    private countLevels: CountLevel[] = [
        {
            label: 'Vịt',
            targetNumbers: [1, 3], // Trái nối 1, Phải nối 3 (bắt buộc theo thứ tự)
            objectTextureKeys: [CountConnectScene.duckKeys[0]],
            objectFill: 0xdff6ff,
            objectStroke: 0x7cc8ff,
            bannerTextKey: 'banner_title_5', // Đếm đến 3
            voiceGuideKey: 'voice_guide_25',
        },
        {
            label: 'Chim',
            targetNumbers: [2, 2],
            objectTextureKeys: [CountConnectScene.birdKeys[0]],
            objectFill: 0xffffff,
            objectStroke: 0x6a87ff,
            bannerTextKey: 'banner_title_6',
            voiceGuideKey: 'voice_guide_26',
        },
    ];
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

    constructor() {
        super('CountConnectScene');
    }

    init(data: { gameData: GameData }) {
        this.dataGame = data.gameData;
    }

    preload() {
        loadAssetGroups(this, 'shared', 'countConnect', 'numbers', 'countingNumbers', 'ui', 'colorScene');
    }

    create() {
        // Reset về level đầu tiên khi chơi lại
        this.currentCountLevelIndex = 0;
        this.locked = false;
        this.fixedConnections = [];
        // this.connectionOffsets = []; // Removed
        this.dragging = undefined;
        this.guideHandShown = false;
        this.hideGuideHand();

        this.boardImage?.destroy();
        this.boardImage = undefined;
        this.bannerBg?.destroy();
        this.bannerBg = undefined;
        this.bannerTextImage?.destroy();
        this.bannerTextImage = undefined;
        this.boardFallbackGfx?.destroy();

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
        const scale = 0.6; // scale nhỏ lại như hình mẫu
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

        this.lines = this.add.graphics().setDepth(20);
        this.fixedLines = this.add.graphics().setDepth(19);

        // Asset luôn đứng yên ở giữa dưới board
        const level = this.getCurrentCountLevel();
        const key = level.objectTextureKeys?.[0];
        // Đặt asset ở giữa dưới board
        const pos = { x: this.boardRect.centerX, y: this.boardRect.bottom - 80 };
        this.bag = this.createObject(pos.x, pos.y, 56, key, level.objectFill);
        // Gán số đúng lần đầu tiên
        this.bag.setData('count', level.targetNumbers[0]);

        // layout lại lần nữa để reposition chuẩn (nhất là khi resize / board ratio)
        this.layoutBoard();

        this.updateLevelLabel();

        // Phát voice hướng dẫn cho màn hiện tại
        this.playGuideVoiceForCurrentLevel();

        // Hiển thị bàn tay hướng dẫn nối khi vào màn chơi
        this.showGuideHand(true);
        // Đăng ký sự kiện pointerdown, pointermove, pointerup cho drag
        this.input.on('pointerdown', this.onDown, this);
        this.input.on('pointermove', this.onMove, this);
        this.input.on('pointerup', this.onUp, this);
        this.input.once('pointerdown', () => {
            this.hideGuideHand();
            // Nếu bé chưa kéo sau 3s thì hiện lại bàn tay
            this.guideHandTimeout = this.time.delayedCall(3000, () => {
                if (!this.dragging) {
                    this.showGuideHand(false);
                }
            });
        });

        // Đã xóa hoàn toàn logic tạo asset và vẽ sẵn các đường nối đặc biệt cho màn Chim/Vịt, bé sẽ tự nối

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.layoutBoard, this);
            this.hideGuideHand();
            this.input.off('pointerdown', this.onDown, this);
            this.input.off('pointermove', this.onMove, this);
            this.input.off('pointerup', this.onUp, this);

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
        textureKey?: string,
        fillColor?: number
    ): SpriteOrArc {
        if (textureKey && this.textures.exists(textureKey)) {
            // Hiển thị asset bóng/bi cùng tỉ lệ với asset số (scale 0.45)
            const obj = this.add
                .image(x, y, textureKey)
                .setOrigin(0.5)
                .setScale(0.65, 0.65)
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
        if (!this.bag || this.locked) return;

        // Check xem user click gần điểm neo nào (Trái hoặc Phải)
        const offsets = CountConnectScene.connectOffsets;
        let closestIdx = -1;
        let minDist = 250; // Tăng vùng chạm điểm đầu thành 250px (rất to)

        // Các index đã được nối rồi thì không cho nối nữa
        const usedIndices = this.fixedConnections.map(c => c.connectionIndex);

        offsets.forEach((off, idx) => {
            if (usedIndices.includes(idx)) return;
            const px = this.bag!.x + off.x;
            const py = this.bag!.y + off.y;
            const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, px, py);
            if (d < minDist) {
                minDist = d;
                closestIdx = idx;
            }
        });

        // Nếu tìm thấy điểm neo hợp lệ
        if (closestIdx !== -1) {
            const startX = this.bag.x + offsets[closestIdx].x;
            const startY = this.bag.y + offsets[closestIdx].y;
            this.dragging = { bag: this.bag, startX, startY, connectionIndex: closestIdx };
            this.hideGuideHand();
        }
    }

    private onMove(pointer: Phaser.Input.Pointer) {
        if (!this.dragging) return;

        this.lines.clear();
        this.lines.lineStyle(
            this.connectionLineStyle.width,
            this.connectionLineStyle.color,
            this.connectionLineStyle.alpha
        );
        // Vẽ dây từ điểm bắt đầu đã xác định
        this.lines.beginPath();
        this.lines.moveTo(this.dragging.startX, this.dragging.startY);
        this.lines.lineTo(pointer.x, pointer.y);
        this.lines.strokePath();
    }

    private onUp(pointer: Phaser.Input.Pointer) {
        if (!this.dragging) return;

        const { bag, connectionIndex } = this.dragging;
        const level = this.getCurrentCountLevel();
        const hit = this.findBox(pointer.x, pointer.y);
        this.lines.clear();

        // Kiểm tra xem số hit có đúng là số yêu cầu cho điểm neo này không
        const requiredNumber = level.targetNumbers[connectionIndex];
        const isValidTarget = hit && hit.n === requiredNumber;

        // Cho phép nối nếu đúng số yêu cầu
        if (!hit || !isValidTarget) {
            this.flashWrongEffect();
            AudioManager.stopGuideVoices();
            AudioManager.play('sfx_wrong');
            this.dragging = undefined;
            this.redrawFixedLines();
            return;
        }

        // Tạo fixed connection mới
        this.fixedConnections.push({ bag, box: hit, connectionIndex });

        // Đánh dấu đã nối đúng, disable tạm thời asset
        bag.disableInteractive();
        // Không disable hoàn toàn vì còn cần nối điểm khác
        // Chỉ cần đảm bảo onDown check usedIndices là đủ
        bag.setInteractive();

        this.redrawFixedLines();
        AudioManager.play('sfx_correct');
        this.playCorrectAnswerSound();
        this.dragging = undefined;

        // Kiểm tra đã đủ số lần nối đúng chưa
        if (this.fixedConnections.length >= level.targetNumbers.length) {
            this.locked = true;
            this.time.delayedCall(450, () => {
                this.advanceCountLevel();
            });
        } else {
            // Nếu chưa đủ, enable lại asset để nối tiếp
            if (this.bag) this.bag.setInteractive({ useHandCursor: true });
            this.updateLevelLabel();
        }
    }

    // Phát âm thanh đúng tiếng Việt, random 1 trong 4 file
    private playCorrectAnswerSound() {
        AudioManager.stopGuideVoices();
        const idx = Math.floor(Math.random() * 4) + 1; // 1-4
        const key = `correct_answer_${idx}`;
        AudioManager.playWhenReady?.(key);
    }

    private findBox(x: number, y: number) {
        // Tìm box gần nhất trong phạm vi cho phép (thay vì bắt buộc nằm trong bounds)
        let closestBox: NumBox | undefined;
        let minD = 100; // Bán kính nhận kẹo: 100px

        this.boxes.forEach(b => {
            if (b.image) {
                const d = Phaser.Math.Distance.Between(x, y, b.image.x, b.image.y);
                if (d < minD) {
                    minD = d;
                    closestBox = b;
                }
            }
        });
        return closestBox;
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

    private applyCurrentLevelToObject() {
        const level = this.getCurrentCountLevel();
        if (!this.bag) return;
        // Luôn gán số đúng cho lần đầu tiên của level
        this.bag.setData('count', level.targetNumbers[0]);
        const tex = level.objectTextureKeys?.[0];
        if (tex && 'setTexture' in this.bag && this.textures.exists(tex)) {
            (this.bag as Phaser.GameObjects.Image).setTexture(tex);
        }
        this.updateLevelLabel();
        this.ensureBannerAssets();
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
        this.locked = false;
        this.fixedConnections = [];
        this.fixedLines?.clear();
        this.lines.clear();
        this.dragging = undefined;

        // Đã bỏ logic clearCountingLabels
        this.resetNumberBoxes();

        if (this.bag) this.bag.setInteractive({ useHandCursor: true });

        this.applyCurrentLevelToObject();
        this.playGuideVoiceForCurrentLevel();
        this.replaceNumberBoxesWithAssets();
        this.redrawFixedLines();
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

        // xong 2 level -> qua flow tiếp
        this.game.events.emit(FLOW_GO_END);
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
        // Đẩy hàng số lên trên (giảm hệ số từ 0.15 xuống 0.05)
        this.numberRowY = innerY + innerH * 0.05;

        // Đặt object xuống gần đáy board hơn
        const objY = innerY + innerH * 0.72;
        this.objectPosition = {
            x: this.boardInnerRect.centerX,
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
        this.positionObject();
        this.ensureBannerAssets();
        this.updateLevelLabel();
        this.redrawFixedLines();
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

        const midX = this.boardInnerRect.centerX;
        const maxNumber = this.dataGame.maxNumber;
        const scale = 0.6;
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
            if (box.image) {
                box.image.setPosition(cx, y);
                // Ẩn text cũ nếu có asset
                if (box.text) box.text.setVisible(false);
            } else {
                box.text.setPosition(cx, y);
            }
            cx += widths[i] / 2 + gap;
        });
    }

    private positionObject() {
        if (!this.bag || !this.objectPosition) return;
        this.bag.setPosition(this.objectPosition.x, this.objectPosition.y);
    }

    private redrawFixedLines() {
        const gfx = this.fixedLines;
        if (!gfx) return;
        gfx.clear();
        if (!this.fixedConnections.length) return;
        gfx.lineStyle(
            this.connectionLineStyle.width,
            this.connectionLineStyle.color,
            this.connectionLineStyle.alpha
        );
        this.fixedConnections.forEach(({ bag, box, connectionIndex }) => {
            let bounds;
            if (box.rect) {
                bounds = box.rect.getBounds();
            } else if (box.image) {
                bounds = box.image.getBounds();
            } else {
                return;
            }

            let startX = bag.x;
            let startY = bag.y;

            // Ưu tiên dùng connectionIndex nếu có (logic mới)
            if (typeof connectionIndex === 'number' && CountConnectScene.connectOffsets[connectionIndex]) {
                startX += CountConnectScene.connectOffsets[connectionIndex].x;
                startY += CountConnectScene.connectOffsets[connectionIndex].y;
            }
            // Fallback logic cũ
            else if (CountConnectScene.connectOffsets[this.fixedConnections.indexOf({ bag, box, connectionIndex })]) {
                // Logic cũ dựa trên index của mảng fixedConnections là không chính xác với logic mới
                // Nhưng để an toàn type check, ta cứ để fallback
                const idx = this.fixedConnections.indexOf({ bag, box, connectionIndex });
                if (CountConnectScene.connectOffsets[idx]) {
                    startX += CountConnectScene.connectOffsets[idx].x;
                    startY += CountConnectScene.connectOffsets[idx].y;
                }
            }

            const endX = bounds.centerX;
            const endY = bounds.bottom - 3;
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
        if (!this.textures.exists(this.bannerBgKey)) return;

        if (!this.bannerBg && this.textures.exists(this.bannerBgKey)) {
            this.bannerBg = this.add
                .image(0, 0, this.bannerBgKey)
                .setOrigin(0.5, 0.5)
                .setDepth(35);
        }

        // Luôn cập nhật lại bannerTextImage khi chuyển màn
        const level = this.getCurrentCountLevel();
        const key = level.bannerTextKey;
        if (this.bannerTextImage) {
            this.bannerTextImage.destroy();
            this.bannerTextImage = undefined;
        }
        if (key && this.textures.exists(key)) {
            this.bannerTextImage = this.add
                .image(0, 0, key)
                .setOrigin(0.5, 0.5)
                .setDepth(36);
        }

        this.positionBannerAssets();
    }

    private positionBannerAssets() {
        if (!this.bannerBg) return;

        const maxWidth = Math.min(this.scale.width * 1.0, 1600);
        const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;

        const targetWidth = Math.min(maxWidth, this.boardRect.width * 1.0);
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
            // Màn chim dùng textWidth lớn hơn
            const textWidthRatio = level.label === 'Chim' ? 0.87 : 0.78;
            const textWidth = targetWidth * textWidthRatio;
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

    // Đã bỏ logic đếm số (showCountingSequence, clearCountingLabels)

    // Hiển thị bàn tay hướng dẫn nối từ object đến số đúng
    private showGuideHand(first: boolean) {
        this.hideGuideHand();
        if (first && this.guideHandShown) return;
        if (this.locked) return;
        if (!this.bag || !this.boxes.length) return;

        const level = this.getCurrentCountLevel();
        const currentIndex = this.fixedConnections.length;

        // Nếu đã nối đủ thì không hiện hand nữa
        if (currentIndex >= level.targetNumbers.length) return;

        const targetNum = level.targetNumbers[currentIndex];
        const offset = CountConnectScene.connectOffsets[currentIndex] || { x: 0, y: 0 };

        const box = this.boxes.find(b => b.n === targetNum);
        if (!box || !box.image) return;

        if (!this.textures.exists('guide_hand')) return;

        const startX = this.bag.x + offset.x;
        const startY = this.bag.y + offset.y;

        this.guideHand = this.add.image(startX, startY, 'guide_hand')
            .setOrigin(0.2, 0.1)
            .setScale(0.5)
            .setDepth(100)
            .setAlpha(0.92);

        this.guideHandTween = this.tweens.add({
            targets: this.guideHand,
            x: box.image.x,
            y: box.image.y,
            duration: 900,
            ease: 'Cubic.InOut',
            yoyo: true,
            repeat: -1,
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

    // Animation lắc asset khi sai - reset về vị trí gốc sau khi xong
    private flashWrongEffect() {
        const bag = this.bag;
        if (!bag) return;

        const originalX = bag.x;
        const intensity = 8;

        this.tweens.killTweensOf(bag);
        this.tweens.add({
            targets: bag,
            x: originalX + intensity,
            duration: 40,
            yoyo: true,
            repeat: 5,
            ease: 'Sine.inOut',
            onComplete: () => {
                bag.x = originalX; // Đảm bảo reset về vị trí gốc
            }
        });
    }
}
