import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { FLOW_GO_END } from '../flow/events';
import { BOARD_ASSET_KEYS, SHAPE_ASSET_KEYS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';

import { HandTutorial } from '../ui/HandTutorial';

export class CountConnectScene extends Phaser.Scene {
  private shapes: Phaser.GameObjects.Container[] = [];
  private targets: Phaser.GameObjects.Zone[] = [];
  private completedShapes: Set<number> = new Set();
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
    this.completedShapes.clear();

    this.addBackground();
    this.createLayout();

    this.playGuideVoice();

    // Setup Tutorial
    this.handTutorial = new HandTutorial(this);
    this.handTutorial.setTarget(() => {
      // Find unconnected valid shape (1 or 2)
      const targetId = (!this.completedShapes.has(1)) ? 1 : (!this.completedShapes.has(2) ? 2 : null);
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
    // const h = this.scale.height;
    // this.add.image(w / 2, h / 2, 'bg1').setDisplaySize(w, h).setDepth(-10);

    // Banner
    const bannerY = 90;
    if (this.textures.exists(BOARD_ASSET_KEYS.bannerBg)) {
      const banner = this.add.image(w / 2, bannerY, BOARD_ASSET_KEYS.bannerBg);
      banner.setDisplaySize(Math.min(w * 0.8, 1200), 100);
    }

    const bannerText = this.add.image(w / 2, bannerY, BOARD_ASSET_KEYS.bannerTextLevel2).setOrigin(0.5);
    // Scale banner text to fit within banner width
    const bannerWidth = Math.min(w * 0.8, 1100);
    const maxTextWidth = bannerWidth * 0.9;
    const maxTextHeight = 100 * 0.8;

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

    container.on('dragstart', (_pointer: Phaser.Input.Pointer) => {
      this.handTutorial?.onInteraction();
      this.game.canvas.style.cursor = 'grabbing';
      this.children.bringToTop(container);
    });

    container.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      container.x = dragX;
      container.y = dragY;
    });

    container.on('dragend', () => {
      this.game.canvas.style.cursor = 'default';
      this.checkDrop(container);
    });

    this.shapes.push(container);
  }

  private checkDrop(shape: Phaser.GameObjects.Container) {
    const shapeId = shape.getData('id');

    // Tìm target mà shape đang chạm vào (dùng center point của shape check với bounds target)
    const centerX = shape.x;
    const centerY = shape.y;

    const hitTarget = this.targets.find(t => Phaser.Geom.Rectangle.Contains(t.getBounds(), centerX, centerY));

    if (hitTarget) {
      const targetId = hitTarget.getData('id');
      if (this.isValidMatch(shapeId, targetId)) {
        // Correct
        AudioManager.play('sfx_correct');
        AudioManager.playCorrectAnswer();

        // Snap to target
        shape.setPosition(hitTarget.x, hitTarget.y);
        shape.disableInteractive();
        this.completedShapes.add(shapeId);

        // Correct Animation
        this.tweens.add({
          targets: shape,
          scaleX: 1.2,
          scaleY: 1.2,
          duration: 200,
          yoyo: true,
          ease: 'Back.easeOut'
        });

        this.checkWin();
      } else {
        // Wrong Target
        AudioManager.play('sfx_wrong');
        this.tweens.add({
          targets: shape,
          x: shape.input!.dragStartX,
          y: shape.input!.dragStartY,
          duration: 300,
          ease: 'Cubic.out'
        });

        // Shake logic
        this.tweens.add({
          targets: shape,
          x: shape.input!.dragStartX + 10,
          duration: 50,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.easeInOut',
          delay: 300 // wait for return
        });

        this.handTutorial?.showNow();
      }
    } else {
      // No Target - just return
      this.tweens.add({
        targets: shape,
        x: shape.input!.dragStartX,
        y: shape.input!.dragStartY,
        duration: 300,
        ease: 'Cubic.out'
      });
    }
  }

  private isValidMatch(shapeId: number, targetId: number): boolean {
    // 100 = Rect (Left). 200 = Square (Right).
    // Shapes: 1 (L) -> Rect
    // Shapes: 2 (R) -> Square
    if (shapeId === 3 || shapeId === 4) return false;

    if (targetId === 100) return (shapeId === 1);
    if (targetId === 200) return (shapeId === 2);
    return false;
  }


  private checkWin() {
    // Only need 2 correct connections now (Shape 1 and Shape 2)
    if (this.completedShapes.size === 2) {
      this.handTutorial?.stop();
      this.time.delayedCall(1000, () => {
        this.game.events.emit(FLOW_GO_END, {});
      });
    }
  }
}
