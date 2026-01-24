import Phaser from 'phaser';
import type { GameData } from '../data/gameData';
import { FLOW_GO_COUNT } from '../flow/events';
import { BOARD_ASSET_KEYS, SHAPE_ASSET_KEYS, loadAssetGroups } from '../assets';
import AudioManager from '../AudioManager';

import { HandTutorial } from '../ui/HandTutorial';

export class ColorScene extends Phaser.Scene {
  private shapes: Phaser.GameObjects.Container[] = [];
  private selectedShapes: Set<number> = new Set();
  private handTutorial?: HandTutorial;

  private isReplay = false;

  constructor() {
    super('ColorScene');
  }

  init(data: { gameData: GameData, isReplay?: boolean }) {
    this.isReplay = !!data.isReplay;
    void data.gameData;
  }

  preload() {
    loadAssetGroups(this, 'shared', 'ui', 'shapes');
    // We don't need painting assets anymore
  }

  create() {
    this.shapes = [];
    this.selectedShapes.clear();

    this.addBackground();
    this.createLayout();

    // Play instruction voice
    // "Select shapes to fit..."
    // Using a placeholder or existing guide voice for now
    this.playGuideVoice();

    // Setup event listeners cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.selectedShapes.clear();
      this.handTutorial?.stop();
    });

    // Setup Tutorial
    this.handTutorial = new HandTutorial(this);
    this.handTutorial.setTarget(() => {
      // Target shape 1 or 2 that is NOT selected
      const targetId = (!this.selectedShapes.has(1)) ? 1 : (!this.selectedShapes.has(2) ? 2 : null);
      if (!targetId) return null;

      const shape = this.shapes.find(s => s.getData('id') === targetId);
      if (shape) {
        let startY = shape.y;
        if (targetId === 2) startY += 60;
        return { type: 'click', startX: shape.x, startY: startY };
      }
      return null;
      return null;
    });

    if (!this.isReplay) {
      this.handTutorial.start();
    }
  }

  private playGuideVoice() {
    AudioManager.stopGuideVoices();
    // Assuming we use 'voice_guide_21' or similar available key
    AudioManager.playWhenReady('voice_guide_21');
  }

  private addBackground() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Background based on existing logic or generic image
    // Using a simple color or existing bg
    this.add.image(w / 2, h / 2, 'bg1').setDisplaySize(w, h).setDepth(-10);

    // Banner
    const bannerY = 90;
    if (this.textures.exists(BOARD_ASSET_KEYS.bannerBg)) {
      const banner = this.add.image(w / 2, bannerY, BOARD_ASSET_KEYS.bannerBg);
      banner.setDisplaySize(Math.min(w * 0.95, 1500), 120);
    }

    const bannerText = this.add.image(w / 2, bannerY, BOARD_ASSET_KEYS.bannerTextLevel1).setOrigin(0.5);
    // Scale banner text to fit within banner width
    // Banner width is controlled above: Math.min(w * 0.95, 1600)
    const bannerWidth = Math.min(w * 0.95, 1500);
    const maxTextWidth = bannerWidth * 0.9;
    const maxTextHeight = 110 * 0.85; // 85% of banner height

    const scale = Math.min(maxTextWidth / bannerText.width, maxTextHeight / bannerText.height);
    bannerText.setScale(scale);
  }

  private createLayout() {
    const w = this.scale.width;
    const h = this.scale.height;

    // Draw Board (White rounded rect with blue border)
    const boardW = w * 0.7; // Reduced width from 0.9
    const boardH = h * 0.8;  // Increased height from 0.75
    const boardX = w / 2;
    const boardY = h * 0.56;

    const board = this.add.graphics();
    board.fillStyle(0xffffff, 1);
    board.fillRoundedRect(boardX - boardW / 2, boardY - boardH / 2, boardW, boardH, 24);
    board.lineStyle(6, 0x3b82f6, 1);
    board.strokeRoundedRect(boardX - boardW / 2, boardY - boardH / 2, boardW, boardH, 24);

    const leftX = boardX - boardW * 0.22; // Reduced offset from 0.25 to bring closer
    const rightX = boardX + boardW * 0.22;

    // Increase vertical spacing
    const yOffset = boardH * 0.28;
    const row1Y = boardY - yOffset;
    const row2Y = boardY;
    const row3Y = boardY + yOffset;

    // Shapes creation
    // Shape 1 (Top Left, Rect Group -> 1): Move Left
    this.createTriangleShape(1, leftX, row1Y, 390, 195, -0.3, -0.15);
    // Shape 2 (Top Right, Square Group -> 2): Move Down
    this.createTriangleShape(2, rightX, row1Y, 195, 195, -0.15, 0.25);

    // Targets
    this.createTargetImage(SHAPE_ASSET_KEYS.targetRect, leftX, row2Y, 390, 195);
    this.createTargetImage(SHAPE_ASSET_KEYS.targetSquare, rightX, row2Y, 195, 195);

    // Shape 3 (Bot Left, Rect Group -> 1): Move Left, Move Up
    this.createTriangleShape(3, leftX, row3Y, 390, 195, 0.1, -0.05);
    // Shape 4 (Bot Right, Square Group -> 2): Move Left
    this.createTriangleShape(4, rightX, row3Y, 195, 195, 0.0, 0.15);
  }

  private createTargetImage(key: string, x: number, y: number, w: number, h: number) {
    if (this.textures.exists(key)) {
      const img = this.add.image(x, y, key);
      img.setDisplaySize(w, h); // Stretch to fit if needed, or maintain aspect ratio if preferable
      // If generic scaling needed:
      // const s = Math.min(w/img.width, h/img.height);
      // img.setScale(s);
    } else {
      // Fallback debug
      this.add.rectangle(x, y, w, h, 0xcccccc, 0.5);
      this.add.text(x, y, key, { color: '#000' }).setOrigin(0.5);
    }
  }

  private createTriangleShape(id: number, x: number, y: number, w: number, h: number, textOffXStr: number = 0, textOffYStr: number = 0) {
    const container = this.add.container(x, y);
    container.setData('id', id);
    container.setSize(w, h);

    // Map id to asset key
    let key = '';
    if (id === 1) key = SHAPE_ASSET_KEYS.shape1;
    else if (id === 2) key = SHAPE_ASSET_KEYS.shape2;
    else if (id === 3) key = SHAPE_ASSET_KEYS.shape3;
    else if (id === 4) key = SHAPE_ASSET_KEYS.shape4;

    // Hit area params
    let hitW = w * 0.9;
    if (id === 2) hitW = w * 0.6; // Shape 2 width smaller

    let hitH = h * 0.9;
    if (id === 2) hitH = h * 1.0; // Shape 2 height larger (+0.1)

    let xOffset = 150;
    if (id === 1) xOffset = 165;
    else if (id === 2) xOffset = 55; // Was 85, shifted left 30 -> 55

    const hitX = -hitW / 2 + xOffset;
    const hitY = -hitH / 2 + 80;

    // Create Fill Graphics (Background) - Matches Hit Area
    const fillGfx = this.add.graphics();
    fillGfx.fillStyle(0xff0000, 1);
    fillGfx.fillRoundedRect(hitX, hitY, hitW, hitH, 24);
    fillGfx.setVisible(false);
    container.add(fillGfx);

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
    // Logic: 1, 2, 3, 4
    let numKey = '';
    if (id === 1) numKey = SHAPE_ASSET_KEYS.num1;
    else if (id === 2) numKey = SHAPE_ASSET_KEYS.num2;
    else if (id === 3) numKey = SHAPE_ASSET_KEYS.num3;
    else if (id === 4) numKey = SHAPE_ASSET_KEYS.num4;

    if (this.textures.exists(numKey)) {
      const numImg = this.add.image(textX, textY, numKey);
      // Scale number slightly smaller (0.35)
      const scale = Math.min(w, h) * 0.3 / Math.max(numImg.width, numImg.height);
      numImg.setScale(scale);
      container.add(numImg);
    } else {
      const text = this.add.text(textX, textY, id.toString(), {
        fontSize: '48px',
        color: '#3b82f6',
        fontStyle: 'bold',
        fontFamily: 'Fredoka'
      }).setOrigin(0.5);
      container.add(text);
    }

    // Interaction
    // Use the same params as the fill graphics
    const hitRect = new Phaser.Geom.Rectangle(hitX, hitY, hitW, hitH);
    container.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      this.game.canvas.style.cursor = 'pointer';
    });
    container.on('pointerout', () => {
      this.game.canvas.style.cursor = 'default';
    });

    container.on('pointerdown', () => {
      this.handTutorial?.onInteraction();
      this.toggleSelection(container);
    });

    this.shapes.push(container);
    return container;
  }

  private toggleSelection(container: Phaser.GameObjects.Container) {
    const id = container.getData('id');

    // Check correctness: Only 1 and 2 are correct
    const isCorrect = (id === 1 || id === 2);

    if (this.selectedShapes.has(id)) {
      // Allow turning off if already selected (optional, but good for UX)
      this.selectedShapes.delete(id);
      this.tweens.add({
        targets: container,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 200,
        ease: 'Back.easeIn'
      });
      AudioManager.play('sfx_click');
    } else {
      if (isCorrect) {
        // Correct selection
        this.selectedShapes.add(id);
        AudioManager.play('sfx_correct');
        AudioManager.playCorrectAnswer();
        // Pop animation
        this.tweens.add({
          targets: container,
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 300,
          yoyo: false,
          ease: 'Back.easeOut'
        });
        this.checkCompletion();
      } else {
        // Wrong selection
        AudioManager.play('sfx_wrong');
        // Shake animation
        this.tweens.add({
          targets: container,
          x: container.x + 10,
          duration: 50,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.easeInOut'
        });

        // Show hand immediately on wrong
        this.handTutorial?.showNow();
      }
    }
  }

  private checkCompletion() {
    // Condition: Select shape 1 and shape 2
    if (this.selectedShapes.has(1) && this.selectedShapes.has(2) && this.selectedShapes.size === 2) {
      this.handTutorial?.stop(); // Stop tutorial
      this.time.delayedCall(1000, () => {
        this.game.events.emit(FLOW_GO_COUNT, {});
      });
    }
  }
}
