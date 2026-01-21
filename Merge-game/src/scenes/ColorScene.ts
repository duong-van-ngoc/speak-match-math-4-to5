import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { COLORS } from '../data/gameData';
import { FLOW_GO_END, type FlowEndPayload } from '../flow/events';
import { BOARD_ASSET_KEYS, COLOR_SCENE_ASSETS, loadAssetGroups } from '../assets';
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

  // private guideHand?: Phaser.GameObjects.Image;
  // private guideHandTween?: Phaser.Tweens.Tween;

  private paletteGuideHand?: Phaser.GameObjects.Image;
  private paletteGuideHandTween?: Phaser.Tweens.Tween;
  private paletteGuideHandTimeout?: Phaser.Time.TimerEvent;
  private paletteGuideHandShown = false;

  private boxGuideHand?: Phaser.GameObjects.Image;
  private boxGuideHandTween?: Phaser.Tweens.Tween;

    private paintBrushRadius = 25; // Bán kính cọ vẽ
    private totalPaintableArea = 0; // Tổng diện tích có thể tô của tất cả các ô số

    private isPainting = false;
    private currentPaintingBox?: NumBox;

  constructor() {
    super('ColorScene');
  }

  // private ensureNumberBgMaskTexture(numberKey: string) {
  //   const maskKey = `${numberKey}__bgmask`;
  //   if (this.textures.exists(maskKey)) return maskKey;
  //   if (!this.textures.exists(numberKey)) return undefined;

  //   const tex = this.textures.get(numberKey);
  //   const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
  //   if (!src) return undefined;

  //   const w = (src as any).width || 0;
  //   const h = (src as any).height || 0;
  //   if (!w || !h) return undefined;

  //   const canvas = document.createElement('canvas');
  //   canvas.width = w;
  //   canvas.height = h;
  //   const ctx = canvas.getContext('2d', { willReadFrequently: true });
  //   if (!ctx) return undefined;

  //   ctx.drawImage(src as any, 0, 0);
  //   const img = ctx.getImageData(0, 0, w, h);
  //   const d = img.data;

  //   // Cho tô toàn bộ vùng có alpha > alphaMin (full background)
  //   // const whiteMin = 200;     // càng cao càng “chỉ nền trắng”
  //   const alphaMin = 0;

  //   for (let i = 0; i < d.length; i += 4) {
  //     const a = d[i + 3];
  //     if (a < alphaMin) { d[i + 3] = 0; continue; }

  //     // Background = alpha 255 (tô được), viền/số = alpha 0 (không tô)
  //     d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
  //     d[i + 3] = a >= alphaMin ? 255 : 0;
  //   }

  //   ctx.putImageData(img, 0, 0);
  //   this.textures.addCanvas(maskKey, canvas);
  //   return maskKey;
  // }

  init(data: { gameData: GameData }) {
    this.dataGame = data.gameData;

    const ballKeys = COLOR_SCENE_ASSETS.ballTextures;
    const marbleKeys = COLOR_SCENE_ASSETS.marbleTextures;

    this.colorLevels = [
      {
        label: 'Bóng',
        total: 2,
        targetColor: COLORS.red,
        objectTextureKeys: ballKeys,
        counts: this.dataGame.ballsBags as [number, number],
      },
      {
        label: 'Bi',
        total: 3,
        targetColor: COLORS.yellow,
        objectTextureKeys: marbleKeys,
        counts: this.dataGame.marblesBags as [number, number],
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
    this.createObjectElements();
    this.layoutBoard();

    this.applyCurrentColorLevel();
    // Đảm bảo bàn tay hiện ngay khi vào màn đầu tiên
    this.time.delayedCall(0, () => {
      this.showPaletteGuideHand(true);
    });
    // Phát voice hướng dẫn cho màn đầu tiên (không ảnh hưởng bàn tay)
    this.playGuideVoiceForCurrentLevel();

    this.boxes.forEach((b) => {
      if (b.image) b.image.on('pointerdown', () => this.onBoxClick(b));
    });

    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutBoard, this);
    });

    this.input.once('pointerdown', () => {
      this.hidePaletteGuideHand();
      // Nếu bé chưa chọn màu sau 3s thì hiện lại bàn tay
      this.paletteGuideHandTimeout = this.time.delayedCall(3000, () => {
        if (!this.selected) {
          this.showPaletteGuideHand(false);
        } else {
          this.showBoxGuideHand();
        }
      });
    });
  }
  // Phát voice hướng dẫn cho từng màn (level) ColorScene qua AudioManager (howler)
  // Phát voice hướng dẫn cho từng màn (level) ColorScene qua AudioManager
  private playGuideVoiceForCurrentLevel() {
    // Ngắt tất cả âm thanh hướng dẫn trước khi phát mới
    const voiceKeys = [
      'voice_guide_color_1',
      'voice_guide_color_2',
    ];
    voiceKeys.forEach((k) => AudioManager.stop(k));
    const key = voiceKeys[this.currentColorLevelIndex] || voiceKeys[0];
    AudioManager.playWhenReady(key);
  }

  // Phát âm thanh đúng

  // Phát âm thanh đúng tiếng Việt, random 1 trong 4 file
  private playCorrectAnswerSound() {
    // Ngắt tất cả voice hướng dẫn trước khi phát âm thanh đúng
    ['voice_guide_color_1', 'voice_guide_color_2'].forEach((k) => AudioManager.stop(k));
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
    // Ngắt tất cả voice hướng dẫn trước khi phát âm thanh sai
    ['voice_guide_color_1', 'voice_guide_color_2'].forEach((k) => AudioManager.stop(k));
    AudioManager.play('sfx_wrong');
  }

  private shakeObject(target: Phaser.GameObjects.Image, intensity = 12, duration = 220) {
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
      let rt: Phaser.GameObjects.RenderTexture | undefined = undefined; // Khai báo rt ở đây

      if (this.textures.exists(numberKey)) {
        image = this.add.image(cx, numberY, numberKey).setOrigin(0.5);
        image.setScale(scale, scale);
        image.setInteractive({ useHandCursor: true });

        // Tạo RenderTexture để vẽ lên đó
        rt = this.add.renderTexture(image.x, image.y, image.displayWidth, image.displayHeight);
        rt.setOrigin(0.5);
        rt.setDepth(image.depth); // rt nằm dưới image số để số/viền luôn ở trên
        rt.setVisible(true); // Đảm bảo renderTexture luôn hiển thị

        // Bỏ mask để tô tự do trên toàn bộ vùng số
        // const maskKey = this.ensureNumberBgMaskTexture(numberKey);
        // if (maskKey) {
        //   const maskSprite = this.add.image(image.x, image.y, maskKey).setOrigin(0.5).setScale(scale);
        //   maskSprite.setVisible(false); // chỉ dùng để mask
        //   rt.setMask(new Phaser.Display.Masks.BitmapMask(this, maskSprite));
        // }

        // Clear tint trên image gốc
        image.clearTint();
        image.setDepth(rt.depth + 2); // Đảm bảo image có depth CAO HƠN RT để số và viền luôn hiện trên màu tô
        image.setVisible(true); // Đảm bảo image luôn hiển thị
        console.log(`[createNumberAssets] Image created for box ${n}: x=${image.x}, y=${image.y}, w=${image.displayWidth}, h=${image.displayHeight}, scale=${image.scaleX}`);
        console.log(`[createNumberAssets] RenderTexture created for box ${n}: x=${rt.x}, y=${rt.y}, w=${rt.displayWidth}, h=${rt.displayHeight}`);
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
        setNumberTint: undefined, // Không cần setTint trực tiếp trên image nữa
        renderTexture: rt, // Gán RenderTexture vào NumBox
        paintProgress: 0, // Khởi tạo tiến trình tô màu
        paintedPixels: new Set<string>(), // Khởi tạo Set theo dõi pixel đã tô
      });
      cx += widths[i] / 2 + gap;

      // Tính toán tổng diện tích có thể tô (số pixel ước tính)
      if (image) {
        const imageArea = (image.width * scale) * (image.height * scale);
        const brushArea = Math.PI * this.paintBrushRadius * this.paintBrushRadius;
        this.totalPaintableArea += Math.ceil(imageArea / (brushArea * 0.5));
      }
    }
    // Sau khi vòng lặp kết thúc, đặt giá trị cố định cho totalPaintableArea nếu muốn
    this.totalPaintableArea = 30; // Ví dụ: ước tính cần 30 lần vẽ để hoàn thành
    console.log(`[createNumberAssets] Adjusted Total Paintable Area: ${this.totalPaintableArea}`);
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
    // Reset trạng thái đã hiện bàn tay, không gọi showPaletteGuideHand ở đây để tránh xóa bàn tay vừa hiện ở create
    this.paletteGuideHandShown = false;
    this.hidePaletteGuideHand();
  }

  private resetForNextColorLevel() {
    this.boxes.forEach((box) => {
      if (box.image) {
        box.image.clearTint();
        // box.image.setVisible(false); // Xóa dòng này
      }
      if (box.renderTexture) {
        box.renderTexture.clear(); // Xóa các nét vẽ trên renderTexture
      }
      box.painted = false;
      box.paintProgress = 0; // Reset tiến trình tô màu
      box.paintedPixels?.clear(); // Xóa các pixel đã tô
    });

    this.applyCurrentColorLevel();
    // Hiển thị lại bàn tay hướng dẫn ở ô màu lần đầu tiên
    this.paletteGuideHandShown = false;
    this.showPaletteGuideHand(true);
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

  private onBoxClick(box: NumBox) {
    // const level = this.getCurrentColorLevel(); // Đã khai báo ở phạm vi lớn hơn, không cần khai báo lại
    console.log(`[onBoxClick] box.n: ${box.n}, level.total: ${this.getCurrentColorLevel().total}, selectedColor: ${this.selected}, targetColor: ${this.getCurrentColorLevel().targetColor}`);

    if (!this.selected) {
      if (box.image) this.shakeObject(box.image);
      this.playWrongSound();
      this.showPaletteGuideHand(false); // Hiện lại chỉ tay ở ô màu
      return;
    }

    const level = this.getCurrentColorLevel();
    const isCorrect = this.selected === level.targetColor && box.n === level.total;

    if (box.painted) {
      if (box.image) this.shakeObject(box.image);
      this.playWrongSound();
      return;
    }

    if (!isCorrect) {
      if (box.image) this.shakeObject(box.image);
      this.playWrongSound();
      this.hideBoxGuideHand();
      this.showPaletteGuideHand(false);
      return;
    }

    // Nếu đúng, bắt đầu tô
    this.isPainting = true;
    this.currentPaintingBox = box;
    this.hideBoxGuideHand(); // Ẩn bàn tay hướng dẫn ở ô số
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
    this.hidePaletteGuideHand(); // Ẩn chỉ tay ở ô màu
    this.showBoxGuideHand(); // Hiện chỉ tay ở ô số
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
    this.numberRowY = innerY + innerH * 0.15;

    // Tăng khoảng cách giữa 2 bóng/bi
    const objSpacing = Math.min(innerW * 0.7, 450);
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
    this.hideBoxGuideHand(); // Ẩn bàn tay ở ô số khi hiện bàn tay ở bảng màu
    // Chỉ hiện lần đầu hoặc khi timeout
    if (first && this.paletteGuideHandShown) return;
    // Nếu đã chọn màu thì không hiện bàn tay ở ô màu nữa
    if (this.selected) return;

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

  private showBoxGuideHand() {
    this.hidePaletteGuideHand(); // Ẩn bàn tay ở ô màu khi hiện bàn tay ở ô số
    this.hideBoxGuideHand(); // Xóa bàn tay cũ nếu có

    // Chỉ hiện khi đã chọn màu nhưng chưa tô đúng
    if (!this.selected) return;
    const level = this.getCurrentColorLevel();
    const box = this.boxes.find(b => b.n === level.total && !b.painted);
    if (!box || !box.image) return;

    if (this.textures.exists('guide_hand')) {
      this.boxGuideHand = this.add.image(box.image.x, box.image.y + 40, 'guide_hand')
        .setOrigin(0.2, 0.1)
        .setScale(0.5)
        .setDepth(100)
        .setAlpha(0.92);
      this.boxGuideHandTween = this.tweens.add({
        targets: this.boxGuideHand,
        y: box.image.y + 10,
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

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.isPainting || !this.currentPaintingBox || !this.selected) return;

    const box = this.currentPaintingBox;
    if (!box.image || !box.renderTexture || !box.paintedPixels) return;

    const bounds = box.image.getBounds();
    if (bounds.contains(pointer.x, pointer.y)) {
      // Chuyển đổi tọa độ con trỏ sang hệ tọa độ của renderTexture
      const localX = pointer.x - (box.renderTexture.x - box.renderTexture.displayWidth / 2);
      const localY = pointer.y - (box.renderTexture.y - box.renderTexture.displayHeight / 2);
      console.log(`[onPointerMove] Pointer: (${pointer.x}, ${pointer.y}), RenderTexture: (${box.renderTexture.x}, ${box.renderTexture.y}), Local: (${localX}, ${localY})`);

      // Cho phép tô đè - vẽ mọi lúc khi di chuyển trong vùng
      // Tạo một key duy nhất cho vùng đã tô
      const key = `${Math.floor(localX / this.paintBrushRadius)},${Math.floor(localY / this.paintBrushRadius)}`;

      // Tạo một graphics object để vẽ hình tròn
      const graphics = this.add.graphics({ fillStyle: { color: this.selected! } });
      graphics.fillCircle(0, 0, this.paintBrushRadius);

      // Vẽ graphics object vào renderTexture
      box.renderTexture.draw(graphics, localX, localY);
      console.log(`[onPointerMove] Drawing graphics to RenderTexture for box ${box.n}.`);
      graphics.destroy(); // Bật lại destroy

      // Tăng progress nếu là vùng mới (cho phép đè nhưng vẫn đếm vùng)
      if (!box.paintedPixels.has(key)) {
        box.paintedPixels.add(key);
        box.paintProgress = (box.paintProgress ?? 0) + 1;
        console.log(`[onPointerMove] paintProgress for box ${box.n}: ${box.paintProgress}`);
      }
    }
  }

  private onPointerUp(_pointer: Phaser.Input.Pointer) {
    if (!this.isPainting || !this.currentPaintingBox) return;

    const box = this.currentPaintingBox;
    const level = this.getCurrentColorLevel();
    const isCorrect = this.selected === level.targetColor && box.n === level.total;

    console.log(`[onPointerUp] Box ${box.n} - isCorrect: ${isCorrect}, box.n: ${box.n}, level.total: ${level.total}, selectedColor: ${this.selected}, targetColor: ${level.targetColor}`);

    // Ngưỡng hoàn thành tô màu (ví dụ: 60% số lượng lần vẽ dự kiến)
    const completionThreshold = 0.7; // Giảm ngưỡng xuống 70% để dễ pass hơn

    console.log(`[onPointerUp] Box ${box.n} - isCorrect: ${isCorrect}, paintProgress: ${box.paintProgress}, Total Area: ${this.totalPaintableArea}, Threshold: ${this.totalPaintableArea * completionThreshold}`);

    const paintProgressMeetsThreshold = (box.paintProgress ?? 0) >= (this.totalPaintableArea * completionThreshold);
    console.log(`[onPointerUp] paintProgressMeetsThreshold: ${paintProgressMeetsThreshold}`);

    console.assert(paintProgressMeetsThreshold === ((box.paintProgress ?? 0) > (this.totalPaintableArea * completionThreshold)), "Assertion failed: paintProgressMeetsThreshold calculation is incorrect");

    if (isCorrect && paintProgressMeetsThreshold) { // Kiểm tra tiến trình tô màu
      console.log(`[onPointerUp] Condition met: Correctly painted!`);
      box.painted = true;
      this.playCorrectSound();
      this.hidePaletteGuideHand();
      this.advanceColorLevel();
    } else {
      console.log(`[onPointerUp] Condition NOT met: isCorrect: ${isCorrect}, paintProgressMeetsThreshold: ${paintProgressMeetsThreshold}. Resetting paint progress.`);
      if (box.renderTexture) {
        box.renderTexture.clear(); // Xóa các nét vẽ trên renderTexture
      }
      box.paintProgress = 0; // Reset tiến trình tô màu
      box.paintedPixels?.clear(); // Xóa các pixel đã tô
      this.playWrongSound();
      this.showPaletteGuideHand(false);
      // Hiện lại chỉ tay ở ô số nếu đã chọn màu
      if (this.selected) {
        this.showBoxGuideHand();
      }
    }

    this.isPainting = false;
    this.currentPaintingBox = undefined;
  }
}
