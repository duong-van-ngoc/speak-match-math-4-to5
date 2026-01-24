import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { COLORS } from '../data/gameData';
import { FLOW_GO_END, type FlowEndPayload } from '../flow/events';
import { BOARD_ASSET_KEYS, COLOR_SCENE_ASSETS, FRONT_BEHIND_SCENE_ASSETS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';

type ColorLevel = {
  label: string;
  mode: 'color' | 'circle';
  targetObjectIndex: number;
  targetColor?: number;
  // asset texture của 2 con mèo (tạm dùng 2 texture sẵn có)
  objectTextureKeys: (string | undefined)[];
};

export class ColorScene extends Phaser.Scene {
  private selected?: number;
  private selectedTool: 'color' | 'eraser' = 'color';
  private levelSolved = false;
  private readonly girlScale = 1.2;
  private readonly catScale = 1.0;
  private readonly catLineartSuffix = '__lineart';
  private readonly catMaskSuffix = '__mask';
  private readonly paletteDotSize = 100;
  private readonly paletteBottomPadding = 15;
  // Negative values move the palette up.
  private readonly paletteYOffset = -10;
  // Negative values move the whole character cluster (girl + cats) up.
  private readonly contentYOffset = -20;
  private readonly paletteDotSpacing = 18;
  private drawing = false;
  private drawPoints: Phaser.Math.Vector2[] = [];
  private drawGfx?: Phaser.GameObjects.Graphics;
  private lastDrawPoint?: Phaser.Math.Vector2;
  private painting = false;
  private paintRT?: Phaser.GameObjects.RenderTexture;
  private paintMaskSprite?: Phaser.GameObjects.Image;
  private paintBrush?: Phaser.GameObjects.Image;
  private paintCellHits = new Set<string>();
  private paintColorCounts = new Map<number, number>();
  private paintGrid = { cols: 10, rows: 10 };
  private paintTargetSize?: { w: number; h: number };

  private boardFallbackGfx?: Phaser.GameObjects.Graphics;
  private boardImage?: Phaser.GameObjects.Image;
  private boardRect = new Phaser.Geom.Rectangle();
  private boardInnerRect = new Phaser.Geom.Rectangle();
  private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;

  private paletteDots: Array<Phaser.GameObjects.Arc | Phaser.GameObjects.Image> = [];
  private paletteCenter?: { x: number; y: number };
  private paletteSelectedIndex = 0;
  private paletteDefs: Array<{ c: number; label: string; spriteKey?: string }> = [
    { c: 0xff5c5c, label: 'ĐỎ', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[0] },
    { c: COLORS.yellow, label: 'VÀNG', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[1] },
    { c: 0x8ccd2a, label: 'XANH LÁ', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[2] },
    { c: 0x1d7fc7, label: 'XANH', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[3] },
    { c: 0x6d53a6, label: 'TÍM', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[4] },
    { c: 0xff5dc8, label: 'HỒNG', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[5] },
    { c: 0xfaf6d8, label: 'TRẮNG', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[6] },
    { c: 0x000000, label: 'ĐEN', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[7] },
    { c: -1, label: 'TẨY', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[8] },
  ];

  // Các object hiển thị (bóng, bi)
  private objects: Phaser.GameObjects.Image[] = [];
  private girl?: Phaser.GameObjects.Image;
  // private objectNumbers: Phaser.GameObjects.Text[] = [];
  private objectPositions?: { leftX: number; rightX: number; y: number };
  private circleGfx?: Phaser.GameObjects.Graphics;
  private circledObjectIndex?: number;
  private userCircleAlpha = 1;
  private userCircleEllipse?: { cx: number; cy: number; w: number; h: number; alpha: number };
  private shakeTweens = new Map<Phaser.GameObjects.GameObject, Phaser.Tweens.Tween>();

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
  private guideHandShowToken = 0;


  private actionGuideHand?: Phaser.GameObjects.Image;
  private actionGuideHandTween?: Phaser.Tweens.Tween;
  private actionGuideHandTimeout?: Phaser.Time.TimerEvent;
  private actionGuideHandMode: 'paint' | 'circle' | undefined = undefined;
  private inactivityTimeout?: Phaser.Time.TimerEvent;

  constructor() {
    super('ColorScene');
  }

  init(_data: { gameData: GameData }) {
    // Level 1: Tô màu vàng vào con mèo đằng trước (object 0)
    // Level 2: Khoanh tròn con mèo đằng sau (object 1)
    // (Chưa có asset mèo trong repo nên tạm dùng texture sẵn có.)
    this.colorLevels = [
      {
        label: 'Tô màu vàng vào con mèo đằng trước',
        mode: 'color',
        targetObjectIndex: 0,
        targetColor: COLORS.yellow,
        objectTextureKeys: [FRONT_BEHIND_SCENE_ASSETS.catFront, FRONT_BEHIND_SCENE_ASSETS.catBehind],
      },
      {
        label: 'Khoanh tròn con mèo đằng sau',
        mode: 'circle',
        targetObjectIndex: 1,
        objectTextureKeys: [FRONT_BEHIND_SCENE_ASSETS.catFront, FRONT_BEHIND_SCENE_ASSETS.catBehind],
      },
    ];
  }

  preload() {
    loadAssetGroups(this, 'shared', 'colorScene', 'ui');
    // Không load audio hướng dẫn ở đây, AudioManager sẽ quản lý và load bằng howler
  }

  create() {
    // Avoid pixel-snapping artifacts on scaled UI assets (palette dots).
    this.cameras.main.setRoundPixels(false);

    // Reset toàn bộ trạng thái logic khi vào lại scene (chơi lại)
    this.currentColorLevelIndex = 0;
    this.paletteSelectedIndex = -1;
    this.selected = undefined;
    this.levelSolved = false;
    this.circledObjectIndex = undefined;
    this.paletteDots = [];
    this.objects = [];
    // Paint-related objects may have been destroyed by Phaser when the scene was stopped,
    // but our references can still point to them. Clear references so ensurePaintForLevel()
    // never tries to reuse a destroyed GameObject.
    this.painting = false;
    this.paintRT = undefined;
    this.paintMaskSprite = undefined;
    this.paintBrush = undefined;
    this.paintTargetSize = undefined;
    this.paintCellHits = new Set<string>();
    this.paintColorCounts.clear();
    this.boardImage = undefined;
    this.bannerBg = undefined;
    this.bannerTextImage = undefined;
    this.girl?.destroy();
    this.girl = undefined;
    if (this.circleGfx) {
      this.circleGfx.destroy();
      this.circleGfx = undefined;
    }
    if (this.drawGfx) {
      this.drawGfx.destroy();
      this.drawGfx = undefined;
    }
    this.ensureCatDerivedTextures();
    this.boardFallbackGfx = this.add.graphics().setDepth(0);
    this.layoutBoard();
    this.scale.on('resize', this.layoutBoard, this);

    this.colorLevelLabel = this.add
      .text(this.boardRect.centerX, this.boardRect.y + 18, '', {
        fontFamily: 'Baloo, Arial',
        fontSize: '66px', // tăng kích thước chữ banner từ 44px lên 66px cho Full HD
        color: '#0b1b2a',
      })
      .setOrigin(0.5, 0)
      .setDepth(6);
    this.colorLevelLabel.setVisible(false);

    this.createPaletteElements();
    this.createObjectElements();
    this.createGirl();
    // Drawn circle preview should be above all characters.
    this.drawGfx = this.add.graphics().setDepth(220);
    this.layoutBoard();

    this.applyCurrentColorLevel();
    // Đảm bảo bàn tay hiện ngay khi vào màn đầu tiên, nhưng nếu người chơi chạm cực sớm
    // (trước khi delayedCall chạy) thì không hiện bàn tay lại sau cú chạm đó.
    // Hiển thị bàn tay chỉ vào bảng màu khi bắt đầu.
    this.time.delayedCall(100, () => {
      this.showPaletteGuideHand(true);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutBoard, this);
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.inactivityTimeout?.remove(false);
      this.inactivityTimeout = undefined;
    });

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.resetInactivityTimer();
  }
  // Phát voice hướng dẫn cho từng màn (level) ColorScene qua AudioManager
  private playGuideVoiceForCurrentLevel() {
    const key = this.currentColorLevelIndex === 0 ? 'voice_guide_color_1' : 'voice_guide_color_2';

    // Dừng CẢ các câu khen ngợi cũ và voice hướng dẫn cũ để tránh lồng tiếng và xung đột âm lượng
    const allVoiceKeys = [
      'voice_guide_color_1',
      'voice_guide_color_2',
      'correct_answer_1',
      'correct_answer_2',
      'correct_answer_3',
      'correct_answer_4'
    ];

    allVoiceKeys.forEach(k => {
      // Dừng tất cả trừ cái sắp phát
      if (k !== key) AudioManager.stop(k);
    });

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

  private shakeAsset(target?: Phaser.GameObjects.GameObject) {
    if (!target) return;
    const obj = target as any;
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return;

    // Stop any existing shake on this object.
    const existing = this.shakeTweens.get(target);
    if (existing) {
      existing.stop();
      this.shakeTweens.delete(target);
    }
    this.tweens.killTweensOf(obj);

    const baseX = obj.x;
    const baseY = obj.y;

    const amp = 10;
    const tween = this.tweens.add({
      targets: obj,
      x: baseX + amp,
      duration: 55,
      yoyo: true,
      repeat: 4,
      ease: 'Sine.easeInOut',
      onStop: () => {
        obj.x = baseX;
        obj.y = baseY;
      },
      onComplete: () => {
        obj.x = baseX;
        obj.y = baseY;
        this.shakeTweens.delete(target);
      },
    });
    this.shakeTweens.set(target, tween);
  }

  private resolveTextureKey(level: ColorLevel, index: number) {
    const preferred = level.objectTextureKeys[index] ?? level.objectTextureKeys[0];
    if (preferred) {
      const mapped = this.mapObjectTextureKey(preferred);
      if (mapped && this.textures.exists(mapped)) return mapped;
      if (this.textures.exists(preferred)) return preferred;
    }
    for (const key of level.objectTextureKeys) {
      if (!key) continue;
      const mapped = this.mapObjectTextureKey(key);
      if (mapped && this.textures.exists(mapped)) return mapped;
      if (this.textures.exists(key)) return key;
    }
    return preferred ?? '';
  }

  private mapObjectTextureKey(key: string) {
    // Prefer derived line-art textures for cats if available.
    if (key === FRONT_BEHIND_SCENE_ASSETS.catFront || key === FRONT_BEHIND_SCENE_ASSETS.catBehind) {
      const lineKey = `${key}${this.catLineartSuffix}`;
      if (this.textures.exists(lineKey)) return lineKey;
    }
    return key;
  }

  private isCatBaseKey(key: string) {
    return key === FRONT_BEHIND_SCENE_ASSETS.catFront || key === FRONT_BEHIND_SCENE_ASSETS.catBehind;
  }

  private getBaseCatKeyFromTextureKey(textureKey: string) {
    if (textureKey.endsWith(this.catLineartSuffix)) return textureKey.slice(0, -this.catLineartSuffix.length);
    if (textureKey.endsWith(this.catMaskSuffix)) return textureKey.slice(0, -this.catMaskSuffix.length);
    return textureKey;
  }

  private getPaintMaskTextureKeyForTarget(target: Phaser.GameObjects.Image) {
    const baseKey = this.getBaseCatKeyFromTextureKey(target.texture.key);
    if (!this.isCatBaseKey(baseKey)) return target.texture.key;
    const maskKey = `${baseKey}${this.catMaskSuffix}`;
    return this.textures.exists(maskKey) ? maskKey : target.texture.key;
  }

  private ensureCatDerivedTextures() {
    const catBaseKeys = [FRONT_BEHIND_SCENE_ASSETS.catFront, FRONT_BEHIND_SCENE_ASSETS.catBehind];
    for (const baseKey of catBaseKeys) {
      if (!this.textures.exists(baseKey)) continue;

      const lineKey = `${baseKey}${this.catLineartSuffix}`;
      const maskKey = `${baseKey}${this.catMaskSuffix}`;
      if (this.textures.exists(lineKey) && this.textures.exists(maskKey)) continue;

      try {
        this.textures.get(baseKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      } catch { }

      const tex = this.textures.get(baseKey);
      const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
      if (!src) continue;

      const width = (src as any).width || 0;
      const height = (src as any).height || 0;
      if (!width || !height) continue;

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      if (!sourceCtx) continue;
      sourceCtx.drawImage(src as any, 0, 0);
      const sourceImage = sourceCtx.getImageData(0, 0, width, height);

      const lineCanvas = document.createElement('canvas');
      lineCanvas.width = width;
      lineCanvas.height = height;
      const lineCtx = lineCanvas.getContext('2d', { willReadFrequently: true });
      if (!lineCtx) continue;
      const lineImage = lineCtx.createImageData(width, height);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      if (!maskCtx) continue;
      const maskImage = maskCtx.createImageData(width, height);

      const d = sourceImage.data;
      const outLine = lineImage.data;
      const outMask = maskImage.data;

      const inkFullAt = 120;
      const inkFadeOutAt = 210;
      const inkRange = Math.max(1, inkFadeOutAt - inkFullAt);

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const a = d[i + 3];

        if (a === 0) continue;

        // Background removal: detect a "green screen" like pixel.
        const isGreenBg = g > 60 && g > r + 18 && g > b + 18;
        if (isGreenBg) continue;

        // Mask: keep original edge alpha (smoother mask).
        outMask[i] = 255;
        outMask[i + 1] = 255;
        outMask[i + 2] = 255;
        outMask[i + 3] = a;

        // Line-art: keep anti-aliased dark strokes.
        const brightness = (r + g + b) / 3;
        const t = (inkFadeOutAt - brightness) / inkRange; // 1..0 (roughly)
        const ink = Math.max(0, Math.min(1, t));
        const alpha = Math.round(a * ink);
        if (alpha > 0) {
          outLine[i] = 0;
          outLine[i + 1] = 0;
          outLine[i + 2] = 0;
          outLine[i + 3] = alpha;
        }
      }

      lineCtx.putImageData(lineImage, 0, 0);
      maskCtx.putImageData(maskImage, 0, 0);

      if (!this.textures.exists(lineKey)) this.textures.addCanvas(lineKey, lineCanvas);
      if (!this.textures.exists(maskKey)) this.textures.addCanvas(maskKey, maskCanvas);
      try {
        this.textures.get(lineKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.textures.get(maskKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      } catch { }
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
      const textureKey = this.resolveTextureKey(level, i);
      const x = i === 0 ? pos.leftX : pos.rightX;
      const obj = this.add.image(x, 0, textureKey).setScale(0.4, 0.4);
      obj.setInteractive({ useHandCursor: false });
      obj.on('pointerover', () => this.updatePaintHoverCursor(i, true));
      obj.on('pointerout', () => this.updatePaintHoverCursor(i, false));
      this.objects.push(obj);
      // Không tạo label số trên object
    }
  }

  private createGirl() {
    const key = FRONT_BEHIND_SCENE_ASSETS.girl;
    if (!this.textures.exists(key)) return;
    try {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    } catch { }
    this.girl = this.add.image(0, 0, key).setOrigin(0.5).setDepth(35);
  }

  private applyCurrentColorLevel() {
    const level = this.getCurrentColorLevel();
    this.levelSolved = false;
    this.circledObjectIndex = undefined;
    this.userCircleAlpha = 1;
    this.clearCircle();
    this.clearUserDrawing();
    this.clearPaint();
    this.hideActionGuideHand();


    this.objects.forEach((obj, i) => {
      const textureKey = this.resolveTextureKey(level, i);
      if (textureKey && this.textures.exists(textureKey)) {
        obj.setTexture(textureKey).setVisible(true);
      } else {
        obj.setVisible(false);
      }
      obj.clearTint();
    });

    if (level.mode === 'color') {
      // Layer order:
      // - Girl: NORMAL
      // - Paint RenderTexture: MULTIPLY (masked to cat shape)
      // - Cat: MULTIPLY
      this.objects.forEach((obj, i) =>
        obj
          .setDepth(i === 0 ? 130 : 120)
          .setBlendMode(Phaser.BlendModes.MULTIPLY)
      );
      this.girl?.setDepth(100).setBlendMode(Phaser.BlendModes.NORMAL);

      // Không tự động chọn màu khi vào màn hoặc đổi màn
      this.paletteSelectedIndex = -1;
      this.selected = undefined;
      this.paletteDots.forEach((_, i) => this.updatePaletteStroke(i));
      this.setPaletteVisible(true);
      this.updatePaintHoverCursor(undefined, false);
    } else {
      this.objects.forEach((obj, i) =>
        obj
          // Keep cats above the girl.
          .setDepth(i === 0 ? 130 : 120)
          .setBlendMode(Phaser.BlendModes.NORMAL)
      );
      this.girl?.setDepth(100).setBlendMode(Phaser.BlendModes.NORMAL);

      this.paletteSelectedIndex = -1;
      this.selected = undefined;
      this.setPaletteVisible(false);
      // Circle mode: show crosshair cursor.
      this.setCanvasCursor('crosshair');
    }

    this.updateColorLevelLabel();
    this.positionObjects();
    this.ensurePaintForLevel();
    this.updateBannerTextImage();
    // PHÁT VOICE HƯỚNG DẪN:
    const win = window as any;
    if (win.__audioUnlocked__) {
      this.playGuideVoiceForCurrentLevel();
    } else {
      this.input.once('pointerdown', () => {
        this.playGuideVoiceForCurrentLevel();
      });
    }

    // Reset trạng thái đã hiện bàn tay, không gọi showPaletteGuideHand ở đây để tránh xóa bàn tay vừa hiện ở create
    this.paletteGuideHandShown = false;
    this.hidePaletteGuideHand();
    if (level.mode === 'color') {
      const token = ++this.guideHandShowToken;
      this.time.delayedCall(0, () => {
        if (token !== this.guideHandShowToken) return;
        this.showPaletteGuideHand(true);
      });
    } else if (level.mode === 'circle') {
      // Inactivity timer serves as the 10s waiter for the circle guide
      this.resetInactivityTimer();
    }

  }

  private resetForNextColorLevel() {
    this.objects.forEach((obj) => obj.clearTint());
    this.clearCircle();
    this.clearUserDrawing();
    this.clearPaint();

    this.applyCurrentColorLevel();
    // Hiển thị lại bàn tay hướng dẫn ở ô màu lần đầu tiên (nếu là màn tô màu)
    const level = this.getCurrentColorLevel();
    if (level.mode === 'color') {
      this.paletteGuideHandShown = false;
      this.showPaletteGuideHand(true);
      this.hidePaletteGuideHand();
    }
  }

  private advanceColorLevel() {
    this.time.delayedCall(2000, () => {
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

  private onLevelSuccess() {
    this.levelSolved = true;
    this.playCorrectSound();
    this.hidePaletteGuideHand();
    this.hideActionGuideHand();
    this.advanceColorLevel();
  }

  private clearCircle() {
    this.circledObjectIndex = undefined;
    this.userCircleEllipse = undefined;
    if (this.circleGfx) this.circleGfx.clear();
  }

  private redrawCircle() {
    if (this.circledObjectIndex == null) return;
    const obj = this.objects[this.circledObjectIndex];
    if (!obj) return;

    if (!this.circleGfx) {
      // Final circle should be above all characters.
      this.circleGfx = this.add.graphics().setDepth(230);
    }
    this.circleGfx.clear();
    const ellipse = this.userCircleEllipse;
    if (ellipse) {
      this.circleGfx.lineStyle(4, 0x000000, Phaser.Math.Clamp(ellipse.alpha, 0.5, 1));
      this.circleGfx.strokeEllipse(ellipse.cx, ellipse.cy, ellipse.w, ellipse.h);
      return;
    }

    // Fallback (should be rare): circle around target bounds.
    const b = obj.getBounds();
    this.circleGfx.lineStyle(4, 0x000000, Phaser.Math.Clamp(this.userCircleAlpha, 0.55, 1));
    this.circleGfx.strokeEllipse(b.centerX, b.centerY, b.width * 1.35, b.height * 1.25);
  }

  private clearUserDrawing() {
    this.drawing = false;
    this.drawPoints = [];
    this.lastDrawPoint = undefined;
    this.drawGfx?.clear();
  }

  private ensurePaintForLevel() {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;

    const target = this.objects[level.targetObjectIndex];
    if (!target || !target.visible) return;

    const w = Math.max(1, Math.round(target.displayWidth));
    const h = Math.max(1, Math.round(target.displayHeight));
    const needsRecreate = !this.paintRT || !this.paintTargetSize || this.paintTargetSize.w !== w || this.paintTargetSize.h !== h;

    if (needsRecreate) {
      this.clearPaint();
      this.paintTargetSize = { w, h };

      // Paint layer: NORMAL, above girl, below cat.
      // MULTIPLY can make paint effectively invisible when the destination pixels are transparent.
      const paintDepth = target.depth - 1;
      this.paintRT = this.add
        .renderTexture(target.x, target.y, w, h)
        .setOrigin(0.5)
        .setDepth(paintDepth)
        .setBlendMode(Phaser.BlendModes.NORMAL);

      // Mask: shape of cat, alpha=1
      const maskSprite = this.add
        .image(target.x, target.y, this.getPaintMaskTextureKeyForTarget(target))
        .setOrigin(target.originX, target.originY)
        .setDisplaySize(target.displayWidth, target.displayHeight)
        .setDepth(-1000)
        .setAlpha(1);
      this.paintMaskSprite = maskSprite;
      this.paintRT.setMask(new Phaser.Display.Masks.BitmapMask(this, maskSprite));

      // Brush
      if (!this.textures.exists('__paint_brush__')) {
        const g = this.add.graphics({ x: 0, y: 0 });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(18, 18, 18);
        g.generateTexture('__paint_brush__', 36, 36);
        g.destroy();
      }
      this.paintBrush = this.add
        .image(-10000, -10000, '__paint_brush__')
        .setVisible(true)
        .setDepth(-2000);
      this.paintBrush.setBlendMode(Phaser.BlendModes.NORMAL);

      this.paintCellHits = new Set<string>();
      this.paintColorCounts.clear();
    } else {
      const paintRT = this.paintRT;
      if (!paintRT) return;
      paintRT.setPosition(target.x, target.y);
      paintRT.setDepth(target.depth - 1);
      paintRT.setBlendMode(Phaser.BlendModes.NORMAL);
      if (this.paintMaskSprite) {
        this.paintMaskSprite.setPosition(target.x, target.y);
        this.paintMaskSprite.setDisplaySize(target.displayWidth, target.displayHeight);
        this.paintMaskSprite.setTexture(this.getPaintMaskTextureKeyForTarget(target));
      }
    }
  }

  private clearPaint() {
    this.painting = false;
    this.paintCellHits.clear();
    this.paintColorCounts.clear();
    this.paintRT?.destroy();
    this.paintRT = undefined;
    this.paintMaskSprite?.destroy();
    this.paintMaskSprite = undefined;
    this.paintBrush?.destroy();
    this.paintBrush = undefined;
    this.paintTargetSize = undefined;
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
      try {
        this.textures.get(def.spriteKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
      } catch { }
      return this.add.image(0, 0, def.spriteKey).setOrigin(0.5);
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
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    this.paletteSelectedIndex = index;
    const def = this.paletteDefs[index];
    if (def.c === -1) {
      this.selectedTool = 'eraser';
      this.selected = undefined;
    } else {
      this.selectedTool = 'color';
      this.selected = def.c;
    }
    this.paletteDots.forEach((_, i) => this.updatePaletteStroke(i));
    // If the mouse is already hovering a cat, update cursor immediately.
    this.updatePaintHoverCursor(undefined, false);

    // After selecting a color, guide the child to paint the target cat.
    if (this.selectedTool === 'color' && this.selected !== undefined) {
      this.hidePaletteGuideHand();
      this.showPaintGuideHand();
    }

    this.resetInactivityTimer();
  }

  private setCanvasCursor(cursor: string) {
    try {
      this.input.manager.canvas.style.cursor = cursor;
    } catch { }
  }

  private updatePaintHoverCursor(hoverObjectIndex: number | undefined, isOver: boolean) {
    const level = this.getCurrentColorLevel();
    if (level.mode === 'circle') {
      // Circle mode: always show crosshair cursor.
      this.setCanvasCursor('crosshair');
      return;
    }
    if (level.mode === 'color') {
      // Tô màu: con trỏ là bàn tay khi hover đúng mèo, not-allowed khi hover sai, default khi không hover
      const canPaint = this.selectedTool === 'eraser' || this.selected !== undefined;
      if (!isOver && hoverObjectIndex === undefined) return;
      if (!isOver) {
        this.setCanvasCursor('default');
        return;
      }
      if (!canPaint) {
        this.setCanvasCursor('default');
        return;
      }
      const isTarget = hoverObjectIndex === level.targetObjectIndex;
      this.setCanvasCursor(isTarget ? 'pointer' : 'not-allowed');
      return;
    }
    this.setCanvasCursor('default');
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
    const maxW = Math.min(1800, w * 0.94); // Tăng từ 1200 lên 1800 cho Full HD
    // Make the board a bit taller so there's more room for the palette row.
    const maxH = Math.min(920, h * 0.9); // Tăng từ 610 lên 920 cho Full HD
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
    const boardY = Math.max(60, h * 0.12);

    this.boardRect.setTo(boardX, boardY, boardW, boardH);

    const padX = boardW * 0.05;
    const padTop = boardH * 0.15;
    // Increase bottom padding to keep content from crowding the palette.
    const padBottom = boardH * 0.24;

    const innerX = boardX + padX;
    const innerY = boardY + padTop;
    const innerW = boardW - padX * 2;
    const innerH = boardH - padTop - padBottom;

    this.boardInnerRect.setTo(innerX, innerY, innerW, innerH);

    // Tăng khoảng cách giữa 2 bóng/bi
    const objSpacing = Math.min(innerW * 0.72, 440);
    // Bố cục giống hình tham chiếu: mèo nằm/sit ở gần đáy, cô gái lớn ở giữa
    const objY = innerY + innerH * 0.67 + this.contentYOffset;
    this.objectPositions = {
      leftX: this.boardInnerRect.centerX - objSpacing / 2,
      rightX: this.boardInnerRect.centerX + objSpacing / 2,
      y: objY,
    };

    // Thang màu ở dưới đáy board
    this.paletteCenter = {
      x: innerX + innerW / 2,
      // Use board bottom (not inner rect) so the palette sits at the very bottom.
      // `y` is the center of the dots.
      y: boardY + boardH - (this.paletteDotSize / 2 + this.paletteBottomPadding) + this.paletteYOffset,
    };

    this.createBoardImageIfNeeded();
    if (this.boardImage) {
      this.boardImage.setPosition(boardX + boardW / 2, boardY + boardH / 2);
      this.boardImage.setDisplaySize(boardW, boardH);
      this.boardFallbackGfx.clear();
    } else {
      this.drawBoardFrame();
    }

    this.updatePalettePositions();
    this.positionGirl();
    this.positionObjects();
    this.ensurePaintForLevel();
    this.redrawCircle();
    this.ensureBannerAssets();
    this.updateColorLevelLabel();
    this.repositionGuideHands();
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

  private positionObjects() {
    if (!this.objects.length || !this.objectPositions) return;

    // If the girl asset exists, position both cats relative to her so they "fit" into her hands/ground cutout.
    if (this.girl) {
      const b = this.girl.getBounds();
      const paletteTop =
        (this.paletteCenter?.y ?? (this.boardInnerRect.y + this.boardInnerRect.height)) -
        this.paletteDotSize / 2 -
        8;

      const front = this.objects[0];
      const behind = this.objects[1];

      // Layout ratios are taken from the design spec (in px) relative to the original girl asset size.
      // Girl: 1672.63 x 1140
      const girlW = 1672.63;
      const girlH = 1140;
      const frontBox = { left: 448.28, top: 684.63, w: 282.61, h: 229.96 };
      const behindBox = { left: 1084.07, top: 449.96, w: 468.15, h: 502.07 };

      const placeFromBox = (
        obj: Phaser.GameObjects.Image,
        box: { left: number; top: number; w: number; h: number },
        scaleMul: number,
        offsetXRatio: number,
        offsetYRatio: number
      ) => {
        const cxRatio = (box.left + box.w / 2) / girlW;
        const cyRatio = (box.top + box.h / 2) / girlH;
        const targetW = b.width * (box.w / girlW) * scaleMul * this.catScale;
        const targetH = b.height * (box.h / girlH) * scaleMul * this.catScale;

        // Keep the cat's aspect ratio; scale to "cover" the target box so it won't look squeezed/small.
        const ratio = this.getTextureRatio(obj.texture.key) ?? 1;
        let w = targetW;
        let h = targetH;
        if (ratio > 0) {
          const wFromH = targetH * ratio;
          const hFromW = targetW / ratio;
          if (wFromH < targetW) {
            // Height-based size is too narrow → fit by width.
            w = targetW;
            h = hFromW;
          } else {
            // Fit by height (covers width).
            w = wFromH;
            h = targetH;
          }
        }
        obj.setDisplaySize(w, h);

        // Keep cats above palette row (taking their size into account).
        const desiredY = b.top + b.height * (cyRatio + offsetYRatio);
        const y = Math.min(desiredY, paletteTop - h / 2 - 4);
        obj.setPosition(
          b.left + b.width * (cxRatio + offsetXRatio),
          y
        );
      };

      if (front) {
        // Make the front cat a bit bigger and slightly left to match the sample layout.
        // Nudge: move right + down a bit (per request).
        placeFromBox(front, frontBox, 1.75, -0.105, 0.045);
      }

      if (behind) {
        // Nudge: move down a bit (per request).
        placeFromBox(behind, behindBox, 0.95, 0, 0.01);
      }

      return;
    }

    const { leftX, rightX, y } = this.objectPositions;
    const xs = [leftX, rightX];

    // Fallback positioning when the girl asset is missing.
    this.objects.forEach((obj, index) => {
      const targetX = xs[index] ?? xs[0];
      obj.setPosition(targetX, y);

      const targetH = this.boardInnerRect.height * 0.3;
      const ratio = this.getTextureRatio(obj.texture.key) ?? 1;
      obj.setDisplaySize(targetH * ratio, targetH);
    });

    // Không reposition label số trên object
  }

  private positionGirl() {
    if (!this.girl) return;
    const x = this.boardInnerRect.centerX;

    // Scale up girl as much as possible while keeping room for the palette at the bottom.
    const paletteTop =
      (this.paletteCenter?.y ?? (this.boardInnerRect.y + this.boardInnerRect.height)) -
      this.paletteDotSize / 2 -
      8;

    // Allow a bit of overlap into the palette area so changing `girlScale` has visible effect
    // even when the layout is already tightly packed.
    const bottomOverlap = Math.max(8, Math.round(this.paletteDotSize * 0.3));
    const availableH = Math.max(120, paletteTop - this.boardInnerRect.y + bottomOverlap);

    const ratio = this.getTextureRatio(this.girl.texture.key) ?? 1;
    const maxH = Math.min(this.boardInnerRect.height * 1.1, availableH);
    const baseH = maxH * 0.98;
    let targetH = baseH * this.girlScale;
    let targetW = targetH * ratio;
    const maxW = this.boardInnerRect.width * 0.9;
    if (targetW > maxW) {
      targetW = maxW;
      if (ratio > 0) targetH = targetW / ratio;
    }

    // Bottom-align girl to sit on the same floor line as cats (like the reference image).
    const bottomY = paletteTop - 8 + bottomOverlap + this.contentYOffset;
    const y = bottomY - targetH / 2;

    this.girl.setDisplaySize(targetW, targetH);
    this.girl.setPosition(x, y);
  }

  private updatePalettePositions() {
    if (!this.paletteCenter) return;
    const y = this.paletteCenter.y;
    const paletteCount = this.paletteDots.length;
    // All dots have the same size
    const dotWidth = this.paletteDotSize;
    const dotHeight = this.paletteDotSize;
    const border = 2;
    const dotSpacing = this.paletteDotSpacing;
    // Center the palette horizontally within the board
    const totalWidth = paletteCount * dotWidth + (paletteCount - 1) * dotSpacing;
    const startX = this.boardInnerRect.centerX - totalWidth / 2 + dotWidth / 2;
    this.paletteDots.forEach((dot, index) => {
      const dx = startX + index * (dotWidth + dotSpacing);
      dot.setPosition(dx, y);
      // Set all dots to the same size
      if (dot instanceof Phaser.GameObjects.Image) {
        // Palette dot PNGs already include a border; keep them at full size to avoid distortion.
        dot.setDisplaySize(dotWidth, dotHeight);
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
    const maxWidth = Math.min(this.scale.width * 0.9, 1100);
    const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;
    const targetWidth = Math.min(maxWidth, this.boardRect.width * 0.9);
    const targetHeight = bgRatio ? targetWidth / bgRatio : this.bannerBg.displayHeight;
    const x = this.boardRect.centerX;
    const y = Math.max(targetHeight / 2 + 5, this.boardRect.y - targetHeight / 2 - 4);
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
  private showPaletteGuideHand(first: boolean) {
    // Chỉ hiện lần đầu hoặc khi timeout
    if (first && this.paletteGuideHandShown) return;
    // Xóa bàn tay cũ nếu có
    this.hidePaletteGuideHand();
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color' || !level.targetColor) return;
    const paletteIndex = this.paletteDefs.findIndex(def => def.c === level.targetColor);
    const paletteDot = this.paletteDots[paletteIndex];
    if (paletteDot && this.textures.exists('guide_hand')) {
      // Nudge: move a bit up for better pointing.
      this.paletteGuideHand = this.add.image(paletteDot.x + 20, paletteDot.y - 8, 'guide_hand')
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



  private hideActionGuideHand() {
    this.actionGuideHandTimeout?.remove(false);
    this.actionGuideHandTimeout = undefined;
    this.actionGuideHandTween?.stop();
    this.actionGuideHandTween = undefined;
    this.actionGuideHand?.destroy();
    this.actionGuideHand = undefined;
    this.actionGuideHandMode = undefined;
  }

  private resetInactivityTimer() {
    this.inactivityTimeout?.remove(false);
    const level = this.getCurrentColorLevel();
    // Use 10s wait for initial circle mode guidance, transparently using inactivity system
    const delay = (level && level.mode === 'circle') ? 10000 : 3000;
    this.inactivityTimeout = this.time.delayedCall(delay, () => this.onInactivity());
  }

  private onInactivity() {
    const level = this.getCurrentColorLevel();
    if (this.levelSolved) return;

    if (level.mode === 'color') {
      if (this.painting) return;
      if (this.paletteSelectedIndex === -1) {
        this.showPaletteGuideHand(false);
      } else {
        this.showPaintGuideHand();
      }
      return;
    }

    if (level.mode === 'circle') {
      if (this.drawing) return;
      this.showCircleGuideHand(false);
    }
  }

  private ensureActionGuideHand() {
    if (this.actionGuideHand && this.actionGuideHand.scene) return this.actionGuideHand;
    if (!this.textures.exists('guide_hand')) return undefined;
    this.actionGuideHand = this.add.image(0, 0, 'guide_hand').setOrigin(0.2, 0.2).setDepth(240);
    try {
      this.textures.get('guide_hand').setFilter(Phaser.Textures.FilterMode.LINEAR);
    } catch { }
    return this.actionGuideHand;
  }

  private positionPaintGuideHand() {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    const hand = this.actionGuideHand;
    if (!hand) return;
    const target = this.objects[level.targetObjectIndex];
    if (!target || !target.visible) return;
    const b = target.getBounds();
    // Point at the cat, shifted down slightly as requested.
    hand.setPosition(b.centerX, b.centerY + 50);
    hand.setRotation(0); // Point straight up (along Y axis)
    hand.setScale(0.5);
  }

  private showPaintGuideHand() {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    if (this.levelSolved) return;
    if (this.selectedTool === 'color' && this.selected === undefined) return;

    const hand = this.ensureActionGuideHand();
    if (!hand) return;
    if (this.actionGuideHandMode === 'paint' && hand.visible) return;

    this.actionGuideHandMode = 'paint';
    this.positionPaintGuideHand();
    hand.setVisible(true);

    this.actionGuideHandTween?.stop();
    // Hand just points/pulses, does not move around.
    this.actionGuideHandTween = this.tweens.add({
      targets: hand,
      scale: { from: 0.5, to: 0.4 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.actionGuideHandTimeout?.remove(false);
    this.actionGuideHandTimeout = this.time.delayedCall(4500, () => this.hideActionGuideHand());
  }

  private showCircleGuideHand(first: boolean) {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'circle') return;
    if (this.levelSolved || this.drawing) return;

    const hand = this.ensureActionGuideHand();
    if (!hand) return;
    if (this.actionGuideHandMode === 'circle' && hand.visible) return;

    const target = this.objects[level.targetObjectIndex];
    if (!target || !target.visible) return;
    const b = target.getBounds();

    this.actionGuideHandMode = 'circle';
    hand.setVisible(true);
    hand.setRotation(-0.2);
    hand.setScale(0.7);

    const rx = Math.max(40, b.width * 0.55);
    const ry = Math.max(40, b.height * 0.45);
    const cx = b.centerX;
    const cy = b.centerY;

    const driver = { t: 0 };
    this.actionGuideHandTween?.stop();
    this.actionGuideHandTween = this.tweens.add({
      targets: driver,
      t: 1,
      duration: first ? 1700 : 1400,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => {
        const angle = driver.t * Math.PI * 2;
        hand.setPosition(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
      },
    });

    this.actionGuideHandTimeout?.remove(false);
    this.actionGuideHandTimeout = this.time.delayedCall(5500, () => this.hideActionGuideHand());
  }

  private repositionGuideHands() {
    if (!this.actionGuideHandMode || !this.actionGuideHand) return;
    if (this.actionGuideHandMode === 'paint') this.positionPaintGuideHand();
    if (this.actionGuideHandMode === 'circle') this.showCircleGuideHand(false);
  }

  private setPaletteVisible(visible: boolean) {
    this.paletteDots.forEach((dot) => {
      (dot as any).setVisible?.(visible);
    });
  }

  private isPointerInBoard(pointer: Phaser.Input.Pointer) {
    return this.boardRect.contains(pointer.x, pointer.y);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    const level = this.getCurrentColorLevel();
    this.resetInactivityTimer();

    if (level.mode === 'color') {
      // Only dismiss/cancel if the player actually interacts with the board area.
      if (!this.isPointerInBoard(pointer)) return;

      // If a guide-hand show is pending on the next tick, cancel it.
      this.guideHandShowToken++;

      // We no longer hide the palette guide hand here on any click.
      // It is specifically hidden in applyPaletteSelection when a color is chosen.
      if (this.paletteSelectedIndex === -1) {
        // Keep or refresh the timeout to show it again if they stay idle.
        this.paletteGuideHandTimeout?.remove(false);
        this.paletteGuideHandTimeout = this.time.delayedCall(3000, () => {
          if (this.getCurrentColorLevel().mode !== 'color') return;
          if (this.paletteSelectedIndex === -1) this.showPaletteGuideHand(false);
        });
      }
      if (this.levelSolved) return;

      const target = this.objects[level.targetObjectIndex];
      if (!target || !target.visible) return;

      // Require a tool selection (color or eraser) before painting.
      if (this.selectedTool === 'color' && this.selected === undefined) return;

      // If they press on the wrong cat (and not also on the target), it's wrong.
      const otherIndex = level.targetObjectIndex === 0 ? 1 : 0;
      const other = this.objects[otherIndex];
      const inTarget = target.getBounds().contains(pointer.x, pointer.y);
      const inOther = !!other && other.visible && other.getBounds().contains(pointer.x, pointer.y);
      if (inOther && !inTarget) {
        this.shakeAsset(other);
        this.playWrongSound();
        this.time.delayedCall(650, () => this.showPaintGuideHand());
        return;
      }

      if (!inTarget) return;

      // Starting to paint: hide the guidance hand.
      this.hideActionGuideHand();
      this.ensurePaintForLevel();
      this.painting = true;
      this.stampPaint(pointer);
      return;
    }

    // Circle mode: start drawing.
    if (this.levelSolved) return;
    if (!this.isPointerInBoard(pointer)) return;
    this.setCanvasCursor('crosshair');
    this.hideActionGuideHand();
    this.clearUserDrawing();
    this.drawing = true;
    const p = new Phaser.Math.Vector2(pointer.x, pointer.y);
    this.drawPoints.push(p);
    this.lastDrawPoint = p;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    const level = this.getCurrentColorLevel();
    this.resetInactivityTimer();

    if (level.mode === 'circle') {
      this.setCanvasCursor('crosshair');
    }

    if (level.mode === 'color') {
      if (!this.painting || this.levelSolved) return;
      if (!pointer.isDown) return;
      this.stampPaint(pointer);
      return;
    }

    if (level.mode !== 'circle') return;
    if (!this.drawing || this.levelSolved) return;
    if (!pointer.isDown) return;

    const last = this.lastDrawPoint;
    const next = new Phaser.Math.Vector2(pointer.x, pointer.y);
    if (last && Phaser.Math.Distance.Between(last.x, last.y, next.x, next.y) < 6) return;

    this.drawPoints.push(next);
    this.lastDrawPoint = next;

    if (last) {
      this.drawGfx?.lineStyle(4, 0x000000, 1);
      this.drawGfx?.beginPath();
      this.drawGfx?.moveTo(last.x, last.y);
      this.drawGfx?.lineTo(next.x, next.y);
      this.drawGfx?.strokePath();
      this.drawGfx?.closePath();
    }
  }

  private onPointerUp(_pointer: Phaser.Input.Pointer) {
    const level = this.getCurrentColorLevel();
    this.resetInactivityTimer();

    if (level.mode === 'color') {
      if (!this.painting || this.levelSolved) return;
      this.painting = false;

      // Consider the level complete when enough of the mask area has been painted.
      const totalCells = this.paintGrid.cols * this.paintGrid.rows;
      const ratio = totalCells > 0 ? this.paintCellHits.size / totalCells : 0;
      if (ratio >= 0.55) {
        const dominant = this.getDominantPaintColor();
        if (dominant === COLORS.yellow) {
          // Fill completely with the correct color
          this.paintRT?.fill(COLORS.yellow);
          this.onLevelSuccess();
        } else {
          this.shakeAsset(this.objects[level.targetObjectIndex]);
          this.playWrongSound();
          this.time.delayedCall(250, () => this.clearPaint());
          this.ensurePaintForLevel();
          this.time.delayedCall(650, () => this.showPaintGuideHand());
        }
      }
      return;
    }

    if (level.mode !== 'circle') return;
    if (!this.drawing || this.levelSolved) return;
    this.drawing = false;
    this.setCanvasCursor('crosshair');

    const ok = this.isValidCircleOnTarget();
    if (!ok) {
      this.shakeAsset(this.objects[level.targetObjectIndex]);
      this.playWrongSound();
      this.time.delayedCall(250, () => this.clearUserDrawing());
      this.time.delayedCall(900, () => this.showCircleGuideHand(false));
      return;
    }

    this.clearUserDrawing();
    this.circledObjectIndex = level.targetObjectIndex;
    this.redrawCircle();
    this.onLevelSuccess();
  }

  private isValidCircleOnTarget() {
    const level = this.getCurrentColorLevel();
    const target = this.objects[level.targetObjectIndex];
    if (!target) return false;
    if (this.drawPoints.length < 12) return false;

    const first = this.drawPoints[0];
    const last = this.drawPoints[this.drawPoints.length - 1];
    // Allow a bit more "open" circle; kids won't close perfectly.
    if (Phaser.Math.Distance.Between(first.x, first.y, last.x, last.y) > 140) return false;

    let sx = 0, sy = 0;
    for (const p of this.drawPoints) { sx += p.x; sy += p.y; }
    const cx = sx / this.drawPoints.length;
    const cy = sy / this.drawPoints.length;

    const tb = target.getBounds();

    const minX = Math.min(...this.drawPoints.map((p) => p.x));
    const maxX = Math.max(...this.drawPoints.map((p) => p.x));
    const minY = Math.min(...this.drawPoints.map((p) => p.y));
    const maxY = Math.max(...this.drawPoints.map((p) => p.y));

    const drawnW = Math.max(1, maxX - minX);
    const drawnH = Math.max(1, maxY - minY);
    if (drawnW < 40 || drawnH < 40) return false;

    // Allow ellipse that's not perfectly round.
    const aspect = drawnW / drawnH;
    if (aspect < 0.45 || aspect > 2.2) return false;

    const centerDist = Phaser.Math.Distance.Between(cx, cy, tb.centerX, tb.centerY);
    const maxDim = Math.max(tb.width, tb.height);
    if (centerDist > maxDim * 0.55) return false;

    const drawnArea = drawnW * drawnH;
    const targetArea = Math.max(1, tb.width * tb.height);
    const areaRatio = drawnArea / targetArea;
    if (areaRatio < 0.35 || areaRatio > 4.5) return false;

    // Require reasonable overlap with the target (not necessarily fully enclosing it).
    const ix0 = Math.max(minX, tb.left);
    const iy0 = Math.max(minY, tb.top);
    const ix1 = Math.min(maxX, tb.right);
    const iy1 = Math.min(maxY, tb.bottom);
    const iw = Math.max(0, ix1 - ix0);
    const ih = Math.max(0, iy1 - iy0);
    const intersection = iw * ih;
    const overlapTarget = intersection / targetArea;
    if (overlapTarget < 0.5) return false;

    // Alpha depends on the child's drawn ellipse size (area-based):
    // smaller -> darker, bigger -> lighter.
    const minRatio = 0.55;
    const maxRatio = 2.2;
    const t = Phaser.Math.Clamp((areaRatio - minRatio) / (maxRatio - minRatio), 0, 1);
    const alpha = Phaser.Math.Clamp(Phaser.Math.Linear(1.0, 0.55, t), 0.55, 1.0);
    this.userCircleAlpha = alpha;
    this.userCircleEllipse = {
      cx,
      cy,
      w: drawnW * 1.06,
      h: drawnH * 1.06,
      alpha,
    };

    return true;
  }

  private stampPaint(pointer: Phaser.Input.Pointer) {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    const target = this.objects[level.targetObjectIndex];
    if (!target || !target.visible) return;
    if (!this.paintRT || !this.paintBrush) return;
    if (this.selectedTool === 'color' && this.selected === undefined) return;

    // Convert pointer position to local RT space.
    const localX = pointer.x - target.x + target.displayWidth / 2;
    const localY = pointer.y - target.y + target.displayHeight / 2;

    if (localX < 0 || localY < 0 || localX > target.displayWidth || localY > target.displayHeight) return;

    if (this.selectedTool === 'eraser') {
      // Erase paint using the same brush.
      const brushScale = Math.max(0.9, Math.min(1.6, target.displayWidth / 260));
      this.paintBrush.setScale(brushScale);
      this.paintRT.erase(this.paintBrush, localX, localY);
      return;
    }

    const selectedColor = this.selected as number;
    this.paintBrush.setTint(selectedColor);

    // Make brush size scale a bit with the target size.
    const brushScale = Math.max(0.9, Math.min(1.6, target.displayWidth / 260));
    this.paintBrush.setScale(brushScale);

    this.paintRT.draw(this.paintBrush, localX, localY);
    this.paintColorCounts.set(selectedColor, (this.paintColorCounts.get(selectedColor) ?? 0) + 1);

    // Track rough coverage on a grid so we can decide when painting is "done".
    const col = Math.floor((localX / target.displayWidth) * this.paintGrid.cols);
    const row = Math.floor((localY / target.displayHeight) * this.paintGrid.rows);
    if (col >= 0 && row >= 0 && col < this.paintGrid.cols && row < this.paintGrid.rows) {
      this.paintCellHits.add(`${col},${row}`);
    }
  }

  private getDominantPaintColor() {
    let bestColor: number | undefined = undefined;
    let bestCount = -1;
    for (const [color, count] of this.paintColorCounts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestColor = color;
      }
    }
    return bestColor;
  }
}
