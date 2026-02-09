
import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { COLORS } from '../data/gameData';
import { FLOW_GO_CIRCLE_MARK } from '../flow/events';
import { BOARD_ASSET_KEYS, OBJECT_ASSET_KEYS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';
import type { NumBox } from '../ui/helpers';

type ColorLevel = {
    label: string;
    total: number;
    targetColor: number;
    objectTextureKeys: (string | undefined)[];
    counts: [number, number];
    bannerTextKey: string;
    voiceGuideKey: string;
    objectScale?: number;
    objectYOffset?: number;
};

export class ColorSceneBoat extends Phaser.Scene {
    private dataGame!: GameData;
    private boxes: NumBox[] = [];
    private selected?: number;

    private boardFallbackGfx?: Phaser.GameObjects.Graphics;
    private boardImage?: Phaser.GameObjects.Image;
    private boardRect = new Phaser.Geom.Rectangle();
    private boardInnerRect = new Phaser.Geom.Rectangle();
    private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;

    private paletteDots: Array<Phaser.GameObjects.Arc | Phaser.GameObjects.Image | Phaser.GameObjects.Container> = [];
    private paletteCenter?: { x: number; y: number };
    private paletteSelectedIndex = 0;
    private paletteDefs: Array<{ c: number; label: string; spriteKey?: string }> = [
        { c: COLORS.red, label: 'ĐỎ' },
        { c: COLORS.yellow, label: 'VÀNG' },
        { c: COLORS.blue, label: 'XANH' },
    ];

    private objects: Phaser.GameObjects.Image[] = [];
    private objectPositions?: { leftX: number; rightX: number; y: number };

    private numberRowY?: number;
    private colorLevelLabel?: Phaser.GameObjects.Text;

    private colorLevels: ColorLevel[] = [];
    private currentColorLevelIndex = 0;

    private bannerBg?: Phaser.GameObjects.Image;
    private bannerTextImage?: Phaser.GameObjects.Image;
    private readonly bannerBgKey = BOARD_ASSET_KEYS.bannerBg;

    private paletteGuideHand?: Phaser.GameObjects.Image;
    private paletteGuideHandTween?: Phaser.Tweens.Tween;
    private paletteGuideHandTimeout?: Phaser.Time.TimerEvent;
    private paletteGuideHandShown = false;

    private boxGuideHand?: Phaser.GameObjects.Image;
    private boxGuideHandTween?: Phaser.Tweens.Tween;

    private paintBrushRadius = 38; // Bán kính cọ vẽ
    private totalPaintableArea = 0; // Tổng diện tích có thể tô của tất cả các ô số
    private isPainting = false;
    private currentPaintingBox?: NumBox;

    constructor() {
        super('ColorSceneBoat');
    }

    init(data: { gameData: GameData }) {
        this.dataGame = data.gameData;

        // BOAT LEVELS ONLY
        this.colorLevels = [
            {
                label: 'Con thuyền',
                total: 5,
                targetColor: COLORS.blue,
                objectTextureKeys: [OBJECT_ASSET_KEYS.boat],
                counts: [5, 0],
                bannerTextKey: 'banner_title_3',
                voiceGuideKey: 'voice_guide_23',
                objectScale: 0.85,
                objectYOffset: 0,
            },
        ];
    }

    preload() {
        loadAssetGroups(this, 'shared', 'colorScene', 'numbers', 'ui');
    }

    create() {
        this.currentColorLevelIndex = 0;
        this.paletteSelectedIndex = -1;
        this.selected = undefined;
        this.paletteDots = [];
        this.boxes = [];
        this.objects = [];
        this.boardImage = undefined;
        this.bannerBg = undefined;
        this.bannerTextImage = undefined;
        this.totalPaintableArea = 0;

        this.boardFallbackGfx = this.add.graphics().setDepth(0);
        this.layoutBoard();
        this.scale.on('resize', this.layoutBoard, this);

        this.colorLevelLabel = this.add
            .text(this.boardRect.centerX, this.boardRect.y + 18, '', {
                fontFamily: 'Baloo, Arial',
                fontSize: '44px',
                color: '#0b1b2a',
            })
            .setOrigin(0.5, 0)
            .setDepth(6);
        this.colorLevelLabel.setVisible(false);

        this.createNumberAssets();
        this.createPaletteElements();
        this.createDuckChickenObjects();
        this.layoutBoard();

        this.applyCurrentColorLevel();
        this.time.delayedCall(0, () => {
            this.showPaletteGuideHand(true);
        });
        this.playGuideVoiceForCurrentLevel();

        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off('resize', this.layoutBoard, this);
        });

        this.input.once('pointerdown', () => {
            this.hidePaletteGuideHand();
            this.paletteGuideHandTimeout = this.time.delayedCall(3000, () => {
                if (!this.paletteSelectedIndex || this.paletteSelectedIndex === -1) {
                    this.showPaletteGuideHand(false);
                }
            });
        });
    }

    private playGuideVoiceForCurrentLevel() {
        this.colorLevels.forEach((level) => {
            if (level.voiceGuideKey) AudioManager.stop(level.voiceGuideKey);
        });
        const level = this.getCurrentColorLevel();
        if (level.voiceGuideKey) AudioManager.playWhenReady(level.voiceGuideKey);
    }

    private playCorrectAnswerSound() {
        AudioManager.stopGuideVoices();
        const idx = Math.floor(Math.random() * 4) + 1;
        const key = `correct_answer_${idx}`;
        AudioManager.playWhenReady?.(key);
    }

    private playCorrectSound() {
        AudioManager.play('sfx_correct');
        this.playCorrectAnswerSound();
    }

    private playWrongSound() {
        AudioManager.stopGuideVoices();
        AudioManager.play('sfx_wrong');
    }

    private createNumberAssets() {
        this.boxes = [];
        const midX = this.boardRect.centerX;
        const numberY = this.numberRowY ?? 100;
        const maxNumber = this.dataGame.maxNumber;
        const scale = 0.75;
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
            let rt: Phaser.GameObjects.RenderTexture | undefined = undefined;

            if (this.textures.exists(numberKey)) {
                image = this.add.image(cx, numberY, numberKey).setOrigin(0.5);
                image.setScale(scale, scale);
                image.setInteractive({ useHandCursor: true });

                const baseDepth = 10 + i * 2;
                rt = this.add.renderTexture(image.x, image.y, image.displayWidth, image.displayHeight);
                rt.setOrigin(0.5);
                rt.setDepth(baseDepth);
                rt.setVisible(true);

                image.clearTint();
                image.setDepth(baseDepth + 1);
            }
            const box: NumBox = {
                n,
                cx,
                y: numberY,
                image,
                rect: undefined as any,
                text: undefined as any,
                w: 0,
                h: 0,
                painted: false,
                setNumberTint: undefined,
                renderTexture: rt,
                paintProgress: 0,
                paintedPixels: new Set<string>(),
            };
            this.boxes.push(box);

            if (image) {
                image.on('pointerdown', () => this.onBoxClick(box));
                const imageArea = (image.width * scale) * (image.height * scale);
                const brushArea = Math.PI * this.paintBrushRadius * this.paintBrushRadius;
                this.totalPaintableArea += Math.ceil(imageArea / (brushArea * 0.5));
            }
            cx += widths[i] / 2 + gap;
        }
        this.totalPaintableArea = 30; // Thống nhất với logic Merge-game-2
    }

    private createPaletteElements() {
        this.paletteDefs.forEach((def, index) => {
            const dot = this.createPaletteDot(def);
            if (dot instanceof Phaser.GameObjects.Image) {
                dot.setInteractive({ useHandCursor: true });
                dot.on('pointerup', () => this.applyPaletteSelection(index));
            } else {
                dot.on('pointerup', () => this.applyPaletteSelection(index));
            }
            this.paletteDots.push(dot);
        });
    }

    private createDuckChickenObjects() {
        this.objects = [];
        const firstKey = this.colorLevels[0]?.objectTextureKeys?.[0] ?? OBJECT_ASSET_KEYS.balloonYellow;
        const sprite = this.add.image(0, 0, firstKey).setInteractive().setScale(0.48).setOrigin(0.5, 1);
        this.objects.push(sprite);
    }

    private applyCurrentColorLevel() {
        const level = this.getCurrentColorLevel();

        this.objects.forEach((obj, i) => {
            const textureKey = level.objectTextureKeys[i] ?? level.objectTextureKeys[0]!;
            if (this.textures.exists(textureKey)) {
                obj.setTexture(textureKey).setVisible(true).setScale(level.objectScale ?? 0.48);
            } else {
                obj.setVisible(false);
            }
        });

        this.paletteSelectedIndex = -1;
        this.selected = undefined;
        this.paletteDots.forEach((_, i) => this.updatePaletteStroke(i));

        this.updateColorLevelLabel();
        this.positionObjects();
        this.updateBannerTextImage();
        this.playGuideVoiceForCurrentLevel();
        this.paletteGuideHandShown = false;
        this.hidePaletteGuideHand();
    }

    private resetForNextColorLevel() {
        this.boxes.forEach((box) => {
            if (box.image) {
                box.image.clearTint();
            }
            if (box.renderTexture) {
                box.renderTexture.clear();
            }
            box.painted = false;
            box.paintProgress = 0;
            box.paintedPixels?.clear();
        });

        this.applyCurrentColorLevel();
        this.paletteGuideHandShown = false;
        this.showPaletteGuideHand(true);
        this.hidePaletteGuideHand();
    }

    private advanceColorLevel() {
        this.time.delayedCall(450, () => {
            if (this.currentColorLevelIndex + 1 < this.colorLevels.length) {
                this.currentColorLevelIndex++;
                this.resetForNextColorLevel();
                return;
            }
            // GO TO BOAT FLOW -> CIRCLE MARK
            this.game.events.emit(FLOW_GO_CIRCLE_MARK);
        });
    }

    private onBoxClick(box: NumBox) {
        if (!this.selected) {
            if (box.image) this.flashWrongEffect(box.image);
            this.playWrongSound();
            this.showPaletteGuideHand(false);
            return;
        }

        const level = this.getCurrentColorLevel();
        const isCorrect = this.selected === level.targetColor && box.n === level.total;

        if (box.painted) {
            if (box.image) this.flashWrongEffect(box.image);
            this.playWrongSound();
            if (this.selected) {
                this.showBoxGuideHand();
            } else {
                this.showPaletteGuideHand(false);
            }
            return;
        }

        if (!isCorrect) {
            if (box.image) this.flashWrongEffect(box.image);
            this.playWrongSound();
            this.hideBoxGuideHand();
            this.showPaletteGuideHand(false);
            return;
        }

        // Nếu đúng, bắt đầu tô
        this.isPainting = true;
        this.currentPaintingBox = box;
        this.hideBoxGuideHand();
        if (this.paletteGuideHandTimeout) {
            this.paletteGuideHandTimeout.remove(false);
            this.paletteGuideHandTimeout = undefined;
        }
    }

    private onPointerMove(pointer: Phaser.Input.Pointer) {
        if (!this.isPainting || !this.currentPaintingBox || !this.selected) return;

        const box = this.currentPaintingBox;
        if (!box.renderTexture || !box.image) return;

        const relativeX = pointer.x - (box.image.x - box.image.displayWidth / 2);
        const relativeY = pointer.y - (box.image.y - box.image.displayHeight / 2);

        const brush = this.add.circle(0, 0, this.paintBrushRadius, this.selected);
        box.renderTexture.draw(brush, relativeX, relativeY);
        brush.destroy();

        const gridKey = `${Math.floor(relativeX / 20)},${Math.floor(relativeY / 20)}`;
        if (!box.paintedPixels?.has(gridKey)) {
            box.paintedPixels?.add(gridKey);
            box.paintProgress = (box.paintProgress || 0) + 1;
        }
    }

    private onPointerUp() {
        if (!this.isPainting || !this.currentPaintingBox) return;

        const box = this.currentPaintingBox;
        this.isPainting = false;
        this.currentPaintingBox = undefined;

        const level = this.getCurrentColorLevel();
        const isCorrect = this.selected === level.targetColor && box.n === level.total;
        const completionThreshold = 0.1;

        const paintProgressMeetsThreshold = (box.paintProgress || 0) >= (this.totalPaintableArea * completionThreshold);

        if (isCorrect && paintProgressMeetsThreshold) {
            if (box.renderTexture && this.selected) {
                box.renderTexture.fill(this.selected);
            }
            box.painted = true;
            this.playCorrectSound();
            this.hidePaletteGuideHand();
            this.advanceColorLevel();
        }
    }

    private flashWrongEffect(target: Phaser.GameObjects.Image) {
        target.setTint(0xff3333);
        this.time.delayedCall(120, () => {
            target.clearTint();
            this.time.delayedCall(80, () => {
                target.setTint(0xff3333);
                this.time.delayedCall(120, () => {
                    target.clearTint();
                });
            });
        });
    }

    private showBoxGuideHand() {
        this.hideBoxGuideHand();
        const box = this.boxes.find(b => !b.painted);
        if (!box || !box.image) return;

        if (this.textures.exists('guide_hand')) {
            this.boxGuideHand = this.add.image(box.image.x, box.image.y + 60, 'guide_hand')
                .setOrigin(0.2, 0.1)
                .setScale(0.5)
                .setDepth(100)
                .setAlpha(0.92);

            this.boxGuideHandTween = this.tweens.add({
                targets: this.boxGuideHand,
                y: box.image.y + 30,
                duration: 700,
                ease: 'Cubic.InOut',
                yoyo: true,
                repeat: -1,
            });
        }
    }

    private hideBoxGuideHand() {
        if (this.boxGuideHand) {
            this.boxGuideHand.destroy();
            this.boxGuideHand = undefined;
        }
        if (this.boxGuideHandTween) {
            this.boxGuideHandTween.stop();
            this.boxGuideHandTween = undefined;
        }
    }

    private getCurrentColorLevel() {
        return this.colorLevels[this.currentColorLevelIndex];
    }

    private updateColorLevelLabel() {
        if (!this.colorLevelLabel || this.colorLevelLabel.scene == null) return;
        const level = this.getCurrentColorLevel();
        const labelText = `Màn ${this.currentColorLevelIndex + 1} • ${level.label}`;
        this.colorLevelLabel.setText(labelText);
        this.colorLevelLabel.setPosition(this.boardRect.centerX, this.boardRect.y + 18);
    }

    private createPaletteDot(def: { c: number; label: string; spriteKey?: string }) {
        if (def.spriteKey && this.textures.exists(def.spriteKey)) {
            return this.add.image(0, 0, def.spriteKey).setOrigin(0.5).setScale(0.8);
        }
        const fillRadius = 44;
        const borderWidth = 2;
        const borderColor = 0x0037FF;
        const container = this.add.container(0, 0);
        const fill = this.add.circle(0, 0, fillRadius, def.c);
        const border = this.add.arc(0, 0, fillRadius + borderWidth / 2, 0, 360, false, borderColor, 0);
        border.setStrokeStyle(borderWidth, borderColor, 1);
        container.add([fill, border]);

        container.setInteractive({
            hitArea: new Phaser.Geom.Rectangle(-fillRadius, -fillRadius, fillRadius * 2, fillRadius * 2),
            hitAreaCallback: Phaser.Geom.Rectangle.Contains,
            useHandCursor: true
        });

        (container as any).setAlpha = (a: number) => { fill.setAlpha(a); border.setAlpha(a); };
        (container as any).x = 0; (container as any).y = 0;
        (container as any).setPosition = (x: number, y: number) => { container.x = x; container.y = y; };
        (container as any).setDepth = (d: number) => { container.setDepth(d); };
        (container as any).depth = 0;
        (container as any).radius = fillRadius;
        return container as any;
    }

    private applyPaletteSelection(index: number) {
        this.hidePaletteGuideHand();
        this.paletteSelectedIndex = index;
        const def = this.paletteDefs[index];
        this.selected = def.c;
        this.paletteDots.forEach((_, i) => this.updatePaletteStroke(i));
    }

    private updatePaletteStroke(index: number) {
        const dot = this.paletteDots[index];
        if (!dot) return;
        if ((dot as any).setAlpha) {
            if (index === this.paletteSelectedIndex) {
                (dot as any).setAlpha(1);
            } else {
                (dot as any).setAlpha(0.5);
            }
            return;
        }
        if ((dot as any)._border) {
            (dot as any)._border.destroy();
            (dot as any)._border = undefined;
        }
        const border = this.add.graphics();
        border.lineStyle(2, 0x0037FF, 1);
        if (dot instanceof Phaser.GameObjects.Image) {
            border.strokeCircle(dot.x, dot.y, dot.displayWidth / 2 + 1);
        }
        border.setDepth(dot.depth + 1);
        (dot as any)._border = border;
        if (index === this.paletteSelectedIndex) {
            dot.setAlpha(1);
        } else {
            dot.setAlpha(0.5);
        }
    }

    private layoutBoard() {
        if (!this.boardFallbackGfx) return;

        const w = this.scale.width;
        const h = this.scale.height;
        const maxW = Math.min(1400, w * 0.85);
        const maxH = Math.min(840, h * 0.85);
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

        this.numberRowY = this.boardRect.y + 105;

        this.paletteCenter = {
            x: innerX + innerW / 2,
            y: this.numberRowY + 140,
        };

        const objSpacing = Math.min(innerW * 0.6, 550);
        const objY = this.boardRect.bottom - 15;
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
        this.updatePalettePositions();
        this.positionObjects();
        this.ensureBannerAssets();
        this.updateColorLevelLabel();
    }

    private drawBoardFrame() {
        if (!this.boardFallbackGfx) return;
        const corner = Math.min(28, this.boardRect.height * 0.08);

        this.boardFallbackGfx.clear();
        this.boardFallbackGfx.fillStyle(0xffffff, 1).fillRoundedRect(
            this.boardRect.x,
            this.boardRect.y,
            this.boardRect.width,
            this.boardRect.height,
            corner
        );
        this.boardFallbackGfx.lineStyle(6, 0x1d4ed8, 1).strokeRoundedRect(
            this.boardRect.x,
            this.boardRect.y,
            this.boardRect.width,
            this.boardRect.height,
            corner
        );
    }

    private repositionNumberBoxes() {
        if (!this.boxes.length) return;
        const midX = this.boardInnerRect.centerX;
        const maxNumber = this.dataGame.maxNumber;
        const scale = 0.75;
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
                box.image.setScale(scale);
            }
            if (box.renderTexture) {
                box.renderTexture.setPosition(cx, y);
            }
            cx += widths[i] / 2 + gap;
        });
    }

    private positionObjects() {
        if (!this.objects.length || !this.objectPositions) return;

        const level = this.getCurrentColorLevel();
        const { leftX, rightX, y } = this.objectPositions;
        const midX = this.boardInnerRect.centerX;
        const yPos = y + (level.objectYOffset ?? 0);

        if (this.objects.length === 1) {
            this.objects[0].setPosition(midX, yPos);
        } else {
            const xs = [leftX, rightX];
            this.objects.forEach((obj, index) => {
                const targetX = xs[index] ?? xs[0];
                obj.setPosition(targetX, yPos);
            });
        }
    }

    private updatePalettePositions() {
        if (!this.paletteCenter) return;
        const y = this.paletteCenter.y;
        const paletteCount = this.paletteDots.length;
        const dotWidth = 90;
        const dotHeight = 90;
        const border = 2;
        const dotSpacing = 45;
        const totalWidth = paletteCount * dotWidth + (paletteCount - 1) * dotSpacing;
        const startX = this.boardInnerRect.centerX - totalWidth / 2 + dotWidth / 2;
        this.paletteDots.forEach((dot, index) => {
            const dx = startX + index * (dotWidth + dotSpacing);
            dot.setPosition(dx, y);
            if (dot instanceof Phaser.GameObjects.Image) {
                dot.setDisplaySize(dotWidth - border * 2, dotHeight - border * 2);
            } else if (dot instanceof Phaser.GameObjects.Arc) {
                dot.setRadius((dotWidth - border * 2) / 2);
                dot.setStrokeStyle(border, 0xffffff);
            } else if (dot instanceof Phaser.GameObjects.Container) {
                const originalRadius = (dot as any).radius || 44;
                const originalDiameter = originalRadius * 2;
                const targetDiameter = dotWidth - border * 2;
                dot.setScale(targetDiameter / originalDiameter);
            }
            this.updatePaletteStroke(index);
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
            this.bannerBg = this.add
                .image(0, 0, this.bannerBgKey)
                .setOrigin(0.5, 0.5)
                .setDepth(35);
        }
        this.positionBannerAssets();
    }

    private updateBannerTextImage() {
        if (this.bannerTextImage) {
            this.bannerTextImage.destroy();
            this.bannerTextImage = undefined;
        }
        const level = this.getCurrentColorLevel();
        const key = level.bannerTextKey;
        if (key && this.textures.exists(key)) {
            this.bannerTextImage = this.add
                .image(0, 0, key)
                .setOrigin(0.5, 0.5)
                .setDepth(36);
            this.positionBannerAssets();
        }
    }

    private positionBannerAssets() {
        if (!this.bannerBg) return;
        const maxWidth = Math.min(this.scale.width * 0.95, 1500);
        const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;
        const targetWidth = Math.min(maxWidth, this.boardRect.width * 0.95);
        const targetHeight = bgRatio ? targetWidth / bgRatio : this.bannerBg.displayHeight;
        const x = this.boardRect.centerX;
        const y = Math.max(targetHeight / 2 + 8, this.boardRect.y - targetHeight / 2 - 8) - this.boardRect.height * 0.01;
        this.bannerBg.setDisplaySize(targetWidth, targetHeight);
        this.bannerBg.setPosition(x, y);

        if (this.bannerTextImage) {
            const textRatio = this.getTextureRatio(this.bannerTextImage.texture.key) ?? 1;
            const textWidth = targetWidth * 0.87;
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

    private showPaletteGuideHand(first: boolean) {
        this.hidePaletteGuideHand();
        if (first && this.paletteGuideHandShown) return;
        const level = this.getCurrentColorLevel();
        const paletteIndex = this.paletteDefs.findIndex(def => def.c === level.targetColor);
        const paletteDot = this.paletteDots[paletteIndex];
        if (paletteDot && this.textures.exists('guide_hand')) {
            this.paletteGuideHand = this.add.image(paletteDot.x + 20, paletteDot.y + 5, 'guide_hand')
                .setOrigin(0.2, 0.1)
                .setScale(0.5)
                .setDepth(100)
                .setAlpha(0.92);
            this.paletteGuideHandTween = this.tweens.add({
                targets: this.paletteGuideHand,
                scale: { from: 0.36, to: 0.48 },
                duration: 500,
                ease: 'Sine.InOut',
                yoyo: true,
                repeat: -1,
            });
            if (first) this.paletteGuideHandShown = true;
        }
    }
    private hidePaletteGuideHand() {
        if (this.paletteGuideHand) {
            this.paletteGuideHand.destroy();
            this.paletteGuideHand = undefined;
        }
        if (this.paletteGuideHandTween) {
            this.paletteGuideHandTween.stop();
            this.paletteGuideHandTween = undefined;
        }
        if (this.paletteGuideHandTimeout) {
            this.paletteGuideHandTimeout.remove(false);
            this.paletteGuideHandTimeout = undefined;
        }
    }
}
