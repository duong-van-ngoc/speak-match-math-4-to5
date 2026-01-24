import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { FLOW_GO_END } from '../flow/events';
import { BOARD_ASSET_KEYS, SHAPE_ASSET_KEYS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';

import { HandTutorial } from '../ui/HandTutorial';

export class CountConnectScene extends Phaser.Scene {
  private shapes: Phaser.GameObjects.Container[] = [];
  private targets: Phaser.GameObjects.Zone[] = [];
  private connections: Map<number, Phaser.GameObjects.Graphics> = new Map(); // id -> line graphics
  private activeLine?: Phaser.GameObjects.Graphics;
  private draggingSource?: { id: number, x: number, y: number }; // x,y = pointer start position
  private currentDragPath: { x: number, y: number }[] = [];
  private handTutorial?: HandTutorial;
  private isReplay = false;

  constructor() {
    super('CountConnectScene');
  }

  init(data: { gameData: GameData, isReplay?: boolean }) {
    this.isReplay = !!data.isReplay;
    void data.gameData;
  }

  preload() {
    loadAssetGroups(this, 'shared', 'ui', 'shapes');
  }

  create() {
    this.shapes = [];
    this.targets = [];
    this.connections.clear();
    this.activeLine = this.add.graphics().setDepth(100);

    this.addBackground();
    this.createLayout();

    this.playGuideVoice();

    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    // Setup Tutorial
    this.handTutorial = new HandTutorial(this);
    this.handTutorial.setTarget(() => {
      // Find unconnected valid shape (1 or 2)
      const targetId = (!this.connections.has(1)) ? 1 : (!this.connections.has(2) ? 2 : null);
      if (!targetId) return null;

      const shape = this.shapes.find(s => s.getData('id') === targetId);
      // Find target zone
      const tKey = (targetId === 1) ? 100 : 200; // 1->100, 2->200
      const target = this.targets.find(t => t.getData('id') === tKey);

      if (shape && target) {
        // Adjust target pos slightly if needed (like +60/-40 logic)
        let endX = target.x;
        if (tKey === 100) endX += 60;
        if (tKey === 200) endX -= 40;

        // Adjust start Y for Shape 2 ("dịch xuống 1 chút")
        let startY = shape.y;
        if (targetId === 2) startY += 60;

        return { type: 'drag', startX: shape.x, startY: startY, endX: endX, endY: target.y };
      }
      return null;
    });
    if (!this.isReplay) {
      this.handTutorial.start();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.handTutorial?.stop();
    });
  }

  private playGuideVoice() {
    AudioManager.stopGuideVoices();
    // Use Level 2 guide
    AudioManager.play('voice_guide_25');
  }

  private addBackground() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.image(w / 2, h / 2, 'bg1').setDisplaySize(w, h).setDepth(-10);

    // Banner
    const bannerY = 90;
    if (this.textures.exists(BOARD_ASSET_KEYS.bannerBg)) {
      const banner = this.add.image(w / 2, bannerY, BOARD_ASSET_KEYS.bannerBg);
      banner.setDisplaySize(Math.min(w * 0.8, 1200), 100);
    }

    const bannerText = this.add.image(w / 2, bannerY, BOARD_ASSET_KEYS.bannerTextLevel2).setOrigin(0.5);
    // Scale banner text to fit within banner width (smaller as requested)
    const bannerWidth = Math.min(w * 0.8, 1100);
    const maxTextWidth = bannerWidth * 0.75;
    const maxTextHeight = 100 * 0.6;

    const scale = Math.min(maxTextWidth / bannerText.width, maxTextHeight / bannerText.height);
    bannerText.setScale(scale);
  }

  private createLayout() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Draw Board (White rounded rect with blue border)
    const boardW = w * 0.7; // Reduced width
    const boardH = h * 0.8;  // Increased height
    const boardX = w / 2;
    const boardY = h * 0.58;

    const board = this.add.graphics();
    board.fillStyle(0xffffff, 1);
    board.fillRoundedRect(boardX - boardW / 2, boardY - boardH / 2, boardW, boardH, 24);
    board.lineStyle(6, 0x3b82f6, 1);
    board.strokeRoundedRect(boardX - boardW / 2, boardY - boardH / 2, boardW, boardH, 24);

    const leftX = boardX - boardW * 0.22; // Reduced offset
    const rightX = boardX + boardW * 0.22;

    const yOffset = boardH * 0.28;
    const row1Y = boardY - yOffset;
    const row2Y = boardY;
    const row3Y = boardY + yOffset;

    // Targets
    // ID 100 -> Rect (Left)
    this.createTargetZone(100, SHAPE_ASSET_KEYS.targetRect, leftX, row2Y, 390, 195);
    // ID 200 -> Square (Right)
    this.createTargetZone(200, SHAPE_ASSET_KEYS.targetSquare, rightX, row2Y, 195, 195);

    // Shapes - Using same visuals as ColorScene
    // Shape 1 (TL, Rect Group -> 1) -> Left
    this.createTriangleShape(1, leftX, row1Y, 390, 195, -0.3, -0.15);
    // Shape 2 (TL, Square Group -> 2) -> Right
    this.createTriangleShape(2, rightX, row1Y, 195, 195, -0.15, 0.25);

    // Shape 3 (BR, Rect Group -> 1) -> Left
    this.createTriangleShape(3, leftX, row3Y, 390, 195, 0.1, -0.05);
    // Shape 4 (BR, Square Group -> 2) -> Right
    this.createTriangleShape(4, rightX, row3Y, 195, 195, 0.0, 0.15);
  }

  private createTargetZone(id: number, key: string, x: number, y: number, w: number, h: number) {
    if (this.textures.exists(key)) {
      const img = this.add.image(x, y, key);
      img.setDisplaySize(w, h); // Stretch/Fit
    } else {
      // Fallback debug
      const gfx = this.add.graphics();
      gfx.lineStyle(4, 0x888888, 1);
      gfx.strokeRect(x - w / 2, y - h / 2, w, h);
      this.add.text(x, y, `Target ${id}`, { color: '#000' }).setOrigin(0.5);
    }

    // Create Hit Zone
    const zone = this.add.zone(x, y, w, h).setRectangleDropZone(w, h);
    zone.setData('id', id);
    this.targets.push(zone);
  }

  private createTriangleShape(id: number, x: number, y: number, w: number, h: number, textOffXStr: number = 0, textOffYStr: number = 0) {
    const container = this.add.container(x, y);
    container.setData('id', id);
    container.setSize(w, h); // Hit area size

    // Map id to asset key
    let key = '';
    if (id === 1) key = SHAPE_ASSET_KEYS.shape1;
    else if (id === 2) key = SHAPE_ASSET_KEYS.shape2;
    else if (id === 3) key = SHAPE_ASSET_KEYS.shape3;
    else if (id === 4) key = SHAPE_ASSET_KEYS.shape4;

    if (this.textures.exists(key)) {
      const img = this.add.image(0, 0, key);
      img.setDisplaySize(w, h);
      container.add(img);
    } else {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xcceeff, 1);
      gfx.fillRect(-w / 2, -h / 2, w, h);
      container.add(gfx);
    }

    const textX = w * textOffXStr;
    const textY = h * textOffYStr;

    // Use Number Asset
    let numKey = '';
    if (id === 1) numKey = SHAPE_ASSET_KEYS.num1;
    else if (id === 2) numKey = SHAPE_ASSET_KEYS.num2;
    else if (id === 3) numKey = SHAPE_ASSET_KEYS.num3;
    else if (id === 4) numKey = SHAPE_ASSET_KEYS.num4;

    // Fallback
    if (!numKey) numKey = SHAPE_ASSET_KEYS.num1;

    if (this.textures.exists(numKey)) {
      const numImg = this.add.image(textX, textY, numKey);
      // Scale number slightly smaller (0.3)
      const scale = Math.min(w, h) * 0.3 / Math.max(numImg.width, numImg.height);
      numImg.setScale(scale);
      container.add(numImg);
    } else {
      const text = this.add.text(textX, textY, id.toString(), {
        fontSize: '48px', color: '#3b82f6', fontStyle: 'bold', fontFamily: 'Fredoka'
      }).setOrigin(0.5);
      container.add(text);
    }

    // Hit area params (Match ColorScene)
    let hitW = w * 0.9;
    if (id === 2) hitW = w * 0.6; // Shape 2 width smaller

    let hitH = h * 0.9;
    if (id === 2) hitH = h * 1.0; // Shape 2 height larger

    let xOffset = 150;
    if (id === 1) xOffset = 165;
    else if (id === 2) xOffset = 55; // Shape 2 shifted left

    const hitX = -hitW / 2 + xOffset;
    const hitY = -hitH / 2 + 80;

    const hitRect = new Phaser.Geom.Rectangle(hitX, hitY, hitW, hitH);
    container.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);
    this.input.setDraggable(container);

    container.on('pointerover', () => {
      this.game.canvas.style.cursor = 'pointer';
    });
    container.on('pointerout', () => {
      this.game.canvas.style.cursor = 'default';
    });

    container.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      this.handTutorial?.onInteraction();
      this.game.canvas.style.cursor = 'grabbing';
      if (this.connections.has(id)) return; // Already connected
      // Start line from pointer position to allow "edge" dragging
      this.draggingSource = { id, x: pointer.x, y: pointer.y };
      this.currentDragPath = [{ x: pointer.x, y: pointer.y }];
    });

    container.on('dragend', () => {
      this.game.canvas.style.cursor = 'default';
    });

    container.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.draggingSource) return;
      this.updateDragLine(pointer);
    });

    container.on('dragend', () => {
      if (!this.draggingSource) return;
      // Logic handled in onPointerUp usually, but container dragend might be separate
      // Actually I'll use pointerUp global handler for drop check to be easier with zones
    });

    this.shapes.push(container);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.draggingSource) {
      this.updateDragLine(pointer);
    }
  }

  private updateDragLine(pointer: Phaser.Input.Pointer) {
    if (!this.activeLine || !this.draggingSource) return;

    // Add point to path (throttle if needed, but simple push is okay for this scale)
    // Only add if distance is meaningful to avoid massive arrays? 
    // For "smooth" feel, just add.
    const last = this.currentDragPath[this.currentDragPath.length - 1];
    if (!last || Phaser.Math.Distance.Between(last.x, last.y, pointer.x, pointer.y) > 2) {
      this.currentDragPath.push({ x: pointer.x, y: pointer.y });
    }

    this.activeLine.clear();
    this.activeLine.lineStyle(4, 0x333333, 1);

    // Draw freehand path
    this.activeLine.beginPath();
    this.activeLine.moveTo(this.currentDragPath[0].x, this.currentDragPath[0].y);
    for (let i = 1; i < this.currentDragPath.length; i++) {
      this.activeLine.lineTo(this.currentDragPath[i].x, this.currentDragPath[i].y);
    }
    this.activeLine.strokePath();
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (!this.draggingSource) return;

    const sourceId = this.draggingSource.id;
    this.activeLine?.clear();
    this.draggingSource = undefined;

    // Check drop target
    // Simple collision check with targets
    const hitTarget = this.targets.find(t => Phaser.Geom.Rectangle.Contains(t.getBounds(), pointer.x, pointer.y));

    const sourceContainer = this.shapes.find(s => s.getData('id') === sourceId);

    if (hitTarget) {
      const targetId = hitTarget.getData('id');
      if (this.isValidConnection(sourceId, targetId)) {
        // Adjust target point for visual "dashed" area - unused currently
        // (tx, ty logic removed to fix build error)

        // Create permanent connection using the USER'S PATH
        const finalPath = [...this.currentDragPath]; // Copy path

        // Ensure the last point connects nicely to target visual center if desired, 
        // OR just keep user's path. User said "alpha theo drog ve cua be".
        // Let's just use the path as is.
        // DO NOT add extra points, just use what user drew
        // finalPath.push({ x: tx, y: ty });

        this.createPermanentConnection(sourceId, finalPath);
        AudioManager.play('sfx_correct');
        AudioManager.playCorrectAnswer();
        // Correct Animation: Pop
        if (sourceContainer) {
          this.tweens.add({
            targets: sourceContainer,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 200,
            yoyo: true,
            ease: 'Back.easeOut'
          });
        }
        this.checkWin();
      } else {
        AudioManager.play('sfx_wrong');
        // Wrong Animation: Shake
        if (sourceContainer) {
          this.tweens.add({
            targets: sourceContainer,
            x: sourceContainer.x + 10,
            duration: 50,
            yoyo: true,
            repeat: 3,
            ease: 'Sine.easeInOut'
          });
        }
        this.handTutorial?.showNow();
      }
    }
  }

  private isValidConnection(shapeId: number, targetId: number): boolean {
    // 100 = Rect (Left). 200 = Square (Right).
    // Shapes: 1 (L) -> Rect
    // Shapes: 2 (R) -> Square
    // Shapes 3 & 4 are WRONG (distractors)
    if (shapeId === 3 || shapeId === 4) return false;

    if (targetId === 100) return (shapeId === 1);
    if (targetId === 200) return (shapeId === 2);
    return false;
  }

  private createPermanentConnection(shapeId: number, pathPoints: { x: number, y: number }[]) {
    const shape = this.shapes.find(s => s.getData('id') === shapeId);
    if (!shape) return;

    const gfx = this.add.graphics().setDepth(50);
    gfx.lineStyle(4, 0x000000, 1);
    gfx.lineStyle(4, 0x374151, 1);

    if (pathPoints.length > 0) {
      // Simplify points to reduce jitter ("làm mượt hơn")
      const simplified: { x: number, y: number }[] = [];
      simplified.push(pathPoints[0]);

      let lastP = pathPoints[0];
      // Filter intermediate points
      for (let i = 1; i < pathPoints.length - 1; i++) {
        const p = pathPoints[i];
        if (Phaser.Math.Distance.Between(lastP.x, lastP.y, p.x, p.y) > 20) {
          simplified.push(p);
          lastP = p;
        }
      }
      // Always add the very last point from user input
      if (pathPoints.length > 1) {
        simplified.push(pathPoints[pathPoints.length - 1]);
      }

      const points = simplified.map(p => new Phaser.Math.Vector2(p.x, p.y));
      const spline = new Phaser.Curves.Spline(points);
      // Increase resolution for smoothness
      spline.draw(gfx, points.length * 12);
    }

    this.connections.set(shapeId, gfx);

    // Disable interaction based on drag logic check?
    // Since drag start checks connections.has(id), it's fine.
    shape.setAlpha(0.7); // Visual feedback
  }

  private checkWin() {
    // Only need 2 correct connections now (Shape 1 and Shape 2)
    if (this.connections.size === 2) {
      this.handTutorial?.stop();
      this.time.delayedCall(1000, () => {
        this.game.events.emit(FLOW_GO_END, {});
      });
    }
  }
}
