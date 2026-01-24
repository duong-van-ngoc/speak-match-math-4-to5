import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { COLORS } from '../data/gameData';
import { FLOW_GO_END, type FlowEndPayload } from '../flow/events';
import { ABOVE_BELOW_SCENE_ASSETS, BOARD_ASSET_KEYS, COLOR_SCENE_ASSETS, FRONT_BEHIND_SCENE_ASSETS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';

type ColorLevel = {
  label: string;
  mode: 'color' | 'circle';
  // Legacy single-target fields (still used by circle mode).
  targetObjectIndex: number;
  // When mode='color', prefer `colorTargets` over legacy `targetColor`.
  targetColor?: number;
  colorTargets?: Array<{ objectIndex: number; color: number }>;
  // asset texture của 2 con mèo (tạm dùng 2 texture sẵn có)
  objectTextureKeys: (string | undefined)[];
};

type PaintState = {
  rt: Phaser.GameObjects.RenderTexture;
  maskSprite: Phaser.GameObjects.Image;
  targetSize: { w: number; h: number };
  cellHits: Set<string>;
  maskCells: Set<string>;
  colorCounts: Map<number, number>;
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
  private paintBrush?: Phaser.GameObjects.Image;
  private paintGrid = { cols: 50, rows: 50 };
  // Completion thresholds:
  // - Duck (index 0): allow a bit easier (~90%)
  // - Fish: allow a bit easier (~90%)
  private readonly duckCompletionRatio = 0.9;
  private readonly fishCompletionRatio = 0.9;
  private paintStates = new Map<number, PaintState>();
  private activePaintObjectIndex?: number;
  // Targets that are already correct and locked.
  private solvedPaintTargets = new Set<number>();
  private evaluatingPaintTargets = new Set<number>();
  private suppressNextLevelSuccessSound = false;

  private boardFallbackGfx?: Phaser.GameObjects.Graphics;
  private boardImage?: Phaser.GameObjects.Image;
  private sceneBg?: Phaser.GameObjects.Image;
  private boardRect = new Phaser.Geom.Rectangle();
  private boardInnerRect = new Phaser.Geom.Rectangle();
  private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;

  private paletteDots: Array<Phaser.GameObjects.Arc | Phaser.GameObjects.Image> = [];
  private paletteCenter?: { x: number; y: number };
  private paletteSelectedIndex = 0;
  // Thang màu: Vàng + Xanh + Tẩy (giống ảnh asset)
  private paletteDefs: Array<{ c: number; label: string; spriteKey?: string }> = [
    { c: COLORS.yellow, label: 'VÀNG', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[1] },
    { c: 0x1d7fc7, label: 'XANH', spriteKey: COLOR_SCENE_ASSETS.paletteDotKeys[3] },
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
  // Avoid a race where the scene shows the hand after the child's very first tap.
  private initialPaletteGuideHandTimeout?: Phaser.Time.TimerEvent;
  private paletteGuideHandShown = false;

  private actionGuideHand?: Phaser.GameObjects.Image;
  private actionGuideHandTween?: Phaser.Tweens.Tween;
  private actionGuideHandTimeout?: Phaser.Time.TimerEvent;
  private actionGuideHandMode: 'paint' | 'circle' | undefined = undefined;
  private inactivityTimeout?: Phaser.Time.TimerEvent;

  constructor() {
    super('ColorScene');
  }

  init(_data: { gameData: GameData }) {
    void _data;
    this.colorLevels = [
      {
        label: 'Tô màu vàng con vật trên mặt nước và tô màu xanh 2 con vật dưới nước',
        mode: 'color',
        targetObjectIndex: 0,
        colorTargets: [
          { objectIndex: 0, color: COLORS.yellow },
          // Palette blue in this scene is 0x1d7fc7 (see paletteDefs).
          { objectIndex: 1, color: 0x1d7fc7 },
          { objectIndex: 2, color: 0x1d7fc7 },
        ],
        objectTextureKeys: [
          ABOVE_BELOW_SCENE_ASSETS.duck,
          ABOVE_BELOW_SCENE_ASSETS.fish1,
          ABOVE_BELOW_SCENE_ASSETS.fish2,
        ],
      },
    ];
  }

  preload() {
    loadAssetGroups(this, 'shared', 'colorScene', 'numbers', 'ui', 'countConnect');
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
    this.boardImage = undefined;
    this.sceneBg = undefined;
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
    this.clearPaint();
    this.boardFallbackGfx = this.add.graphics().setDepth(0);
    this.layoutBoard();
    this.scale.on('resize', this.layoutBoard, this);

    this.colorLevelLabel = this.add
      .text(this.boardRect.centerX, this.boardRect.y + 18, '', {
        fontFamily: 'Baloo, Arial',
        fontSize: '56px', // tăng kích thước chữ banner
        color: '#0b1b2a',
      })
      .setOrigin(0.5, 0)
      .setDepth(6);
    this.colorLevelLabel.setVisible(false);

    this.createPaletteElements();
    this.createObjectElements();
    // Drawn circle preview should be above all characters.
    this.drawGfx = this.add.graphics().setDepth(220);
    this.layoutBoard();

    this.applyCurrentColorLevel();
    // Đảm bảo bàn tay hiện ngay khi vào màn đầu tiên
    this.initialPaletteGuideHandTimeout?.remove(false);
    this.initialPaletteGuideHandTimeout = this.time.delayedCall(0, () => {
      this.showPaletteGuideHand(true);
    });
    // Phát voice hướng dẫn cho màn đầu tiên (không ảnh hưởng bàn tay)
    this.playGuideVoiceForCurrentLevel();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutBoard, this);
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.initialPaletteGuideHandTimeout?.remove(false);
      this.initialPaletteGuideHandTimeout = undefined;
      this.inactivityTimeout?.remove(false);
      this.inactivityTimeout = undefined;
    });

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.resetInactivityTimer();
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

  private shakeAsset(target?: Phaser.GameObjects.GameObject) {
    if (!target) return;
    const obj = target as any;
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return;

    const baseX = obj.x;
    const baseY = obj.y;

    // Stop any existing shake on this object.
    const existing = this.shakeTweens.get(target);
    if (existing) {
      existing.stop();
      this.shakeTweens.delete(target);
    }
    this.tweens.killTweensOf(obj);

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
    const desiredCount = Math.max(0, level.objectTextureKeys.length);
    for (let i = 0; i < desiredCount; i++) {
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

  private ensureSceneBackground() {
    if (this.sceneBg && this.sceneBg.scene) return;
    const key = ABOVE_BELOW_SCENE_ASSETS.tank;
    if (!this.textures.exists(key)) return;
    try {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    } catch { }
    this.sceneBg = this.add.image(0, 0, key).setOrigin(0.5).setDepth(1);
  }

  private getColorTargetMap(level = this.getCurrentColorLevel()) {
    const map = new Map<number, number>();
    if (level.mode !== 'color') return map;
    const targets = level.colorTargets?.length
      ? level.colorTargets
      : level.targetColor !== undefined
        ? [{ objectIndex: level.targetObjectIndex, color: level.targetColor }]
        : [];
    for (const t of targets) map.set(t.objectIndex, t.color);
    return map;
  }

  private findColorTargetIndexAtPointer(pointer: Phaser.Input.Pointer) {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return undefined;
    const targetMap = this.getColorTargetMap(level);
    // Prefer top-most objects (higher depth).
    const candidates = Array.from(targetMap.keys())
      .map((idx) => ({ idx, obj: this.objects[idx] }))
      .filter(({ obj }) => !!obj && obj.visible && obj.getBounds().contains(pointer.x, pointer.y))
      .sort((a, b) => (b.obj?.depth ?? 0) - (a.obj?.depth ?? 0));
    return candidates[0]?.idx;
  }

  private applyCurrentColorLevel() {
    const level = this.getCurrentColorLevel();
    this.levelSolved = false;
    this.circledObjectIndex = undefined;
    this.userCircleAlpha = 1;
    this.clearCircle();
    this.clearUserDrawing();
    this.clearPaint();
    this.solvedPaintTargets.clear();
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
      this.objects.forEach((obj, i) => {
        const depth = 140 - i * 10;
        obj.setDepth(depth).setBlendMode(Phaser.BlendModes.MULTIPLY);
      });
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
    this.ensurePaintBrush();
    this.updateBannerTextImage();
    // Phát voice hướng dẫn khi chuyển màn
    this.playGuideVoiceForCurrentLevel();
    // Reset trạng thái đã hiện bàn tay, không gọi showPaletteGuideHand ở đây để tránh xóa bàn tay vừa hiện ở create
    this.paletteGuideHandShown = false;
    this.hidePaletteGuideHand();
    if (level.mode === 'color') {
      this.time.delayedCall(0, () => this.showPaletteGuideHand(true));
    } else if (level.mode === 'circle') {
      this.time.delayedCall(250, () => this.showCircleGuideHand(true));
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

  private onLevelSuccess() {
    this.levelSolved = true;
    if (!this.suppressNextLevelSuccessSound) {
      this.playCorrectSound();
    }
    this.suppressNextLevelSuccessSound = false;
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

  private ensurePaintBrush() {
    if (this.paintBrush && this.paintBrush.scene) return;
    if (!this.textures.exists('__paint_brush__')) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(30, 30, 30);
      g.generateTexture('__paint_brush__', 60, 60);
      g.destroy();
    }
    this.paintBrush = this.add.image(-10000, -10000, '__paint_brush__').setVisible(true).setDepth(-2000);
    this.paintBrush.setBlendMode(Phaser.BlendModes.NORMAL);
  }

  private ensurePaintForObject(objectIndex: number) {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    const target = this.objects[objectIndex];
    if (!target || !target.visible) return;

    const w = Math.max(1, Math.round(target.displayWidth));
    const h = Math.max(1, Math.round(target.displayHeight));
    const existing = this.paintStates.get(objectIndex);
    const needsRecreate =
      !existing || !existing.rt.scene || !existing.targetSize || existing.targetSize.w !== w || existing.targetSize.h !== h;

    if (needsRecreate) {
      this.clearPaintForObject(objectIndex);

      const paintDepth = target.depth - 1;
      const rt = this.add
        .renderTexture(target.x, target.y, w, h)
        .setOrigin(0.5)
        .setDepth(paintDepth)
        .setBlendMode(Phaser.BlendModes.NORMAL);

      const maskSprite = this.add
        .image(target.x, target.y, this.getPaintMaskTextureKeyForTarget(target))
        .setOrigin(target.originX, target.originY)
        .setDisplaySize(target.displayWidth, target.displayHeight)
        .setDepth(-1000)
        .setAlpha(1);

      rt.setMask(new Phaser.Display.Masks.BitmapMask(this, maskSprite));

      const maskCells = this.computeMaskCellsForTarget(target, this.getPaintMaskTextureKeyForTarget(target));

      this.paintStates.set(objectIndex, {
        rt,
        maskSprite,
        targetSize: { w, h },
        cellHits: new Set<string>(),
        maskCells,
        colorCounts: new Map<number, number>(),
      });
      return;
    }

    const state = existing;
    state.rt.setPosition(target.x, target.y);
    state.rt.setDepth(target.depth - 1);
    state.rt.setBlendMode(Phaser.BlendModes.NORMAL);
    state.maskSprite.setPosition(target.x, target.y);
    state.maskSprite.setDisplaySize(target.displayWidth, target.displayHeight);
    state.maskSprite.setTexture(this.getPaintMaskTextureKeyForTarget(target));
  }

  private clearPaintForObject(objectIndex: number) {
    const state = this.paintStates.get(objectIndex);
    if (!state) return;
    state.rt.destroy();
    state.maskSprite.destroy();
    this.paintStates.delete(objectIndex);
  }

  private clearPaint() {
    this.painting = false;
    this.activePaintObjectIndex = undefined;
    for (const idx of Array.from(this.paintStates.keys())) this.clearPaintForObject(idx);
    this.paintBrush?.destroy();
    this.paintBrush = undefined;
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
      this.showPaintGuideHand(true);
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
      // Tô màu: bé có thể chọn màu nào tô cũng được; chỉ kiểm tra đúng/sai khi tô xong.
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
      if (hoverObjectIndex != null && this.solvedPaintTargets.has(hoverObjectIndex)) {
        this.setCanvasCursor('default');
        return;
      }
      const targetMap = this.getColorTargetMap(level);
      if (hoverObjectIndex == null || !targetMap.has(hoverObjectIndex)) {
        this.setCanvasCursor('default');
        return;
      }
      this.setCanvasCursor('pointer');
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
    const maxW = Math.min(1800, w * 0.94); // scale theo Full HD
    // Make the board a bit taller so there's more room for the palette row.
    const maxH = Math.min(920, h * 0.9); // scale theo Full HD + 5px
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

    this.ensureSceneBackground();
    this.ensureBoardBackgroundLayout();

    this.updatePalettePositions();
    this.positionGirl();
    this.positionObjects();
    this.ensurePaintBrush();
    for (const idx of Array.from(this.paintStates.keys())) this.ensurePaintForObject(idx);
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

    // Above/below layout: 1 animal above water, 2 animals below water.
    if (this.objects.length === 3) {
      const paletteTop =
        (this.paletteCenter?.y ?? (this.boardInnerRect.y + this.boardInnerRect.height)) -
        this.paletteDotSize / 2 -
        8;
      const inner = this.boardInnerRect;
      const topY = inner.y + inner.height * 0.23 + this.contentYOffset;
      void topY;

      // Align fish positions/sizes by design spec relative to the water asset.
      const WATER_DESIGN = { w: 1482, h: 761.85, top: 350.15, left: 0 };
      const FISH1_DESIGN = { w: 393.27, h: 199.14, top: 656.73, left: 424.45 };
      const FISH2_DESIGN = { w: 307.43, h: 184.24, top: 853.55, left: 799.81 };

      const bg = this.sceneBg;
      const bgLeft = bg ? bg.x - bg.displayWidth / 2 : inner.x;
      const bgTop = bg ? bg.y - bg.displayHeight / 2 : inner.y;
      const bgW = bg ? bg.displayWidth : inner.width;
      const bgH = bg ? bg.displayHeight : inner.height;

      const placeByDesign = (design: { w: number; h: number; top: number; left: number }) => {
        const cxRatio = (design.left - WATER_DESIGN.left + design.w / 2) / WATER_DESIGN.w;
        const cyRatio = (design.top - WATER_DESIGN.top + design.h / 2) / WATER_DESIGN.h;
        return {
          x: bgLeft + bgW * cxRatio,
          y: bgTop + bgH * cyRatio,
          w: (design.w / WATER_DESIGN.w) * bgW,
          h: (design.h / WATER_DESIGN.h) * bgH,
        };
      };

      const duck = this.objects[0];
      const fish1 = this.objects[1];
      const fish2 = this.objects[2];

      if (duck) {
        // Place duck relative to the water background so it stays aligned when the water scales.
        // Duck design (from your spec) relative to the water design size.
        // Only X + size are matched to the water; Y stays relative to the water top line.
        const DUCK_DESIGN = { w: 407.22, h: 413.44, left: 593.61 };
        const duckScale = 1.18;
        const desiredW = (DUCK_DESIGN.w / WATER_DESIGN.w) * bgW * duckScale;
        const desiredH = (DUCK_DESIGN.h / WATER_DESIGN.h) * bgH * duckScale;
        const ratio = this.getTextureRatio(duck.texture.key) ?? 1;
        let duckW = desiredW;
        let duckH = desiredH;
        if (ratio > 0) {
          // Keep aspect ratio: fit inside the desired box.
          const wFromH = desiredH * ratio;
          if (wFromH > desiredW) {
            duckW = desiredW;
            duckH = desiredW / ratio;
          } else {
            duckW = wFromH;
            duckH = desiredH;
          }
        }
        duck.setDisplaySize(duckW, duckH);

        const duckCxRatio = (DUCK_DESIGN.left + DUCK_DESIGN.w / 2) / WATER_DESIGN.w;
        const x = bgLeft + bgW * duckCxRatio;
        const y = bgTop - bgH * 0.215;
        const clampedY = Math.min(y, paletteTop - duck.displayHeight / 2 - 4);
        duck.setPosition(x, clampedY);
      }

      if (fish1) {
        const p = placeByDesign(FISH1_DESIGN);
        fish1.setDisplaySize(p.w, p.h);
        const fishY = Math.min(p.y, paletteTop - fish1.displayHeight / 2 - 4);
        fish1.setPosition(p.x, fishY);
      }

      if (fish2) {
        const p = placeByDesign(FISH2_DESIGN);
        fish2.setDisplaySize(p.w, p.h);
        const fishY = Math.min(p.y, paletteTop - fish2.displayHeight / 2 - 4);
        fish2.setPosition(p.x, fishY);
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
    // Stretch HTU background only in X (keep Y stable).
    const maxWidth = Math.min(this.scale.width * 0.95, 1180); // scale theo Full HD
    const maxWidthX = Math.min(this.scale.width * 0.98, 1350); // scale theo Full HD
    const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;

    // Base size controls the height (Y). This stays stable.
    const baseWidth = Math.min(maxWidth, this.boardRect.width * 0.95);
    const targetHeight = bgRatio ? baseWidth / bgRatio : this.bannerBg.displayHeight;

    // Background can be wider (X) without changing height.
    const targetWidth = Math.min(maxWidthX, this.boardRect.width * 0.98);
    const x = this.boardRect.centerX + 20;
    const y = Math.max(targetHeight / 2 + 8, this.boardRect.y - targetHeight / 2 - 8);
    this.bannerBg.setDisplaySize(targetWidth, targetHeight);
    this.bannerBg.setPosition(x, y);

    if (this.bannerTextImage) {
      // Tăng kích thước asset banner text lên 1.1 lần so với mặc định
      const textRatio = this.getTextureRatio(this.bannerTextImage.texture.key) ?? 1;
      // Keep title size stable while the background stretches in X.
      const textWidth = baseWidth * 0.98; // title PNG to hơn
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

    // Only block initial auto-guidance if targets have been solved.
    // If !first (inactivity/error), we allow showing help.
    if (first && this.solvedPaintTargets.size > 0) return;

    // Xóa bàn tay cũ nếu có
    this.hidePaletteGuideHand();
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;

    // Find the first unsolved target to guide its color.
    const targetMap = this.getColorTargetMap(level);
    const unsolvedEntry = Array.from(targetMap.entries())
      .find(([idx]) => !this.solvedPaintTargets.has(idx));

    // If no unsolved targets, nothing to guide.
    if (!unsolvedEntry) return;

    const targetColor = unsolvedEntry[1];

    const paletteIndex = this.paletteDefs.findIndex((def) => def.c === targetColor);
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
    this.inactivityTimeout = this.time.delayedCall(10000, () => this.onInactivity());
  }

  private onInactivity() {
    const level = this.getCurrentColorLevel();
    if (this.levelSolved) return;

    if (level.mode === 'color') {
      if (this.painting) return;
      this.showRelevantGuideHand(false);
      return;
    }

    if (level.mode === 'circle') {
      if (this.drawing) return;
      this.showCircleGuideHand(false);
    }
  }

  private isCurrentColorValid() {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return false;
    if (this.selectedTool !== 'color' || this.selected === undefined) return false;

    const targetMap = this.getColorTargetMap(level);
    for (const [idx, color] of targetMap.entries()) {
      if (!this.solvedPaintTargets.has(idx) && color === this.selected) {
        return true;
      }
    }
    return false;
  }

  private showRelevantGuideHand(first: boolean) {
    if (this.isCurrentColorValid()) {
      this.showPaintGuideHand(first);
    } else {
      this.showPaletteGuideHand(first);
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
    const targetMap = this.getColorTargetMap(level);
    const preferredColor = this.selectedTool === 'color' ? this.selected : undefined;
    const candidates = Array.from(targetMap.entries())
      .filter(([idx]) => !this.solvedPaintTargets.has(idx))
      .sort((a, b) => a[0] - b[0]);
    const pick =
      preferredColor !== undefined ? candidates.find(([, c]) => c === preferredColor)?.[0] : candidates[0]?.[0];
    const target = pick != null ? this.objects[pick] : undefined;
    if (!target || !target.visible) return;
    const b = target.getBounds();
    // Start near the cat so the sweep animation can show "paint the whole cat".
    // Point straight at the center of the animal, shifted down a bit.
    const pointX = b.centerX;
    const pointY = b.centerY + b.height * 0.25;
    hand.setPosition(pointX, pointY);
    hand.setRotation(0);
    hand.setScale(0.5);
  }

  private showPaintGuideHand(first: boolean) {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    if (this.levelSolved) return;
    if (this.selectedTool === 'color' && this.selected === undefined) return;

    // Only block initial auto-guidance if targets have been solved.
    if (first && this.solvedPaintTargets.size > 0) return;

    const hand = this.ensureActionGuideHand();
    if (!hand) return;
    if (this.actionGuideHandMode === 'paint' && hand.visible) return;

    this.actionGuideHandMode = 'paint';
    this.positionPaintGuideHand();
    hand.setVisible(true);
    hand.setRotation(0);
    hand.setScale(0.5);

    // Pointing animation (blink/pulse in place).
    this.actionGuideHandTween = this.tweens.add({
      targets: hand,
      scale: { from: 0.5, to: 0.6 },
      alpha: { from: 1, to: 0.4 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.actionGuideHandTimeout?.remove(false);
    // Removed auto-hide: Hand persists until user interaction starts.
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
    // Removed auto-hide: Hand persists until user interaction starts.
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
      // First interaction no longer hides the palette guide hand immediately.
      // We rely on applyPaletteSelection to hide it when a color is actually selected.

      this.initialPaletteGuideHandTimeout?.remove(false);
      this.initialPaletteGuideHandTimeout = undefined;

      // Remove redundant paletteGuideHandTimeout; rely on resetInactivityTimer (5s).

      if (this.levelSolved) return;

      // Require a tool selection (color or eraser) before painting.
      if (this.selectedTool === 'color' && this.selected === undefined) return;

      const targetIndex = this.findColorTargetIndexAtPointer(pointer);
      if (targetIndex == null) return;
      if (this.solvedPaintTargets.has(targetIndex)) return;

      // Starting to paint: hide the guidance hand.
      this.hideActionGuideHand();
      this.ensurePaintBrush();
      this.ensurePaintForObject(targetIndex);
      this.painting = true;
      this.activePaintObjectIndex = targetIndex;
      this.stampPaint(pointer, targetIndex);
      return;
    }

    // Circle mode: start drawing.
    if (this.levelSolved) return;
    if (!this.isPointerInBoard(pointer)) return;
    this.setCanvasCursor('crosshair');
    // Hide action hand only when drawing actually starts
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
      if (this.activePaintObjectIndex == null) return;
      this.stampPaint(pointer, this.activePaintObjectIndex);
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
    void _pointer;
    const level = this.getCurrentColorLevel();
    this.resetInactivityTimer();

    if (level.mode === 'color') {
      if (!this.painting || this.levelSolved) return;
      this.painting = false;
      const active = this.activePaintObjectIndex;
      this.activePaintObjectIndex = undefined;
      if (active == null) return;

      this.tryEvaluatePaintTarget(active);
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

  private stampPaint(pointer: Phaser.Input.Pointer, objectIndex: number) {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    if (this.solvedPaintTargets.has(objectIndex)) return;
    if (this.evaluatingPaintTargets.has(objectIndex)) return;
    const target = this.objects[objectIndex];
    if (!target || !target.visible) return;
    const state = this.paintStates.get(objectIndex);
    if (!state || !this.paintBrush) return;
    if (this.selectedTool === 'color' && this.selected === undefined) return;

    // Convert pointer position to local RT space.
    const localX = pointer.x - target.x + target.displayWidth / 2;
    const localY = pointer.y - target.y + target.displayHeight / 2;

    if (localX < 0 || localY < 0 || localX > target.displayWidth || localY > target.displayHeight) return;

    const brushScale = Math.max(0.9, Math.min(1.6, target.displayWidth / 260));
    const brushRadiusPx = 30 * brushScale; // brush texture is 60px (r=30)

    const updateCoverageCells = (add: boolean) => {
      const cellW = target.displayWidth / this.paintGrid.cols;
      const cellH = target.displayHeight / this.paintGrid.rows;
      const col = Math.floor((localX / target.displayWidth) * this.paintGrid.cols);
      const row = Math.floor((localY / target.displayHeight) * this.paintGrid.rows);
      if (col < 0 || row < 0 || col >= this.paintGrid.cols || row >= this.paintGrid.rows) return;

      const rCol = Math.max(0, Math.ceil(brushRadiusPx / Math.max(1, cellW)));
      const rRow = Math.max(0, Math.ceil(brushRadiusPx / Math.max(1, cellH)));
      for (let dc = -rCol; dc <= rCol; dc++) {
        for (let dr = -rRow; dr <= rRow; dr++) {
          const cc = col + dc;
          const rr = row + dr;
          if (cc < 0 || rr < 0 || cc >= this.paintGrid.cols || rr >= this.paintGrid.rows) continue;
          // Only count cells whose center is inside the brush circle (avoid over-counting).
          const cellCenterX = (cc + 0.5) * cellW;
          const cellCenterY = (rr + 0.5) * cellH;
          const dx = cellCenterX - localX;
          const dy = cellCenterY - localY;
          if (dx * dx + dy * dy > brushRadiusPx * brushRadiusPx) continue;
          const key = `${cc},${rr}`;
          if (state.maskCells.size && !state.maskCells.has(key)) continue;
          if (add) state.cellHits.add(key);
          else state.cellHits.delete(key);
        }
      }
    };

    if (this.selectedTool === 'eraser') {
      this.paintBrush.setScale(brushScale);
      state.rt.erase(this.paintBrush, localX, localY);
      updateCoverageCells(false);
      return;
    }

    const selectedColor = this.selected as number;
    this.paintBrush.setTint(selectedColor);

    this.paintBrush.setScale(brushScale);

    state.rt.draw(this.paintBrush, localX, localY);
    state.colorCounts.set(selectedColor, (state.colorCounts.get(selectedColor) ?? 0) + 1);

    // Track rough coverage on a grid so we can decide when painting is "done".
    updateCoverageCells(true);

    // If child has painted enough, evaluate immediately (no need to wait for pointer up).
    this.tryEvaluatePaintTarget(objectIndex);
  }

  private getDominantPaintColor(colorCounts: Map<number, number>) {
    let bestColor: number | undefined = undefined;
    let bestCount = -1;
    for (const [color, count] of colorCounts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestColor = color;
      }
    }
    return bestColor;
  }

  private tryEvaluatePaintTarget(targetIndex: number) {
    const level = this.getCurrentColorLevel();
    if (level.mode !== 'color') return;
    if (this.levelSolved) return;
    if (this.solvedPaintTargets.has(targetIndex)) return;
    if (this.evaluatingPaintTargets.has(targetIndex)) return;

    const state = this.paintStates.get(targetIndex);
    if (!state) return;

    const totalCells = state.maskCells.size || (this.paintGrid.cols * this.paintGrid.rows);
    if (totalCells <= 0) return;

    const requiredRatio = targetIndex === 0 ? this.duckCompletionRatio : this.fishCompletionRatio;
    const requiredCells = Math.min(totalCells, Math.ceil(totalCells * requiredRatio));
    if (state.cellHits.size < requiredCells) return;

    const targetMap = this.getColorTargetMap(level);
    const required = targetMap.get(targetIndex);
    if (required == null) return;

    const dominant = this.getDominantPaintColor(state.colorCounts);
    if (dominant == null) return;

    this.evaluatingPaintTargets.add(targetIndex);
    this.painting = false;
    if (this.activePaintObjectIndex === targetIndex) this.activePaintObjectIndex = undefined;

    // Khi xét đúng/sai, luôn fill kín con vật theo màu bé đã tô (dominant).
    this.fillTargetToFull(targetIndex, dominant);

    if (dominant === required) {
      this.solvedPaintTargets.add(targetIndex);
      this.evaluatingPaintTargets.delete(targetIndex);
      this.playTargetCorrectAnimation(targetIndex);
      if (this.solvedPaintTargets.size >= targetMap.size) {
        // Avoid double "correct" voice: last target already played per-target voice.
        this.suppressNextLevelSuccessSound = true;
        this.onLevelSuccess();
      }
      return;
    }

    // Sai con nào rung con đó ngay, rồi cho tô lại con đó.
    this.shakeAsset(this.objects[targetIndex]);
    this.playWrongSound();
    // Đợi một chút để bé thấy con vật đã bị fill theo màu vừa tô, rồi reset để tô lại.
    this.time.delayedCall(380, () => this.clearPaintForObject(targetIndex));
    this.time.delayedCall(560, () => {
      this.ensurePaintForObject(targetIndex);
      this.evaluatingPaintTargets.delete(targetIndex);
    });
    this.time.delayedCall(650, () => this.showRelevantGuideHand(false));
  }

  private fillTargetToFull(targetIndex: number, color: number) {
    const state = this.paintStates.get(targetIndex);
    if (!state || !state.rt.scene) return;
    state.rt.clear();
    state.rt.fill(color, 1);
    state.colorCounts.clear();
    state.colorCounts.set(color, 1_000_000);
    state.cellHits.clear();
    if (state.maskCells.size) {
      for (const k of state.maskCells) state.cellHits.add(k);
    } else {
      for (let c = 0; c < this.paintGrid.cols; c++) {
        for (let r = 0; r < this.paintGrid.rows; r++) {
          state.cellHits.add(`${c},${r}`);
        }
      }
    }
  }

  private computeMaskCellsForTarget(_target: Phaser.GameObjects.Image, maskTextureKey: string) {
    void _target;
    const maskCells = new Set<string>();
    if (!this.textures.exists(maskTextureKey)) return maskCells;
    const tex = this.textures.get(maskTextureKey);
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
    if (!src) return maskCells;

    const w = (src as any).width || 0;
    const h = (src as any).height || 0;
    if (!w || !h) return maskCells;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return maskCells;
    ctx.drawImage(src as any, 0, 0);
    const img = ctx.getImageData(0, 0, w, h).data;

    const alphaThreshold = 4; // treat near-transparent as outside
    for (let col = 0; col < this.paintGrid.cols; col++) {
      for (let row = 0; row < this.paintGrid.rows; row++) {
        // Multi-sample each cell so we don't undercount mask area at edges.
        // (Undercounting makes it too easy to reach the completion threshold.)
        const xs = [0.2, 0.5, 0.8];
        const ys = [0.2, 0.5, 0.8];
        let any = false;
        for (const sx of xs) {
          for (const sy of ys) {
            const u = (col + sx) / this.paintGrid.cols;
            const v = (row + sy) / this.paintGrid.rows;
            const px = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
            const py = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
            const a = img[(py * w + px) * 4 + 3] ?? 0;
            if (a > alphaThreshold) {
              any = true;
              break;
            }
          }
          if (any) break;
        }
        if (any) maskCells.add(`${col},${row}`);
      }
    }
    return maskCells;
  }

  private playTargetCorrectAnimation(targetIndex: number) {
    const obj = this.objects[targetIndex];
    if (!obj || !obj.scene) return;

    AudioManager.play('sfx_correct');
    this.playCorrectAnswerSound();

    const baseScaleX = obj.scaleX;
    const baseScaleY = obj.scaleY;

    this.tweens.add({
      targets: obj,
      scaleX: baseScaleX * 1.08,
      scaleY: baseScaleY * 1.08,
      duration: 160,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        obj.setScale(baseScaleX, baseScaleY);
      },
    });

  }

  private ensureBoardBackgroundLayout() {
    if (!this.sceneBg) return;
    const bgScale = 0.83; // make water (and fish) bigger
    const bgYOffset = this.boardInnerRect.height * 0.06 + 60; // move water down a bit (+50px total)
    this.sceneBg.setPosition(this.boardInnerRect.centerX, this.boardInnerRect.centerY + bgYOffset);
    this.sceneBg.setDisplaySize(this.boardInnerRect.width * bgScale, this.boardInnerRect.height * bgScale);
  }
}
