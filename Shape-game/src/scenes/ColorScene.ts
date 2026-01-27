import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { COLORS } from '../data/gameData';
import { FLOW_GO_COUNT } from '../flow/events';
import { BOARD_ASSET_KEYS, PALETTE_ASSET_KEYS, SHAPE_ASSET_KEYS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';

type ShapeKind = 'circle' | 'triangle' | 'rectangle' | 'square';

type PaintTool = 'color' | 'eraser';

type PaintShape = {
  kind: ShapeKind;
  label: string;
  targetColor: number;
  bounds: Phaser.Geom.Rectangle;
  center: Phaser.Math.Vector2;
  size: { w: number; h: number };
  stencil: Phaser.GameObjects.Image;
  fillGfx: Phaser.GameObjects.Graphics;
  painted: boolean;
  strokes: number;
  requiredStrokes: number;
  lastPaint?: Phaser.Math.Vector2;
  usedColor?: number;
  coverageSamples: Phaser.Math.Vector2[];
  coverageMarked: Uint8Array;
  coverageMarkedCount: number;
};

const PAINT_ORDER: ShapeKind[] = ['circle', 'triangle', 'rectangle', 'square'];

export class ColorScene extends Phaser.Scene {
  private boardFallbackGfx?: Phaser.GameObjects.Graphics;
  private boardImage?: Phaser.GameObjects.Image;
  private boardRect = new Phaser.Geom.Rectangle();
  private boardInnerRect = new Phaser.Geom.Rectangle();
  private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;

  private bannerBg?: Phaser.GameObjects.Image;
  private bannerTextImage?: Phaser.GameObjects.Image;
  private readonly bannerBgKey = BOARD_ASSET_KEYS.bannerBg;

  private shapes: PaintShape[] = [];

  private painting = false;
  private activePointerId?: number;
  private brushRadius = 45;
  private currentPaintTarget?: PaintShape;
  // "Tô từ từ đến full": require very high coverage before accepting.
  private readonly coverageRequiredRatio = 0.98;

  private contentRect = new Phaser.Geom.Rectangle();
  private paletteRect = new Phaser.Geom.Rectangle();

  private paletteDots: Phaser.GameObjects.Image[] = [];
  private paletteSelectedIndex = 2; // default blue like sample
  private selectedTool: PaintTool = 'color';
  private selectedColor?: number;
  private eraserBtn?: Phaser.GameObjects.Container;
  private readonly brushCursor = 'pointer';
  private readonly characterLiftY = -225; // âm = dịch lên trên


  private guideHand?: Phaser.GameObjects.Image;
  private guideHandTween?: Phaser.Tweens.Tween;
  private guideHandTimer?: Phaser.Time.TimerEvent;
  private lastInteractionAtMs = 0;
  private readonly guideHandIdleMs = 10000;
  private guideHandMotionToken = 0;

  private currentStepIndex = 0;

  constructor() {
    super('ColorScene');
  }

  init(data: { gameData: GameData }) {
    void data.gameData;
  }

  preload() {
    loadAssetGroups(this, 'shared', 'colorScene', 'ui', 'shapes', 'palette');
  }

  create() {
    this.painting = false;
    this.activePointerId = undefined;
    this.currentPaintTarget = undefined;
    this.paletteSelectedIndex = -1;
    this.selectedTool = 'color';
    this.selectedColor = undefined;
    this.currentStepIndex = 0;

    this.boardImage?.destroy();
    this.boardImage = undefined;
    this.boardFallbackGfx?.destroy();
    this.boardFallbackGfx = this.add.graphics().setDepth(0);

    this.bannerBg?.destroy();
    this.bannerBg = undefined;
    this.bannerTextImage?.destroy();
    this.bannerTextImage = undefined;

    this.shapes.forEach((s) => {
      s.stencil.destroy();
      s.fillGfx.destroy();
    });
    this.shapes = [];

    this.paletteDots.forEach((d) => d.destroy());
    this.paletteDots = [];
    this.eraserBtn?.destroy();
    this.eraserBtn = undefined;

    this.layoutBoard();
    this.scale.on('resize', this.layoutBoard, this);

    this.ensureBannerAssets();
    this.createCharacterParts();
    this.createPalette();
    this.layoutBoard();

    this.setCursor(this.brushCursor);
    this.playGuideVoice();
    this.updatePaletteRings();
    this.setupGuideHand();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutBoard, this);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

      this.guideHandTween?.stop();
      this.guideHandTween = undefined;
      this.guideHandTimer?.remove(false);
      this.guideHandTimer = undefined;
      this.guideHand?.destroy();
      this.guideHand = undefined;
    });
  }

  private playGuideVoice() {
    AudioManager.stopGuideVoices();
    const kind = PAINT_ORDER[this.currentStepIndex];
    if (kind === 'circle') AudioManager.playWhenReady('voice_shape_circle');
    else if (kind === 'triangle') AudioManager.playWhenReady('voice_shape_triangle');
    else if (kind === 'rectangle') AudioManager.playWhenReady('voice_shape_rectangle');
    else if (kind === 'square') AudioManager.playWhenReady('voice_shape_square');
    else AudioManager.playWhenReady('voice_guide_21');
  }

  private playCorrectSound() {
    AudioManager.play('sfx_correct');
    AudioManager.playCorrectAnswer?.();
  }

  private playWrongSound() {
    AudioManager.stopGuideVoices();
    AudioManager.play('sfx_wrong');
    this.showGuideHand();
  }

  private getPaletteColors(): number[] {
    return [COLORS.red, COLORS.yellow, COLORS.blue, COLORS.brown ?? 0x8b4513];
  }

  private getSelectedColor(): number | undefined {
    if (this.selectedTool !== 'color') return undefined;
    if (this.selectedColor !== undefined) return this.selectedColor;
    const palette = this.getPaletteColors();
    return palette[Math.max(0, Math.min(this.paletteSelectedIndex, palette.length - 1))];
  }

  private noteInteraction() {
    this.lastInteractionAtMs = this.time.now;
  }

  private getHintTargetColor(): number | undefined {
    const currentKind = PAINT_ORDER[this.currentStepIndex];
    const next = this.shapes.find((s) => s.kind === currentKind && !s.painted);
    return next?.targetColor;
  }

  private getHintTargetShape(): PaintShape | undefined {
    const currentKind = PAINT_ORDER[this.currentStepIndex];
    return this.shapes.find((s) => s.kind === currentKind && !s.painted);
  }

  private shouldGuidePaint(): boolean {
    const next = this.getHintTargetShape();
    if (!next) return false;
    return this.selectedTool === 'color' && this.selectedColor !== undefined && this.selectedColor === next.targetColor;
  }

  private updateGuideHandPosition() {
    if (!this.guideHand) return;

    const offsetX = -15;
    const offsetY = 42;
    const tipOriginX = 0.13;
    const tipOriginY = 0.085;

    if (this.shouldGuidePaint()) {
      const shape = this.getHintTargetShape();
      if (!shape) return;
      const x = shape.bounds.centerX;
      const y = shape.bounds.centerY;
      this.guideHand.setOrigin(tipOriginX, tipOriginY);
      this.guideHand.setPosition(Math.round(x), Math.round(y));
      return;
    }

    this.guideHand.setOrigin(0.5, 0.5);
    const hintColor = this.getHintTargetColor();
    const palette = this.getPaletteColors();
    const idx = hintColor === undefined ? -1 : palette.findIndex((c) => c === hintColor);
    const dot = idx >= 0 ? this.paletteDots[idx] : undefined;

    if (!dot) {
      this.guideHand.setPosition(Math.round(this.paletteRect.centerX + offsetX), Math.round(this.paletteRect.centerY + offsetY));
      return;
    }

    const x = dot.x + dot.displayWidth * 0.55 + offsetX;
    const y = dot.y - dot.displayHeight * 0.25 + offsetY;
    this.guideHand.setPosition(Math.round(x), Math.round(y));
  }

  private showGuideHand() {
    if (!this.guideHand || this.guideHand.visible) return;
    this.updateGuideHandPosition();
    this.guideHand.setVisible(true);

    this.guideHandTween?.stop();
    if (this.shouldGuidePaint()) {
      // "Đi đi" animation (move around the target a bit) to suggest painting.
      const shape = this.getHintTargetShape();
      const b = shape?.bounds;
      if (!b) return;

      const cx = b.centerX;
      const cy = b.centerY;
      const amp = Phaser.Math.Clamp(Math.min(b.width, b.height) * 0.18, 10, 24);

      this.guideHand.setPosition(Math.round(cx), Math.round(cy));

      const points = [
        { x: Math.round(cx + amp), y: Math.round(cy) },
        { x: Math.round(cx - amp), y: Math.round(cy + amp * 0.5) },
        { x: Math.round(cx), y: Math.round(cy - amp * 0.6) },
        { x: Math.round(cx + amp * 0.6), y: Math.round(cy + amp * 0.6) },
      ];

      const token = (this.guideHandMotionToken += 1);
      let idx = 0;
      const playStep = () => {
        if (token != this.guideHandMotionToken) return;
        if (!this.guideHand || !this.guideHand.visible) return;
        if (!this.shouldGuidePaint()) return;

        const p = points[idx] ?? points[0]!;
        idx = (idx + 1) % points.length;

        this.guideHandTween?.stop();
        this.guideHandTween = this.tweens.add({
          targets: this.guideHand,
          x: p.x,
          y: p.y,
          duration: 420,
          yoyo: true,
          hold: 70,
          ease: 'Sine.easeInOut',
          onComplete: () => playStep(),
        });
      };

      playStep();
    } else {
      // Tap animation when guiding the kid to pick a color.
      const baseY = this.guideHand.y;
      this.guideHandTween = this.tweens.add({
        targets: this.guideHand,
        y: baseY + 6,
        duration: 320,
        yoyo: true,
        repeat: -1,
        repeatDelay: 850,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private hideGuideHand() {
    if (!this.guideHand || !this.guideHand.visible) return;
    this.guideHandMotionToken += 1;
    this.guideHandTween?.stop();
    this.guideHandTween = undefined;
    this.guideHand.setVisible(false);
  }

  private setupGuideHand() {
    this.lastInteractionAtMs = this.time.now;
    if (!this.textures.exists('guide_hand')) return;

    this.guideHand?.destroy();
    this.guideHand = this.add.image(0, 0, 'guide_hand').setOrigin(0.5, 0.5).setDepth(2000).setVisible(false);
    this.setDisplaySizeFromTextureScale(this.guideHand, 'guide_hand', 0.53);

    this.updateGuideHandPosition();
    this.showGuideHand();

    this.guideHandTimer?.remove(false);
    this.guideHandTimer = this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => {
        if (this.painting) return;
        if (this.time.now - this.lastInteractionAtMs < this.guideHandIdleMs) return;
        this.showGuideHand();
      },
    });
  }

  private getPartAssetKey(partLabel: string): string {
    if (partLabel === 'Mũ') return SHAPE_ASSET_KEYS.hat;
    if (partLabel === 'Đầu') return SHAPE_ASSET_KEYS.head;
    if (partLabel === 'Cổ') return SHAPE_ASSET_KEYS.neck;
    if (partLabel === 'Thân') return SHAPE_ASSET_KEYS.body;
    if (partLabel.includes('Tay')) return SHAPE_ASSET_KEYS.arm;
    if (partLabel.includes('Chân')) return SHAPE_ASSET_KEYS.leg;
    if (partLabel.includes('Giày')) return SHAPE_ASSET_KEYS.shoe;
    return SHAPE_ASSET_KEYS.body;
  }

  private getTargetColorForKind(kind: ShapeKind): number {
    // Theo yêu cầu + ảnh mẫu: tròn xanh, tam giác đỏ, chữ nhật vàng, vuông nâu
    if (kind === 'circle') return COLORS.blue;
    if (kind === 'triangle') return COLORS.red;
    if (kind === 'rectangle') return COLORS.yellow;
    return COLORS.brown ?? 0x8b4513;
  }

  private createCharacterParts() {
    const fillDepth = 10;
    const stencilDepth = 25;

    const parts: Array<{ kind: ShapeKind; label: string }> = [
      { kind: 'triangle', label: 'Mũ' },
      { kind: 'circle', label: 'Đầu' },
      { kind: 'rectangle', label: 'Cổ' },
      { kind: 'square', label: 'Thân' },
      { kind: 'rectangle', label: 'Tay trái' },
      { kind: 'rectangle', label: 'Tay phải' },
      { kind: 'rectangle', label: 'Chân trái' },
      { kind: 'rectangle', label: 'Chân phải' },
      { kind: 'triangle', label: 'Giày trái' },
      { kind: 'triangle', label: 'Giày phải' },
    ];

    parts.forEach((p) => {
      const fillGfx = this.add.graphics().setDepth(fillDepth);
      const stencil = this.add.image(0, 0, this.getPartAssetKey(p.label)).setDepth(stencilDepth).setOrigin(0.5);
      // Stencil images are white-filled with black outline; MULTIPLY keeps outline while
      // letting the paint layer show through (white => transparent effect).
      stencil.setBlendMode(Phaser.BlendModes.MULTIPLY);
      // Use alpha of stencil as a bitmap mask for the paint layer
      fillGfx.setMask(new Phaser.Display.Masks.BitmapMask(this, stencil));

      this.shapes.push({
        kind: p.kind,
        label: p.label,
        targetColor: this.getTargetColorForKind(p.kind),
        bounds: new Phaser.Geom.Rectangle(),
        center: new Phaser.Math.Vector2(),
        size: { w: 0, h: 0 },
        stencil,
        fillGfx,
        painted: false,
        strokes: 0,
        requiredStrokes: 30,
        coverageSamples: [],
        coverageMarked: new Uint8Array(),
        coverageMarkedCount: 0,
      });
    });
  }

  private createPalette() {
    const keys = [PALETTE_ASSET_KEYS.red, PALETTE_ASSET_KEYS.yellow, PALETTE_ASSET_KEYS.blue, PALETTE_ASSET_KEYS.brown];
    const palette = this.getPaletteColors();
    const dots: Phaser.GameObjects.Image[] = [];

    keys.forEach((key, idx) => {
      const dot = this.add.image(0, 0, key).setDepth(40).setOrigin(0.5);
      this.setDisplaySizeFromTextureScale(dot, key, 0.85);
      dot.setInteractive({ useHandCursor: true });
      dot.on('pointerover', () => {
        if (this.painting) return;
        this.setCursor('pointer');
      });
      dot.on('pointerout', () => {
        if (this.painting) return;
        this.setCursor(this.brushCursor);
      });
      dot.on('pointerdown', () => {
        this.noteInteraction();
        this.selectedTool = 'color';
        this.paletteSelectedIndex = idx;
        const picked = palette[Math.max(0, Math.min(idx, palette.length - 1))];
        this.selectedColor = picked;

        // Do not dismiss the hint on first touch unless the kid picked the correct color cell.
        const expected = this.getHintTargetColor();
        if (expected !== undefined && picked === expected) {
          // Switch guidance from "pick a color" -> "paint the next shape" immediately.
          this.hideGuideHand();
        }

        this.updatePaletteRings();
        AudioManager.play('sfx_click');
      });
      dots.push(dot);
    });
    this.paletteDots = dots;

    const eraser = this.add.container(0, 0).setDepth(42);
    const eraserImg = this.add.image(0, 0, PALETTE_ASSET_KEYS.eraser).setOrigin(0.5);
    this.setDisplaySizeFromTextureScale(eraserImg, PALETTE_ASSET_KEYS.eraser, 0.85);
    eraser.add([eraserImg]);
    eraser.setSize(eraserImg.displayWidth, eraserImg.displayHeight);
    eraser.setInteractive(new Phaser.Geom.Rectangle(-eraser.width / 2, -eraser.height / 2, eraser.width, eraser.height), Phaser.Geom.Rectangle.Contains);
    eraser.on('pointerover', () => {
      if (this.painting) return;
      this.setCursor('pointer');
    });
    eraser.on('pointerout', () => {
      if (this.painting) return;
      this.setCursor(this.brushCursor);
    });
    eraser.on('pointerdown', () => {
      this.noteInteraction();
      AudioManager.play('sfx_click');
      this.selectedTool = 'eraser';
      this.selectedColor = undefined;
      this.updatePaletteRings();
    });
    this.eraserBtn = eraser;

    this.updatePaletteRings();
    this.updateGuideHandPosition();
  }

  private setDisplaySizeFromTextureScale(img: Phaser.GameObjects.Image, key: string, scale: number) {
    if (!this.textures.exists(key)) {
      img.setScale(scale);
      return;
    }
    const tex = this.textures.get(key);
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
    if (!src) {
      img.setScale(scale);
      return;
    }
    const { width, height } = src as unknown as { width: number; height: number };
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    img.setDisplaySize(w, h);
  }

  private setCursor(cursor: string) {
    const canvas = this.game.canvas;
    if (!canvas) return;
    canvas.style.cursor = cursor;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    this.noteInteraction();
    if (this.painting) return;
    const currentKind = PAINT_ORDER[this.currentStepIndex];
    const hit = this.shapes.find((s) => !s.painted && s.kind === currentKind && this.containsPointByBounds(s, pointer.x, pointer.y));
    if (!hit) return;

    // If the hand is guiding painting, hide it as soon as the kid starts painting the correct next shape.
    if (this.shouldGuidePaint()) {
      const next = this.getHintTargetShape();
      if (next && hit === next) this.hideGuideHand();
    }

    if (this.selectedTool === 'eraser') {
      // Erase gradually (brush erase), not instant reset.
      this.painting = true;
      this.activePointerId = pointer.id;
      this.currentPaintTarget = hit;
      this.setCursor('pointer');
      hit.lastPaint = undefined;
      this.eraseAtPointer(hit, pointer.x, pointer.y);
      return;
    }

    this.painting = true;
    this.activePointerId = pointer.id;
    this.currentPaintTarget = hit;
    this.setCursor('pointer');
    this.paintAtPointer(hit, pointer.x, pointer.y);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    this.noteInteraction();
    if (!this.painting) return;
    if (this.activePointerId !== undefined && pointer.id !== this.activePointerId) return;
    const hit = this.currentPaintTarget;
    if (!hit || hit.painted) return;
    if (!this.containsPointByBounds(hit, pointer.x, pointer.y)) return;
    if (this.selectedTool === 'eraser') {
      this.eraseAtPointer(hit, pointer.x, pointer.y);
      return;
    }
    this.paintAtPointer(hit, pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    this.noteInteraction();
    if (this.activePointerId !== undefined && pointer.id !== this.activePointerId) return;
    this.painting = false;
    this.activePointerId = undefined;
    this.setCursor(this.brushCursor);
    const shape = this.currentPaintTarget;
    this.currentPaintTarget = undefined;
    if (shape && this.selectedTool !== 'eraser') this.maybeFinalizeShape(shape);
  }

  private getCoverageRatio(shape: PaintShape): number {
    const total = shape.coverageSamples.length;
    if (total <= 0) return 0;
    return shape.coverageMarkedCount / total;
  }

  private eraseAtPointer(shape: PaintShape, x: number, y: number) {
    if (shape.painted) return;
    if (!this.containsPointByBounds(shape, x, y)) return;

    const p = new Phaser.Math.Vector2(x, y);
    if (shape.lastPaint && Phaser.Math.Distance.BetweenPoints(shape.lastPaint, p) < this.brushRadius * 0.55) return;
    shape.lastPaint = p;

    // ERASE blend removes pixels from the paint layer (still clipped by stencil mask).
    shape.fillGfx.setBlendMode(Phaser.BlendModes.ERASE);
    shape.fillGfx.fillStyle(0xffffff, 1);
    shape.fillGfx.fillCircle(x, y, this.brushRadius);

    this.updateCoverageAt(shape, x, y, false);
  }

  private updateCoverageAt(shape: PaintShape, x: number, y: number, covered: boolean) {
    if (!shape.coverageSamples.length) return;
    const r2 = this.brushRadius * this.brushRadius;
    for (let i = 0; i < shape.coverageSamples.length; i++) {
      if (covered) {
        if (shape.coverageMarked[i]) continue;
      } else if (!shape.coverageMarked[i]) {
        continue;
      }
      const p = shape.coverageSamples[i]!;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= r2) {
        if (covered) {
          shape.coverageMarked[i] = 1;
          shape.coverageMarkedCount += 1;
        } else {
          shape.coverageMarked[i] = 0;
          shape.coverageMarkedCount = Math.max(0, shape.coverageMarkedCount - 1);
        }
      }
    }
  }

  private rebuildCoverageSamples(shape: PaintShape) {
    shape.coverageSamples = [];
    shape.coverageMarked = new Uint8Array();
    shape.coverageMarkedCount = 0;

    const key = shape.stencil.texture.key;
    if (!this.textures.exists(key)) return;
    const tex = this.textures.get(key);
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
    if (!src) return;

    const b = shape.bounds;
    const step = Math.max(6, Math.floor(this.brushRadius * 0.75));
    const alphaThreshold = 8;

    let canvas: HTMLCanvasElement;
    if (src instanceof HTMLCanvasElement) {
      canvas = src;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(src, 0, 0);
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    const w = Math.max(1, Math.floor(b.width));
    const h = Math.max(1, Math.floor(b.height));
    const flipX = shape.stencil.flipX;

    const samples: Phaser.Math.Vector2[] = [];
    for (let yy = b.y + step / 2; yy <= b.bottom - 1; yy += step) {
      for (let xx = b.x + step / 2; xx <= b.right - 1; xx += step) {
        const u0 = (xx - b.x) / w;
        const u = flipX ? 1 - u0 : u0;
        const v = (yy - b.y) / h;
        const sx = Math.max(0, Math.min(canvas.width - 1, Math.floor(u * (canvas.width - 1))));
        const sy = Math.max(0, Math.min(canvas.height - 1, Math.floor(v * (canvas.height - 1))));
        const a = data[(sy * canvas.width + sx) * 4 + 3];
        if (a > alphaThreshold) samples.push(new Phaser.Math.Vector2(Math.round(xx), Math.round(yy)));
      }
    }

    shape.coverageSamples = samples;
    shape.coverageMarked = new Uint8Array(samples.length);
    shape.coverageMarkedCount = 0;
  }

  private paintAtPointer(shape: PaintShape, x: number, y: number) {
    if (shape.painted) return;
    if (!this.containsPointByBounds(shape, x, y)) return;

    const selectedColor = this.getSelectedColor();
    if (selectedColor === undefined) return;

    const next = this.getHintTargetShape();
    if (next && shape === next && this.shouldGuidePaint()) this.hideGuideHand();
    // If the kid changes color mid-way, treat it as "paint again" on the same part.
    if (shape.usedColor !== undefined && shape.usedColor !== selectedColor) {
      shape.fillGfx.clear();
      shape.strokes = 0;
      shape.lastPaint = undefined;
      shape.usedColor = selectedColor;
      shape.coverageMarked.fill(0);
      shape.coverageMarkedCount = 0;
    } else if (shape.usedColor === undefined) {
      shape.usedColor = selectedColor;
    }

    const p = new Phaser.Math.Vector2(x, y);
    if (shape.lastPaint && Phaser.Math.Distance.BetweenPoints(shape.lastPaint, p) < this.brushRadius * 0.6) return;
    shape.lastPaint = p;

    shape.fillGfx.setBlendMode(Phaser.BlendModes.NORMAL);
    shape.fillGfx.fillStyle(selectedColor, 1);
    shape.fillGfx.fillCircle(x, y, this.brushRadius);

    shape.strokes += 1;
    this.updateCoverageAt(shape, x, y, true);
    if (this.getCoverageRatio(shape) >= this.coverageRequiredRatio) this.completeShape(shape);
  }

  private maybeFinalizeShape(shape: PaintShape) {
    if (shape.painted) return;
    if (this.getCoverageRatio(shape) < this.coverageRequiredRatio) return;
    this.completeShape(shape);
  }

  private completeShape(shape: PaintShape) {
    if (shape.painted) return;
    const finalColor = shape.usedColor;
    const isCorrect = finalColor !== undefined && finalColor === shape.targetColor;

    if (!isCorrect) {
      this.playWrongSound();
      // Let the kid "paint again" immediately.
      shape.fillGfx.clear();
      shape.strokes = 0;
      shape.lastPaint = undefined;
      shape.usedColor = undefined;
      shape.coverageMarked.fill(0);
      shape.coverageMarkedCount = 0;
      return;
    }

    shape.painted = true;
    shape.lastPaint = undefined;
    this.hideGuideHand();
    this.noteInteraction();

    // Snap to a clean solid fill (still clipped by stencil mask).
    const b = shape.bounds;
    shape.fillGfx.clear();
    shape.fillGfx.fillStyle(shape.targetColor, 1);
    shape.fillGfx.fillRect(b.x, b.y, b.width, b.height);

    this.playCorrectSound();

    // Check if current step is done
    const currentKind = PAINT_ORDER[this.currentStepIndex];
    const remainingOfKind = this.shapes.some((s) => s.kind === currentKind && !s.painted);
    if (!remainingOfKind) {
      // Advance step
      if (this.currentStepIndex < PAINT_ORDER.length - 1) {
        this.currentStepIndex++;
        this.time.delayedCall(600, () => {
          if (!this.scene.isActive()) return;
          this.playGuideVoice();
          // Update guide hand key color etc if needed
          this.updateGuideHandPosition();
        });
      }
    }

    if (this.shapes.every((s) => s.painted)) {
      this.time.delayedCall(450, () => {
        this.game.events.emit(FLOW_GO_COUNT, {});
      });
      return;
    }
  }

  private containsPointByBounds(shape: PaintShape, px: number, py: number): boolean {
    // For assets, use bounds hit-test (fine for kid game); mask still clips paint visually.
    const b = shape.bounds;
    return px >= b.x && px <= b.right && py >= b.y && py <= b.bottom;
  }

  private layoutBoard() {
    const w = this.scale.width;
    const h = this.scale.height;
    // On small screens, make the board occupy more of the viewport to reduce downscale blur.
    const minSide = Math.min(w, h);
    const isSmallScreen = minSide < 720;
    const margin = minSide * (isSmallScreen ? 0.03 : 0.06);

    // Only shrink width (not height).
    const widthScale = isSmallScreen ? 0.98 : 1.05;
    const maxWBase = w - margin * 2;
    // Shrink max height slightly to make the board smaller vertically
    const maxH = (h - margin * 2) * 0.92;

    const ratio = this.getBoardAssetRatio() ?? 1.45;
    // Fit by ratio first, then squash width only (keeps height unchanged).
    const bh = Math.min(maxH, maxWBase / ratio);
    const bw = bh * ratio * widthScale;

    const yOffset = Math.min(100, margin + 30);
    this.boardRect.setTo((w - bw) / 2, (h - bh) / 2 + yOffset, bw, bh);

    const pad = Math.max(18, bw * 0.06);
    this.boardInnerRect.setTo(this.boardRect.x + pad, this.boardRect.y + pad, this.boardRect.width - pad * 2, this.boardRect.height - pad * 2);

    // Palette on the right, Character on the left
    const paletteW = Math.max(110, this.boardInnerRect.width * 0.22);
    this.paletteRect.setTo(this.boardInnerRect.right - paletteW, this.boardInnerRect.y, paletteW, this.boardInnerRect.height);
    this.contentRect.setTo(this.boardInnerRect.x, this.boardInnerRect.y, this.boardInnerRect.width - paletteW, this.boardInnerRect.height);

    this.createBoardImageIfNeeded();
    if (this.boardImage) {
      this.boardImage.setPosition(this.boardRect.centerX, this.boardRect.centerY);
      this.boardImage.setDisplaySize(this.boardRect.width, this.boardRect.height);
    } else if (this.boardFallbackGfx) {
      this.boardFallbackGfx.clear();
      this.boardFallbackGfx.fillStyle(0xffffff, 0.92);
      this.boardFallbackGfx.fillRoundedRect(this.boardRect.x, this.boardRect.y, this.boardRect.width, this.boardRect.height, 18);
      this.boardFallbackGfx.lineStyle(6, 0xd1d5db, 1);
      this.boardFallbackGfx.strokeRoundedRect(this.boardRect.x, this.boardRect.y, this.boardRect.width, this.boardRect.height, 18);
    }

    this.positionBannerAssets();
    this.layoutCharacter();
    this.layoutPalette();
  }

  private layoutCharacter() {
    if (!this.shapes.length) return;
    const r = this.contentRect;
    const cx = r.centerX;

    // Deterministic layout: align edges exactly (touching where needed)
    // - hat centered above head (small gap)
    // - head touches neck
    // - neck touches body
    // - arms align to body top
    // - legs touch body bottom
    // - shoes touch legs
    const bodyBase = 260; // reference px (only ratios matter after scaling)
    const headDBase = bodyBase * 0.78;
    const hatWBase = headDBase * 1.12;
    const hatHBase = headDBase * 0.78;
    const gapHatHeadBase = headDBase * 0.05;
    // Make neck/arms/legs bigger within the same layout (still touching at joints).
    const neckWBase = headDBase * 0.35;
    const neckHBase = headDBase * 0.55;
    const armWBase = bodyBase * 0.82;
    const armHBase = bodyBase * 0.22;
    const legWBase = bodyBase * 0.28;
    const legHBase = bodyBase * 0.82;
    const legGapBase = legWBase * 0.82; // tách 2 chân ra thêm nhưng vẫn giữ kết nối
    const shoeWBase = legWBase * 1.3;
    const shoeHBase = legWBase * 1.05;

    const totalHBase = hatHBase + gapHatHeadBase + headDBase + neckHBase + bodyBase + legHBase + shoeHBase;
    const totalWBase = Math.max(hatWBase, bodyBase + armWBase * 2, shoeWBase * 2 + legGapBase * 2);
    // Leave a tiny padding so the character isn't height-clamped to the top;
    // this allows `characterLiftY` to visually move the character upward without clipping.
    const pad = 0.03;
    const baseS = Math.min((r.width * (1 - pad * 2)) / totalWBase, (r.height * (1 - pad * 2)) / totalHBase);
    const s = baseS * 1.24; // tăng thêm kích thước toàn bộ bộ phận

    const hatW = hatWBase * s;
    const hatH = hatHBase * s;
    const gapHatHead = gapHatHeadBase * s;
    const headD = headDBase * s;
    const neckW = neckWBase * s;
    const neckH = neckHBase * s;
    const body = bodyBase * s;
    const armW = armWBase * s;
    const armH = armHBase * s;
    const legW = legWBase * s;
    const legH = legHBase * s;
    const legGap = legGapBase * s;
    const shoeW = shoeWBase * s;
    const shoeH = shoeHBase * s;

    // Tiny separation between parts (not fully touching).
    const jointGap = 2; // px

    const totalH = hatH + gapHatHead + headD + jointGap + neckH + jointGap + body + jointGap + legH + jointGap + shoeH;
    const unclampedTop = r.y + (r.height - totalH) / 2 + this.characterLiftY;
    // If the character already touches the top of `contentRect`, `characterLiftY` appears to do nothing
    // because it's clamped to `r.y`. Allow lifting into the board frame area.
    const minTop = this.boardRect.y + 12;
    const maxTop = this.contentRect.bottom - totalH - 12;
    const top = Phaser.Math.Clamp(unclampedTop, minTop, maxTop);

    const hatCy = top + hatH / 2;
    const headCy = hatCy + hatH / 2 + gapHatHead + headD / 2;
    const neckCy = headCy + headD / 2 + jointGap + neckH / 2;
    const bodyTopY = neckCy + neckH / 2 + jointGap;
    const bodyCy = bodyTopY + body / 2;
    const armCy = bodyTopY - jointGap - armH / 2 + 50;
    const legTopY = bodyCy + body / 2 + jointGap;
    const legCy = legTopY + legH / 2;
    const shoeTopY = legCy + legH / 2 + jointGap;
    const shoeCy = shoeTopY + shoeH / 2;

    // Add a tiny horizontal gap so arms don't touch the body sides.
    const armBodyGap = 2; // px
    const leftArmCx = cx - body / 2 - armBodyGap - armW / 2;
    const rightArmCx = cx + body / 2 + armBodyGap + armW / 2;
    const leftLegCx = cx - legGap;
    const rightLegCx = cx + legGap;

    const placements: Array<{ label: string; cx: number; cy: number; w: number; h: number; flipX?: boolean }> = [
      { label: 'Mũ', cx, cy: hatCy, w: hatW, h: hatH },
      { label: 'Đầu', cx, cy: headCy, w: headD, h: headD },
      { label: 'Cổ', cx, cy: neckCy, w: neckW, h: neckH },
      { label: 'Thân', cx, cy: bodyCy, w: body, h: body },
      { label: 'Tay trái', cx: leftArmCx, cy: armCy, w: armW, h: armH },
      { label: 'Tay phải', cx: rightArmCx, cy: armCy, w: armW, h: armH, flipX: true },
      { label: 'Chân trái', cx: leftLegCx, cy: legCy, w: legW, h: legH },
      { label: 'Chân phải', cx: rightLegCx, cy: legCy, w: legW, h: legH },
      { label: 'Giày trái', cx: leftLegCx, cy: shoeCy, w: shoeW, h: shoeH },
      { label: 'Giày phải', cx: rightLegCx, cy: shoeCy, w: shoeW, h: shoeH, flipX: true },
    ];

    placements.forEach((p) => {
      const shape = this.shapes.find((s) => s.label === p.label);
      if (!shape) return;

      const cxPx = Math.round(p.cx);
      const cyPx = Math.round(p.cy);
      const wPx = Math.round(p.w);
      const hPx = Math.round(p.h);

      shape.center.set(cxPx, cyPx);
      shape.bounds.setTo(cxPx - wPx / 2, cyPx - hPx / 2, wPx, hPx);
      shape.size.w = wPx;
      shape.size.h = hPx;

      shape.stencil.setPosition(cxPx, cyPx);
      shape.stencil.setDisplaySize(wPx, hPx);
      shape.stencil.setFlipX(!!p.flipX);

      // Lower threshold so kids don't need to scrub too long for large parts.
      shape.requiredStrokes = Math.max(12, Math.floor((wPx * hPx) / 8000));
      this.rebuildCoverageSamples(shape);
    });
  }

  private layoutPalette() {
    if (!this.paletteDots.length || !this.paletteRect.width) return;
    const pr = this.paletteRect;
    const cx = pr.centerX;

    const gap = 20; // khoảng cách dọc giữa các item màu
    const items: Array<{ w: number; h: number; setPos: (x: number, y: number) => void }> = [];

    this.paletteDots.forEach((d) => {
      items.push({
        w: d.displayWidth,
        h: d.displayHeight,
        setPos: (x, y) => d.setPosition(x, y),
      });
    });
    if (this.eraserBtn) {
      items.push({
        w: this.eraserBtn.width || 64,
        h: this.eraserBtn.height || 48,
        setPos: (x, y) => this.eraserBtn!.setPosition(x, y),
      });
    }

    const totalH = items.reduce((sum, it) => sum + it.h, 0) + gap * Math.max(0, items.length - 1);

    // Center vertically in the palette strip
    let y = pr.centerY - totalH / 2;

    items.forEach((it, idx) => {
      const py = Math.round(y + it.h / 2);
      it.setPos(cx, py);
      y += it.h + (idx === items.length - 1 ? 0 : gap);
    });

    this.updatePaletteRings();

    if (this.guideHand) {
      this.updateGuideHandPosition();
      if (this.guideHand.visible) {
        this.hideGuideHand();
        this.showGuideHand();
      }
    }
  }

  private updatePaletteRings() {
    const selectedAlpha = 1;
    const otherAlpha = 0.4;
    this.paletteDots.forEach((d, idx) => {
      if (this.selectedTool === 'eraser') {
        d.setAlpha(otherAlpha);
        return;
      }
      d.setAlpha(idx === this.paletteSelectedIndex ? selectedAlpha : otherAlpha);
    });
    this.eraserBtn?.setAlpha(this.selectedTool === 'eraser' ? selectedAlpha : otherAlpha);
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
    const { width, height } = src as unknown as { width: number; height: number };
    return width / height;
  }

  private ensureBannerAssets() {
    if (!this.textures.exists(this.bannerBgKey)) return;

    if (!this.bannerBg) {
      this.bannerBg = this.add.image(0, 0, this.bannerBgKey).setOrigin(0.5, 0.5).setDepth(35);
    }

    const key = 'banner_title_1';
    if (this.bannerTextImage) {
      this.bannerTextImage.destroy();
      this.bannerTextImage = undefined;
    }
    if (key && this.textures.exists(key)) {
      this.bannerTextImage = this.add.image(0, 0, key).setOrigin(0.5, 0.5).setDepth(36);
    }

    this.positionBannerAssets();
  }

  private positionBannerAssets() {
    if (!this.bannerBg) return;

    // Allow the banner to stretch wider without increasing height.
    const maxWidth = Math.min(this.scale.width * 0.98, 1300);
    const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;
    // Base size for height calculation (kept constant even if we stretch X).
    const baseWidthForHeight = Math.min(Math.min(this.scale.width * 0.92, 1050), this.boardRect.width * 0.95);
    // Increase banner height by 25% (multiply by 1.25)
    const targetHeight = (bgRatio ? baseWidthForHeight / bgRatio : this.bannerBg.displayHeight) * 1.25;
    // Increase X only (stretch horizontally), keep Y the same.
    const targetWidth = Math.min(maxWidth, baseWidthForHeight * 1.3);
    const x = this.boardRect.centerX;
    const y = Math.max(targetHeight / 2 + 8, this.boardRect.y - targetHeight / 2 - 8);
    this.bannerBg.setDisplaySize(targetWidth, targetHeight);
    this.bannerBg.setPosition(x, y);

    if (this.bannerTextImage) {
      const key = this.bannerTextImage.texture.key;
      const textRatio = this.getTextureRatio(key) ?? 1;
      // Keep text aspect ratio (do NOT stretch); just fit inside the stretched banner.
      const maxTextWidth = targetWidth * 0.88;
      const maxTextHeight = targetHeight * 0.88;
      const widthFromHeight = textRatio ? maxTextHeight * textRatio : maxTextWidth;
      const textWidth = Math.min(maxTextWidth, widthFromHeight);
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
    const { width, height } = src as unknown as { width: number; height: number };
    return width / height;
  }
}
