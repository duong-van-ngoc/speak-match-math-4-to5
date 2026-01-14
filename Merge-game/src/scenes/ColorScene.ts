import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { COLORS } from '../data/gameData';
import { FLOW_GO_END, type FlowEndPayload } from '../flow/events';
import { BOARD_ASSET_KEYS, COLOR_SCENE_ASSETS, loadAssetGroups, VOICE_GUIDE_ASSET_KEYS } from '../assets';
import AudioManager from '../AudioManager';
import type { NumBox } from '../ui/helpers';

type ColorLevel = {
  label: string;
  total: number;
  targetColor: number;
  // asset Png của các object bóng, bi...
  objectTextureKeys: (string | undefined)[];
  // số lượng object mỗi bên trái/phải
  counts: [number, number];
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
    { c: COLORS.red, label: 'ĐỎ', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[0] },
    { c: COLORS.yellow, label: 'VÀNG', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[1] },
    { c: 0x00bfff, label: 'XANH', spriteKey: undefined }, // Thêm màu xanh biển
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
  private readonly bannerTextKeys: string[] = [
    'question1', // Level 1: Question (2).png
    'question2', // Level 2: Question (1).png
  ];

  constructor() {
    super('ColorScene');
  }

  init(data: { gameData: GameData }) {
    this.dataGame = data.gameData;

    const ballKeys = COLOR_SCENE_ASSETS.ballTextures;
    const marbleKeys = COLOR_SCENE_ASSETS.marbleTextures;

    this.colorLevels = [
      {
        label: 'Bóng',
        total: this.dataGame.ballsBags.reduce((a, b) => a + b, 0),
        targetColor: COLORS.red,
        objectTextureKeys: ballKeys,
        counts: this.dataGame.ballsBags as [number, number],
      },
      {
        label: 'Bi',
        total: this.dataGame.marblesBags.reduce((a, b) => a + b, 0),
        targetColor: COLORS.yellow,
        objectTextureKeys: marbleKeys,
        counts: this.dataGame.marblesBags as [number, number],
      },
    ];
  }

  preload() {
    loadAssetGroups(this, 'shared', 'colorScene', 'numbers', 'ui', 'countConnect');
    // Load guide voice audio manually (loadAssetGroups only loads images)
    this.load.audio('voice_guide_color1', 'assets/audio/ball.mp3');
    this.load.audio('voice_guide_color2', 'assets/audio/marble.mp3');
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
        fontSize: '26px',
        color: '#0b1b2a',
      })
      .setOrigin(0.5, 0)
      .setDepth(6);
    this.colorLevelLabel.setVisible(false);

    this.createNumberAssets();
    this.createPaletteElements();
    this.createObjectElements();
    this.layoutBoard();

    this.applyCurrentColorLevel();

    // Phát voice hướng dẫn cho màn đầu tiên
    this.playGuideVoiceForCurrentLevel();

    this.boxes.forEach((b) => {
      if (b.image) b.image.on('pointerdown', () => this.tryPaint(b));
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutBoard, this);
    });
  }
  // Phát voice hướng dẫn cho từng màn (level) ColorScene qua AudioManager (howler)
  private playGuideVoiceForCurrentLevel() {
    const voiceKeys = [
      VOICE_GUIDE_ASSET_KEYS.color1,
      VOICE_GUIDE_ASSET_KEYS.color2,
    ];
    const key = voiceKeys[this.currentColorLevelIndex] || voiceKeys[0];
    AudioManager.playWhenReady(key);
  }

  // Phát âm thanh đúng
  private playCorrectSound() {
    AudioManager.play('sfx_correct');
  }

  // Phát âm thanh sai
  private playWrongSound() {
    AudioManager.play('sfx_wrong');
  }

  private createNumberAssets() {
    this.boxes = [];
    const midX = this.boardRect.centerX;
    const numberY = this.numberRowY ?? 140;
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

  private createObjectElements() {
    // Reset lại mảng objects để tránh giữ lại object cũ đã bị destroy khi restart scene
    this.objects = [];
    const level = this.getCurrentColorLevel();
    // Tính vị trí x dựa vào objectPositions, y sẽ đặt sát đáy boardInnerRect
    const pos = this.objectPositions ?? { leftX: 0, rightX: 0, y: 0 };
    // Tạm thời tạo object ở y=0, sau đó sẽ reposition đúng ở positionObjects
    for (let i = 0; i < 2; i++) {
      const textureKey = level.objectTextureKeys[i] ?? level.objectTextureKeys[0]!;
      const x = i === 0 ? pos.leftX : pos.rightX;
      const obj = this.add.image(x, 0, textureKey).setScale(0.4, 0.4);
      this.objects.push(obj);
      // Không tạo label số trên object
    }
  }

  private applyCurrentColorLevel() {
    const level = this.getCurrentColorLevel();

    this.objects.forEach((obj, i) => {
      const textureKey = level.objectTextureKeys[i] ?? level.objectTextureKeys[0]!;
      if (this.textures.exists(textureKey)) {
        obj.setTexture(textureKey).setVisible(true);
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
  }

  private resetForNextColorLevel() {
    this.boxes.forEach((box) => {
      if (box.image) {
        box.image.clearTint();
      }
      box.painted = false;
    });

    this.applyCurrentColorLevel();
  }

  private advanceColorLevel() {
    this.time.delayedCall(450, () => {
      if (this.currentColorLevelIndex + 1 < this.colorLevels.length) {
        this.currentColorLevelIndex++;
        this.resetForNextColorLevel();
        return;
      }

      this.game.events.emit(FLOW_GO_END, {
        scene: this.scene.key,
        isVictory: true,
        marblesTotal: 0,
        ballsTotal: 0
      } as FlowEndPayload);
    });
  }

  private tryPaint(box: NumBox) {
    if (box.painted || !this.selected) {
      this.cameras.main.shake(120, 0.01);
      this.playWrongSound();
      return;
    }

    const level = this.getCurrentColorLevel();
    const isCorrect = this.selected === level.targetColor && box.n === level.total;

    if (!isCorrect) {
      this.cameras.main.shake(120, 0.012);
      this.playWrongSound();
      return;
    }

    if (box.image) {
      box.image.setTint(level.targetColor);
    }
    box.painted = true;
    this.playCorrectSound();
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
    const maxW = Math.min(1100, w * 0.92);
    const maxH = Math.min(520, h * 0.75);
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

    // Tăng khoảng cách giữa 2 bóng/bi
    const objSpacing = Math.min(innerW * 0.5, 300);
    // Đặt bóng/bi xuống gần đáy board hơn, giống CountConnectScene
    const objY = innerY + innerH * 0.72;
    this.objectPositions = {
      leftX: this.boardInnerRect.centerX - objSpacing / 2,
      rightX: this.boardInnerRect.centerX + objSpacing / 2,
      y: objY,
    };

    // Đẩy thang màu lên gần thang số (gần đầu board)
    this.paletteCenter = {
      x: innerX + innerW / 2,
      y: this.numberRowY! + 110, // Dịch xuống thêm 30px
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

    const { leftX, rightX, y } = this.objectPositions;
    const xs = [leftX, rightX];

    // Đặt asset bi bóng tại objectPositions.y (giống CountConnectScene)
    this.objects.forEach((obj, index) => {
      const targetX = xs[index] ?? xs[0];
      obj.setPosition(targetX, y);
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
    // Pick the correct banner text key for the current level
    const key = this.bannerTextKeys[this.currentColorLevelIndex] || this.bannerTextKeys[0];
    if (this.textures.exists(key)) {
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
      // Use the correct ratio for the current banner text image
      const textRatio = this.getTextureRatio(this.bannerTextImage.texture.key) ?? 1;
      const textWidth = targetWidth * 0.7;
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
}
