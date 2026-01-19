import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { FLOW_GO_END } from '../flow/events';
import { BOARD_ASSET_KEYS, LEVEL2_ASSET_KEYS, NUMBER_ASSETS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';

type ShapeKind = 'circle' | 'triangle' | 'rectangle' | 'square';

type CountConnectItem = {
  kind: ShapeKind;
  label: string;
  expected: number;
  iconImage?: Phaser.GameObjects.Image;
  startBox: Phaser.GameObjects.Zone;
  connected: boolean;
};

type NumberTarget = {
  n: number;
  image?: Phaser.GameObjects.Image;
  boxRect?: Phaser.GameObjects.Rectangle;
  hitRect: Phaser.Geom.Rectangle;
};

export class CountConnectScene extends Phaser.Scene {
  private boardFallbackGfx?: Phaser.GameObjects.Graphics;
  private boardImage?: Phaser.GameObjects.Image;
  private boardRect = new Phaser.Geom.Rectangle();
  private boardInnerRect = new Phaser.Geom.Rectangle();
  private readonly boardAssetKey = BOARD_ASSET_KEYS.frame;

  private bannerBg?: Phaser.GameObjects.Image;
  private bannerTextImage?: Phaser.GameObjects.Image;
  private readonly bannerBgKey = BOARD_ASSET_KEYS.bannerBg;

  private pictureGfx?: Phaser.GameObjects.Graphics;
  private pictureText?: Phaser.GameObjects.Text;
  private pictureImage?: Phaser.GameObjects.Image;

  private items: CountConnectItem[] = [];
  private numberTargets: NumberTarget[] = [];

  private dragLine?: Phaser.GameObjects.Graphics;
  private fixedLines?: Phaser.GameObjects.Graphics;

  private dragging?: { item: CountConnectItem };
  private connections: Array<{ kind: ShapeKind; n: number }> = [];

  constructor() {
    super('CountConnectScene');
  }

  init(data: { gameData: GameData }) {
    void data.gameData;
  }

  preload() {
    loadAssetGroups(this, 'shared', 'numbers', 'ui', 'colorScene', 'level2');
  }

  create() {
    this.items.forEach((i) => {
      i.iconImage?.destroy();
      i.startBox.destroy();
    });
    this.items = [];
    this.numberTargets.forEach((t) => {
      t.image?.destroy();
      t.boxRect?.destroy();
    });
    this.numberTargets = [];
    this.dragging = undefined;
    this.connections = [];

    this.dragLine?.destroy();
    this.dragLine = undefined;
    this.fixedLines?.destroy();
    this.fixedLines = undefined;

    this.boardImage?.destroy();
    this.boardImage = undefined;
    this.boardFallbackGfx?.destroy();
    this.boardFallbackGfx = this.add.graphics().setDepth(0);

    this.bannerBg?.destroy();
    this.bannerBg = undefined;
    this.bannerTextImage?.destroy();
    this.bannerTextImage = undefined;

    this.pictureGfx?.destroy();
    this.pictureGfx = undefined;
    this.pictureText?.destroy();
    this.pictureText = undefined;
    this.pictureImage?.destroy();
    this.pictureImage = undefined;

    this.layoutBoard();
    this.scale.on('resize', this.layoutBoard, this);

    this.ensureBannerAssets();
    this.createPicturePlaceholder();
    this.createConnectUI();
    this.layoutBoard();

    this.playGuideVoice();

    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layoutBoard, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    });
  }

  private playGuideVoice() {
    AudioManager.stopGuideVoices();
    AudioManager.playWhenReady('voice_guide_25');
  }

  private playCorrectSound() {
    AudioManager.play('sfx_correct');
    AudioManager.playCorrectAnswer?.();
  }

  private playWrongSound() {
    AudioManager.stopGuideVoices();
    AudioManager.play('sfx_wrong');
  }

  private createPicturePlaceholder() {
    // Use provided picture asset; fallback to placeholder if missing.
    if (this.textures.exists(LEVEL2_ASSET_KEYS.picture)) {
      this.setTextureCrisp(LEVEL2_ASSET_KEYS.picture);
      this.pictureImage = this.add.image(0, 0, LEVEL2_ASSET_KEYS.picture).setOrigin(0, 0).setDepth(6);
      return;
    }

    const gfx = this.add.graphics().setDepth(5);
    const txt = this.add
      .text(0, 0, 'BỨC TRANH', {
        fontFamily: 'Baloo, Arial',
        fontSize: '26px',
        color: '#111827',
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.pictureGfx = gfx;
    this.pictureText = txt;
  }

  private createConnectUI() {
    // Hard-coded counts until the final picture/level data is provided.
    // Update these numbers to match the actual picture.
    // Counts for the stick-figure picture:
    // circle: 1 head, triangle: 1 hat + 2 shoes = 3, rectangle: 1 neck + 2 arms + 2 legs = 5, square: 1 body.
    const counts: Record<ShapeKind, number> = { circle: 1, triangle: 3, rectangle: 5, square: 1 };

    this.fixedLines = this.add.graphics().setDepth(8);
    this.dragLine = this.add.graphics().setDepth(9);

    const makeItem = (kind: ShapeKind, label: string, iconKey: string) => {
      this.setTextureCrisp(iconKey);
      const iconImage = this.textures.exists(iconKey) ? this.add.image(0, 0, iconKey).setOrigin(0.5).setDepth(7) : undefined;
      // Invisible hit area (so we don't render a drawn square/rectangle).
      const startBox = this.add.zone(0, 0, 112, 112).setOrigin(0.5).setDepth(7).setInteractive({ useHandCursor: true });

      const item: CountConnectItem = {
        kind,
        label,
        expected: counts[kind],
        iconImage,
        startBox,
        connected: false,
      };

      startBox.on('pointerdown', () => {
        if (item.connected) return;
        this.dragging = { item };
        this.drawDragLine(startBox.x, startBox.y, startBox.x, startBox.y);
      });

      return item;
    };

    this.items = [
      makeItem('circle', 'Hình tròn', LEVEL2_ASSET_KEYS.iconCircle),
      makeItem('triangle', 'Hình tam giác', LEVEL2_ASSET_KEYS.iconTriangle),
      makeItem('rectangle', 'Hình chữ nhật', LEVEL2_ASSET_KEYS.iconRectangle),
      makeItem('square', 'Hình vuông', LEVEL2_ASSET_KEYS.iconSquare),
    ];

    const targets: NumberTarget[] = [];
    for (let i = 0; i < 5; i++) {
      const n = i + 1;
      const key = NUMBER_ASSETS.keys[i];
      this.setTextureCrisp(key);
      let image: Phaser.GameObjects.Image | undefined;
      if (this.textures.exists(key)) {
        image = this.add.image(0, 0, key).setOrigin(0.5).setDepth(7);
      }
      const boxRect = this.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setOrigin(0.5).setDepth(6).setStrokeStyle(2, 0xff4d4d, 1);
      targets.push({ n, image, boxRect, hitRect: new Phaser.Geom.Rectangle() });
    }
    this.numberTargets = targets;
  }

  private setTextureCrisp(key: string) {
    if (!this.textures.exists(key)) return;
    const tex = this.textures.get(key);
    tex.setFilter?.(Phaser.Textures.FilterMode.LINEAR);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    const { item } = this.dragging;
    const linePad = 6; // push to the visible edge (line width + stroke)
    const from = this.getItemEdgePoint(item, pointer.x, pointer.y, linePad);
    this.drawDragLine(from.x, from.y, pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    const { item } = this.dragging;
    this.dragging = undefined;
    this.clearDragLine();

    const hit = this.findHitNumber(pointer.x, pointer.y);
    if (!hit || hit.n !== item.expected) {
      this.playWrongSound();
      return;
    }

    item.connected = true;
    item.startBox.disableInteractive();
    item.iconImage?.setAlpha(1);

    this.connections.push({ kind: item.kind, n: hit.n });
    const linePad = 6;
    const to = this.getNumberAnchor(hit, item, linePad);
    const from = this.getItemEdgePoint(item, to.x, to.y, linePad);
    this.drawFixedConnection(from.x, from.y, to.x, to.y);
    this.playCorrectSound();

    if (this.items.every((i) => i.connected)) {
      this.time.delayedCall(450, () => {
        this.game.events.emit(FLOW_GO_END, { marblesTotal: 0, ballsTotal: 0 });
      });
    }
  }

  private findHitNumber(x: number, y: number): NumberTarget | undefined {
    const hits = this.numberTargets
      .map((t) => ({ t, d: Phaser.Math.Distance.Between(x, y, t.hitRect.centerX, t.hitRect.centerY) }))
      .filter(({ t, d }) => t.hitRect.contains(x, y) || d < Math.max(t.hitRect.width, t.hitRect.height) * 0.55)
      .sort((a, b) => a.d - b.d);
    return hits[0]?.t;
  }

  private drawDragLine(x1: number, y1: number, x2: number, y2: number) {
    if (!this.dragLine) return;
    this.dragLine.clear();
    this.dragLine.lineStyle(4, 0x374151, 0.9);
    drawDashedLine(this.dragLine, x1, y1, x2, y2, 14, 10);
  }

  private clearDragLine() {
    this.dragLine?.clear();
  }

  private drawFixedConnection(x1: number, y1: number, x2: number, y2: number) {
    if (!this.fixedLines) return;
    this.fixedLines.lineStyle(4, 0x374151, 0.9);
    drawDashedLine(this.fixedLines, x1, y1, x2, y2, 14, 10);
  }

  private edgePointTowardsPadded(rectCenterX: number, rectCenterY: number, rectW: number, rectH: number, targetX: number, targetY: number, pad: number) {
    const dx = targetX - rectCenterX;
    const dy = targetY - rectCenterY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < 1e-6 && ady < 1e-6) return { x: rectCenterX, y: rectCenterY };
    const hw = rectW / 2 + pad;
    const hh = rectH / 2 + pad;
    const tx = adx < 1e-6 ? Number.POSITIVE_INFINITY : hw / adx;
    const ty = ady < 1e-6 ? Number.POSITIVE_INFINITY : hh / ady;
    const t = Math.min(tx, ty);
    return { x: rectCenterX + dx * t, y: rectCenterY + dy * t };
  }

  private getItemEdgePoint(item: CountConnectItem, targetX: number, targetY: number, pad: number) {
    const icon = item.iconImage;
    const cx = icon?.x ?? item.startBox.x;
    const cy = icon?.y ?? item.startBox.y;
    const w = icon?.displayWidth ?? item.startBox.width;
    const h = icon?.displayHeight ?? item.startBox.height;
    return this.edgePointTowardsPadded(cx, cy, w, h, targetX, targetY, pad);
  }

  private getItemCenter(item: CountConnectItem) {
    return {
      x: item.iconImage?.x ?? item.startBox.x,
      y: item.iconImage?.y ?? item.startBox.y,
    };
  }

  private getNumberAnchor(target: NumberTarget, item: CountConnectItem, pad: number) {
    const itemCenter = this.getItemCenter(item);
    const isItemLeft = itemCenter.x <= target.hitRect.centerX;
    const edgeX = isItemLeft ? target.hitRect.left - pad : target.hitRect.right + pad;

    // If multiple lines connect to the same number, keep their endpoints close together.
    const connectedKinds = this.connections
      .filter((c) => c.n === target.n)
      .map((c) => c.kind)
      .filter((k, idx, arr) => arr.indexOf(k) === idx);
    if (!connectedKinds.includes(item.kind)) connectedKinds.push(item.kind);
    connectedKinds.sort((a, b) => this.items.findIndex((i) => i.kind === a) - this.items.findIndex((i) => i.kind === b));

    const count = connectedKinds.length;
    const idx = Math.max(0, connectedKinds.indexOf(item.kind));
    const gap = 8; // smaller spacing between two lines
    const offsetY = count <= 1 ? 0 : (idx - (count - 1) / 2) * gap;
    const yMargin = Math.max(8, target.hitRect.height * 0.14);
    const edgeY = Phaser.Math.Clamp(target.hitRect.centerY + offsetY, target.hitRect.top + yMargin, target.hitRect.bottom - yMargin);

    return { x: Math.round(edgeX), y: Math.round(edgeY) };
  }

  private layoutBoard() {
    const w = this.scale.width;
    const h = this.scale.height;
    // Make the board slightly smaller to give more breathing room around it.
    const margin = Math.min(w, h) * 0.085;

    // Only shrink width (not height).
    const widthScale = 0.9;
    const maxWBase = w - margin * 2;
    const maxH = h - margin * 2;

    const ratio = this.getBoardAssetRatio() ?? 1.45;
    // Fit by ratio first, then squash width only (keeps height unchanged).
    const bh = Math.min(maxH, maxWBase / ratio);
    const bw = bh * ratio * widthScale;

    const yOffset = Math.min(36, margin);
    this.boardRect.setTo((w - bw) / 2, (h - bh) / 2 + yOffset, bw, bh);

    const pad = Math.max(18, bw * 0.06);
    this.boardInnerRect.setTo(this.boardRect.x + pad, this.boardRect.y + pad, this.boardRect.width - pad * 2, this.boardRect.height - pad * 2);

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
    this.layoutPictureAndUI();
  }

  private layoutPictureAndUI() {
    const r = this.boardInnerRect;

    const groupShiftX = -22; // shift picture + both columns to the left
    const groupShiftY = 6; // shift picture + both columns down

    // Picture (Frame 142) bigger and closer to the board top-left.
    const pictureBoxW = r.width * 0.48;
    const pictureBoxH = r.height * 0.74;
    // Use boardRect so the picture can sit closer to the actual board corner (not limited by inner padding).
    const pictureX = Math.round(this.boardRect.x + 8 + groupShiftX);
    const pictureY = Math.round(this.boardRect.y + 8 + groupShiftY);
    let pictureDisplayW = Math.round(pictureBoxW);
    let pictureDisplayH = Math.round(pictureBoxH);

    if (this.pictureImage) {
      const tex = this.textures.get(this.pictureImage.texture.key);
      const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
      if (src) {
        const { width, height } = src as unknown as { width: number; height: number };
        const sx = pictureBoxW / Math.max(1, width);
        const sy = pictureBoxH / Math.max(1, height);
        const s = Math.min(sx, sy);
        pictureDisplayW = Math.round(width * s);
        pictureDisplayH = Math.round(height * s);
        this.pictureImage.setDisplaySize(pictureDisplayW, pictureDisplayH);
      } else {
        this.pictureImage.setDisplaySize(pictureDisplayW, pictureDisplayH);
      }
      const px = Math.round(pictureX + (pictureBoxW - pictureDisplayW) / 2);
      const py = Math.round(pictureY + (pictureBoxH - pictureDisplayH) / 2);
      this.pictureImage.setPosition(px, py);
    } else {
      if (this.pictureGfx) {
        this.pictureGfx.clear();
        this.pictureGfx.fillStyle(0xf3f4f6, 1);
        this.pictureGfx.fillRoundedRect(pictureX, pictureY, pictureBoxW, pictureBoxH, 18);
        this.pictureGfx.lineStyle(6, 0xd1d5db, 1);
        this.pictureGfx.strokeRoundedRect(pictureX, pictureY, pictureBoxW, pictureBoxH, 18);
      }
      this.pictureText?.setPosition(pictureX + pictureBoxW / 2, pictureY + pictureBoxH / 2);
    }

    const pictureRight = pictureX + pictureBoxW;

    // Numbers ladder (1..5) on the right, spanning almost full height.
    const rowsTop = r.y + r.height * 0.1 + groupShiftY;
    const rowsBottom = r.bottom - r.height * 0.06 + groupShiftY;
    // Make both columns span the same Y range (rowsTop..rowsBottom).
    // Shapes can be slightly bigger than numbers, but the column height stays equal.
    const availableHForBoxes = Math.max(1, rowsBottom - rowsTop);
    const numberCount = Math.max(1, this.numberTargets.length);
    const numberBoxSize = Phaser.Math.Clamp(Math.floor(availableHForBoxes / numberCount), 70, 150);
    const shapeBoxSize = Phaser.Math.Clamp(Math.round(numberBoxSize * 1.15), 72, 185);

    const columnExtraGap = 18;
    const numberX = Math.round(r.right - r.width * 0.06 - numberBoxSize / 2) + groupShiftX + 10 + columnExtraGap;
    const numberLeft = numberX - numberBoxSize / 2;

    // Shapes column between picture and ladder, with large icons and enough space for connecting lines.
    // Move shape column slightly left while keeping space for connecting lines.
    const shapeX = Math.round(pictureRight + (numberLeft - pictureRight) * 0.28) - 28 - 10 - columnExtraGap;

    const itemRows = this.items.length;
    const shapeFirstCy = rowsTop + shapeBoxSize / 2;
    const shapeLastCy = rowsBottom - shapeBoxSize / 2;
    const itemStep = itemRows <= 1 ? 0 : (shapeLastCy - shapeFirstCy) / (itemRows - 1);

    this.items.forEach((item, idx) => {
      const cy = shapeFirstCy + itemStep * idx;
      const boxX = shapeX;
      item.startBox.setSize(shapeBoxSize, shapeBoxSize);

      if (item.iconImage) {
        item.iconImage.setPosition(Math.round(boxX), Math.round(cy));
        // scale bigger, fit inside the hit box, snap to pixel
        const target = Math.max(1, Math.round(shapeBoxSize * 0.92));
        const tex = this.textures.get(item.iconImage.texture.key);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
        if (src) {
          const { width, height } = src as unknown as { width: number; height: number };
          const s = target / Math.max(1, height);
          item.iconImage.setDisplaySize(Math.round(width * s), Math.round(height * s));
        } else {
          item.iconImage.setScale(0.5);
        }
      }

      item.startBox.setPosition(boxX, cy);
    });

    // Numbers as a single vertical "ladder" (touching / no gaps).
    // Make the ladder span match the shapes column span so both columns are equally "long".
    const nTop = rowsTop;
    const extraPixels = Math.max(0, Math.floor(availableHForBoxes) - numberBoxSize * this.numberTargets.length);
    const sizeForIndex = (idx: number) => numberBoxSize + (idx < extraPixels ? 1 : 0);
    const cyForIndex = (idx: number) => {
      let y = nTop;
      for (let i = 0; i < idx; i++) y += sizeForIndex(i);
      return y + sizeForIndex(idx) / 2;
    };

    this.numberTargets.forEach((t, idx) => {
      const size = sizeForIndex(idx);
      const cy = cyForIndex(idx);
      t.hitRect.setTo(numberX - size / 2, cy - size / 2, size, size);
      if (t.boxRect) {
        t.boxRect.setPosition(Math.round(numberX), Math.round(cy));
        t.boxRect.setSize(size, size);
      }
      if (t.image) {
        t.image.setPosition(Math.round(numberX), Math.round(cy));
        const tex = this.textures.get(t.image.texture.key);
        const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | null;
        if (src) {
          const { width, height } = src as unknown as { width: number; height: number };
          const s = size / Math.max(1, height);
          t.image.setDisplaySize(Math.round(width * s), Math.round(height * s));
        } else {
          t.image.setScale(0.6);
        }
      }
    });

    // Redraw fixed connections based on current layout (supports resize/orientation changes).
    if (this.fixedLines) {
      this.fixedLines.clear();
      this.fixedLines.lineStyle(4, 0x374151, 0.9);
      this.connections.forEach((c) => {
        const item = this.items.find((i) => i.kind === c.kind);
        const target = this.numberTargets.find((t) => t.n === c.n);
        if (!item || !target) return;
        const linePad = 6;
        const end = this.getNumberAnchor(target, item, linePad);
        const start = this.getItemEdgePoint(item, end.x, end.y, linePad);
        drawDashedLine(this.fixedLines!, start.x, start.y, end.x, end.y, 14, 10);
      });
    }
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

    const key = 'banner_title_5';
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

    // Stretch bannerBg in X only (do not increase height).
    const maxWidth = Math.min(this.scale.width * 0.98, 860);
    const bgRatio = this.getTextureRatio(this.bannerBgKey) ?? 1;
    const baseWidthForHeight = Math.min(Math.min(this.scale.width * 0.95, 680), this.boardRect.width * 0.9);
    const targetHeight = bgRatio ? baseWidthForHeight / bgRatio : this.bannerBg.displayHeight;
    const targetWidth = Math.min(maxWidth, baseWidthForHeight * 1.3);
    const x = this.boardRect.centerX;
    const y = Math.max(targetHeight / 2 + 8, this.boardRect.y - targetHeight / 2 - 8);
    this.bannerBg.setDisplaySize(targetWidth, targetHeight);
    this.bannerBg.setPosition(x, y);

    if (this.bannerTextImage) {
      const key = this.bannerTextImage.texture.key;
      const textRatio = this.getTextureRatio(key) ?? 1;
      // Keep text aspect ratio (do NOT stretch); fit inside banner.
      const maxTextWidth = targetWidth * 0.86;
      const maxTextHeight = targetHeight * 0.74;
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

function drawDashedLine(gfx: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, dashLen: number, gapLen: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0.001) return;

  const vx = dx / dist;
  const vy = dy / dist;

  const step = dashLen + gapLen;
  let t = 0;
  let lastEnd = 0;

  while (t < dist) {
    const dashStart = t;
    const dashEnd = Math.min(t + dashLen, dist);
    const sx = x1 + vx * dashStart;
    const sy = y1 + vy * dashStart;
    const ex = x1 + vx * dashEnd;
    const ey = y1 + vy * dashEnd;
    gfx.beginPath();
    gfx.moveTo(sx, sy);
    gfx.lineTo(ex, ey);
    gfx.strokePath();
    lastEnd = dashEnd;
    t += step;
  }

  // Ensure the line touches the end even if the dash pattern would end in a gap.
  if (lastEnd < dist - 0.5) {
    const sx = x1 + vx * lastEnd;
    const sy = y1 + vy * lastEnd;
    gfx.beginPath();
    gfx.moveTo(sx, sy);
    gfx.lineTo(x2, y2);
    gfx.strokePath();
  }
}

// drawShapeIcon removed (icons are now PNG assets)
