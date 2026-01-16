import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { COLORS } from '../data/gameData';
import { FLOW_GO_CIRCLE_MARK } from '../flow/events';
import { BOARD_ASSET_KEYS, loadAssetGroups } from '../assets';
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
};

export class ColorScene extends Phaser.Scene {
  private dataGame!: GameData;
  private boxes: NumBox[] = [];
  private selected?: number;

  private boardFallbackGfx?: Phaser.GameObjects.Graphics;
  private boardImage?: Phaser.GameObjects.Image;
  private boardRect = new Phaser.Geom.Rectangle();
  private boardInnerRect = new Phaser.Geom.Rectangle();
  private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;

  private paletteDots: Array<Phaser.GameObjects.Arc | Phaser.GameObjects.Image> = [];
  private paletteCenter?: { x: number; y: number };
  private paletteSelectedIndex = 0;
  private paletteDefs: Array<{ c: number; label: string; spriteKey?: string }> = [
    { c: COLORS.red, label: 'ĐỎ' },
    { c: COLORS.yellow, label: 'VÀNG' },
    { c: 0x00bfff, label: 'XANH' }, // Thêm màu xanh biển
  ];

  // Các object hiển thị (bóng, bi)
  private objects: Phaser.GameObjects.Image[] = [];
  // private objectNumbers: Phaser.GameObjects.Text[] = [];
  private objectPositions?: { leftX: number; rightX: number; y: number };

  private numberRowY?: number;
  private colorLevelLabel?: Phaser.GameObjects.Text;

  private colorLevels: ColorLevel[] = [];
  private currentColorLevelIndex = 0;

  private bannerBg?: Phaser.GameObjects.Image;
  private bannerTextImage?: Phaser.GameObjects.Image;
  private readonly bannerBgKey = BOARD_ASSET_KEYS.bannerBg;
  // Remove bannerTextKey, use per-level keys instead

  // Add per-level banner text keys for ColorScene only (not using add-text.png)
  // Level 1: 'question1' (Question (2).png), Level 2: 'question2' (Question (1).png)
  // Removed bannerTextKeys, now per-level in colorLevels

  // private guideHand?: Phaser.GameObjects.Image;
  // private guideHandTween?: Phaser.Tweens.Tween;

  private paletteGuideHand?: Phaser.GameObjects.Image;
  private paletteGuideHandTween?: Phaser.Tweens.Tween;
  private paletteGuideHandTimeout?: Phaser.Time.TimerEvent;
  private paletteGuideHandShown = false;

  constructor() {
    super('ColorScene');
  }

  init(data: { gameData: GameData }) {
    this.dataGame = data.gameData;

    this.colorLevels = [
      {
        label: 'Vịt',
        total: 4,
        targetColor: COLORS.red,
        objectTextureKeys: ['icon_duck'],
        counts: [3, 0],
        bannerTextKey: 'banner_title_1',
        voiceGuideKey: 'voice_guide_21',
      },
      {
        label: 'Chim',
        total: 4,
        targetColor: COLORS.red,
        objectTextureKeys: ['icon_bird'],
        counts: [3, 0],
        bannerTextKey: 'banner_title_2',
        voiceGuideKey: 'voice_guide_22',
      },
    ];
  }

  preload() {
    loadAssetGroups(this, 'shared', 'colorScene', 'numbers', 'ui', 'countConnect');
    // Không load audio hướng dẫn ở đây, AudioManager sẽ quản lý và load bằng howler
  }

  create() {
    // Reset toàn bộ trạng thái logic khi vào lại scene (chơi lại)
    this.currentColorLevelIndex = 0;
    this.paletteSelectedIndex = -1;
    this.selected = undefined;
    this.paletteDots = [];
    this.objects = [];
    this.boardImage = undefined;
    this.bannerBg = undefined;
    this.bannerTextImage = undefined;
    this.boardFallbackGfx = this.add.graphics().setDepth(0);
    this.layoutBoard();
    this.scale.on('resize', this.layoutBoard, this);

    this.colorLevelLabel = this.add
      .text(this.boardRect.centerX, this.boardRect.y + 18, '', {
        fontFamily: 'Baloo, Arial',
        fontSize: '44px', // tăng kích thước chữ banner
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
    // Đảm bảo bàn tay hiện ngay khi vào màn đầu tiên
    this.time.delayedCall(0, () => {
      this.showPaletteGuideHand(true);
    });
    // Phát voice hướng dẫn cho màn đầu tiên (không ảnh hưởng bàn tay)
    this.playGuideVoiceForCurrentLevel();

    this.boxes.forEach((b) => {
      if (b.image) b.image.on('pointerdown', () => this.tryPaint(b));
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutBoard, this);
    });

    this.input.once('pointerdown', () => {
      this.hidePaletteGuideHand();
      // Nếu bé chưa chọn màu sau 3s thì hiện lại bàn tay
      this.paletteGuideHandTimeout = this.time.delayedCall(3000, () => {
        if (!this.paletteSelectedIndex || this.paletteSelectedIndex === -1) {
          this.showPaletteGuideHand(false);
        }
      });
    });
  }
  // Phát voice hướng dẫn cho từng màn (level) ColorScene qua AudioManager (howler)
  // Phát voice hướng dẫn cho từng màn (level) ColorScene qua AudioManager
  private playGuideVoiceForCurrentLevel() {
    AudioManager.stopGuideVoices();
    const level = this.getCurrentColorLevel();
    if (level.voiceGuideKey) AudioManager.playWhenReady(level.voiceGuideKey);
  }

  // Phát âm thanh đúng

  // Phát âm thanh đúng tiếng Việt, random 1 trong 4 file
  private playCorrectAnswerSound() {
    AudioManager.stopGuideVoices();
    const idx = Math.floor(Math.random() * 4) + 1; // 1-4
    const key = `correct_answer_${idx}`;
    AudioManager.playWhenReady?.(key);
  }

  private playCorrectSound() {
    AudioManager.play('sfx_correct');
    this.playCorrectAnswerSound();
  }

  // Phát âm thanh sai
  private playWrongSound() {
    AudioManager.stopGuideVoices();
    AudioManager.play('sfx_wrong');
  }

  private createNumberAssets() {
    this.boxes = [];
    const midX = this.boardRect.centerX;
      const numberY = this.numberRowY ?? 100;
    const maxNumber = this.dataGame.maxNumber;
      const scale = 0.38;
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
        image.setInteractive({ useHandCursor: true });
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
        setNumberTint: image ? (color?: number) => { if (color !== undefined) image.setTint(color); } : undefined,
      });
      cx += widths[i] / 2 + gap;
    }
  }

  private createPaletteElements() {
    this.paletteDefs.forEach((def, index) => {
      const dot = this.createPaletteDot(def);
      // Nếu là image thì setInteractive ở đây, còn container đã set trong createPaletteDot
      if (dot instanceof Phaser.GameObjects.Image) {
        dot.setInteractive({ useHandCursor: true });
        dot.on('pointerdown', () => this.applyPaletteSelection(index));
      } else {
        // container: đã chuyển pointerdown từ fill sang container trong createPaletteDot
        dot.on('pointerdown', () => this.applyPaletteSelection(index));
      }
      this.paletteDots.push(dot);
    });
  }

  // private createObjectElements() { ... } // Đã bỏ vì không dùng
    // Đã bỏ phần thân hàm thừa ngoài class
  private createDuckChickenObjects() {
    // Hiển thị asset vịt/chim
    this.objects = [];
    // Creates a single placeholder object that will be textured by the current level.
      const sprite = this.add.image(0, 0, 'icon_duck').setInteractive().setScale(0.48);
    this.objects.push(sprite);
  }

  private applyCurrentColorLevel() {
    const level = this.getCurrentColorLevel();

    this.objects.forEach((obj, i) => {
      const textureKey = level.objectTextureKeys[i] ?? level.objectTextureKeys[0]!;
      if (this.textures.exists(textureKey)) {
          obj.setTexture(textureKey).setVisible(true).setScale(0.48);
      } else {
        obj.setVisible(false);
      }
    });

    // Không cập nhật label số trên object

    // Không tự động chọn màu khi vào màn hoặc đổi màn
    this.paletteSelectedIndex = -1;
    this.selected = undefined;
    this.paletteDots.forEach((_, i) => this.updatePaletteStroke(i));

    this.updateColorLevelLabel();
    this.positionObjects();
    this.updateBannerTextImage();
    // Phát voice hướng dẫn khi chuyển màn
    this.playGuideVoiceForCurrentLevel();
    // Reset trạng thái đã hiện bàn tay, không gọi showPaletteGuideHand ở đây để tránh xóa bàn tay vừa hiện ở create
    this.paletteGuideHandShown = false;
    this.hidePaletteGuideHand();
  }

  private resetForNextColorLevel() {
    this.boxes.forEach((box) => {
      if (box.image) {
        box.image.clearTint();
      }
      box.painted = false;
    });

    this.applyCurrentColorLevel();
    // Hiển thị lại bàn tay hướng dẫn ở ô màu lần đầu tiên
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

      this.game.events.emit(FLOW_GO_CIRCLE_MARK);
    });
  }

  private tryPaint(box: NumBox) {
    if (box.painted || !this.selected) {
      this.cameras.main.shake(120, 0.01);
      this.playWrongSound();
      // Không hiện lại bàn tay ở ô màu khi tô sai
      return;
    }

    const level = this.getCurrentColorLevel();
    const isCorrect = this.selected === level.targetColor && box.n === level.total;

    if (!isCorrect) {
      this.cameras.main.shake(120, 0.012);
      this.playWrongSound();
      // Không hiện lại bàn tay ở ô màu khi tô sai
      return;
    }

    if (box.image) {
      box.image.setTint(level.targetColor);
    }
    box.painted = true;
    this.playCorrectSound();
    // Ẩn bàn tay khi tô đúng
    this.hidePaletteGuideHand();
    this.advanceColorLevel();
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
    // Viền giống hệt CSS: border 2px solid rgba(0,55,255,1)
    const fillRadius = 29.5;
    const borderWidth = 2;
    const borderColor = 0x0037FF;
    const container = this.add.container(0, 0);
    // Fill
    const fill = this.add.circle(0, 0, fillRadius, def.c);
    fill.setInteractive({ useHandCursor: true });
    // Border nét liền, dùng Arc để nét mịn
    const border = this.add.arc(0, 0, fillRadius + borderWidth / 2, 0, 360, false, borderColor, 0);
    border.setStrokeStyle(borderWidth, borderColor, 1);
    container.add([fill, border]);
    // Chuyển sự kiện pointerdown từ fill lên container để tương thích logic cũ
    fill.on('pointerdown', (pointer: any) => {
      container.emit('pointerdown', pointer);
    });
    // Để tương thích code cũ, gán các hàm cần thiết
    (container as any).setAlpha = (a: number) => { fill.setAlpha(a); border.setAlpha(a); };
    (container as any).x = 0; (container as any).y = 0;
    (container as any).setPosition = (x: number, y: number) => { container.x = x; container.y = y; };
    (container as any).setDepth = (d: number) => { container.setDepth(d); };
    (container as any).depth = 0;
    (container as any).radius = fillRadius;
    return container as any;
  }

  private applyPaletteSelection(index: number) {
    this.paletteSelectedIndex = index;
    const def = this.paletteDefs[index];
    this.selected = def.c;
    this.paletteDots.forEach((_, i) => this.updatePaletteStroke(i));
  }

  private updatePaletteStroke(index: number) {
    const dot = this.paletteDots[index];
    if (!dot) return;
    // Nếu là container (tức là dot custom), chỉ cần set alpha cho fill và border, không cần vẽ lại border
    if ((dot as any).setAlpha) {
      if (index === this.paletteSelectedIndex) {
        (dot as any).setAlpha(1);
      } else {
        (dot as any).setAlpha(0.5);
      }
      return;
    }
    // Nếu là image, vẫn giữ border như cũ
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
    const maxW = Math.min(1100, w * 0.92); // board nhỏ lại
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
    // Thang số lên cao, thang màu xuống thấp hơn để tăng khoảng cách
    // Dịch thang số lên trên một chút
    this.numberRowY = innerY - 18 + innerH * 0.01;

    // Tăng khoảng cách giữa 2 bóng/bi
    const objSpacing = Math.min(innerW * 0.5, 300);
    // Đặt asset lên cao hơn (giảm 40px so với cũ)
    const objY = innerY + innerH * 0.72;
    this.objectPositions = {
      leftX: this.boardInnerRect.centerX - objSpacing / 2,
      rightX: this.boardInnerRect.centerX + objSpacing / 2,
      y: objY,
    };

    // Đẩy thang màu lên trên (gần thang số hơn)
    this.paletteCenter = {
      x: innerX + innerW / 2,
      y: this.numberRowY! + 80,
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

  private positionObjects() {
    if (!this.objects.length || !this.objectPositions) return;

    const { y } = this.objectPositions;
    const x = this.boardInnerRect.centerX;

    // Đặt asset bi bóng tại objectPositions.y (giống CountConnectScene)
    this.objects.forEach((obj) => {
      obj.setPosition(x, y);
    });

    // Không reposition label số trên object
  }

  private updatePalettePositions() {
    if (!this.paletteCenter) return;
    const y = this.paletteCenter.y;
    const paletteCount = this.paletteDots.length;
    // All dots have the same size
    const dotWidth = 60;
    const dotHeight = 60;
    const border = 2;
    const dotSpacing = 30; // Tăng khoảng cách giữa các màu
    // Center the palette horizontally within the board
    const totalWidth = paletteCount * dotWidth + (paletteCount - 1) * dotSpacing;
    const startX = this.boardInnerRect.centerX - totalWidth / 2 + dotWidth / 2;
    this.paletteDots.forEach((dot, index) => {
      const dx = startX + index * (dotWidth + dotSpacing);
      dot.setPosition(dx, y);
      // Set all dots to the same size
      if (dot instanceof Phaser.GameObjects.Image) {
        dot.setDisplaySize(dotWidth - border * 2, dotHeight - border * 2);
      } else if (dot instanceof Phaser.GameObjects.Arc) {
        dot.setRadius((dotWidth - border * 2) / 2);
        dot.setStrokeStyle(border, 0xffffff);
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
    // Only create bannerBg here, bannerTextImage is handled per-level
    if (!this.textures.exists(this.bannerBgKey)) return;
    if (!this.bannerBg && this.textures.exists(this.bannerBgKey)) {
      this.bannerBg = this.add
        .image(0, 0, this.bannerBgKey)
        .setOrigin(0.5, 0.5)
        .setDepth(35);
    }
    this.positionBannerAssets();
  }

  // Update or create the banner text image for the current level
  private updateBannerTextImage() {
    // Remove old bannerTextImage if exists
    if (this.bannerTextImage) {
      this.bannerTextImage.destroy();
      this.bannerTextImage = undefined;
    }
    // Use per-level bannerTextKey
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
      const textRatio = this.getTextureRatio(this.bannerTextImage.texture.key) ?? 1;
      const textWidth = targetWidth * 0.85; // tăng từ 0.7 lên 0.77
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

  // private showGuideHand() {
  //   // Xóa bàn tay cũ nếu có
  //   if (this.guideHand) {
  //     this.guideHand.destroy();
  //     this.guideHand = undefined;
  //   }
  //   if (this.guideHandTween) {
  //     this.guideHandTween.stop();
  //     this.guideHandTween = undefined;
  //   }
  //   // Chỉ hiện khi chưa tô đúng
  //   const box = this.boxes.find(b => !b.painted);
  //   if (!box || !box.image) return;
  //   // Tạo sprite bàn tay ở ô số cần tô (asset là 'guide_hand')
  //   if (this.textures.exists('guide_hand')) {
  //     this.guideHand = this.add.image(box.image.x, box.image.y + 60, 'guide_hand')
  //       .setOrigin(0.2, 0.1)
  //       .setScale(0.5)
  //       .setDepth(100)
  //       .setAlpha(0.92);
  //     // Tween di chuyển bàn tay lên xuống trên ô số cần tô
  //     this.guideHandTween = this.tweens.add({
  //       targets: this.guideHand,
  //       y: box.image.y + 30,
  //       duration: 700,
  //       ease: 'Cubic.InOut',
  //       yoyo: true,
  //       repeat: -1,
  //     });
  //   }
  //   // Hiện thêm bàn tay ở ô màu cần chọn
  //   const level = this.getCurrentColorLevel();
  //   const paletteIndex = this.paletteDefs.findIndex(def => def.c === level.targetColor);
  //   const paletteDot = this.paletteDots[paletteIndex];
  //   if (paletteDot && this.textures.exists('guide_hand')) {
  //     const hand = this.add.image(paletteDot.x, paletteDot.y - 20, 'guide_hand')
  //       .setOrigin(0.2, 0.1)
  //       .setScale(0.45)
  //       .setDepth(100)
  //       .setAlpha(0.92);
  //     this.tweens.add({
  //       targets: hand,
  //       y: paletteDot.y - 30,
  //       duration: 700,
  //       ease: 'Cubic.InOut',
  //       yoyo: true,
  //       repeat: -1,
  //     });
  //     // Lưu lại để xóa khi cần
  //     (this as any)._paletteGuideHand = hand;
  //   }
  // }
  private showPaletteGuideHand(first: boolean) {
    // Xóa bàn tay cũ nếu có
    this.hidePaletteGuideHand();
    // Chỉ hiện lần đầu hoặc khi timeout
    if (first && this.paletteGuideHandShown) return;
    const level = this.getCurrentColorLevel();
    const paletteIndex = this.paletteDefs.findIndex(def => def.c === level.targetColor);
    const paletteDot = this.paletteDots[paletteIndex];
    if (paletteDot && this.textures.exists('guide_hand')) {
      // Dịch bàn tay xuống thêm 40px và sang phải 20px, nhỏ lại
      this.paletteGuideHand = this.add.image(paletteDot.x + 20, paletteDot.y + 5, 'guide_hand')
        .setOrigin(0.2, 0.1)
        .setScale(0.5)
        .setDepth(100)
        .setAlpha(0.92);
      // Animation nhấp nháy: scale lên xuống
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
