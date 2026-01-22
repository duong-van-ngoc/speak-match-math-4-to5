import Phaser from 'phaser';
import AudioManager from './AudioManager';
import { sdk } from './main';
// import { game as irukaGame } from '@iruka-edu/mini-game-sdk';

/* ===================== AUDIO GLOBAL FLAG ===================== */
const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';

const BG_KEY = 'bg1';
const VOICE_JOIN_KEY = 'voice_join'; // Giả định có voice hướng dẫn mới
const SFX_CORRECT_KEY = 'sfx_correct';
const SFX_WRONG_KEY = 'sfx_wrong';
const SFX_CLICK_KEY = 'sfx_click';
const SFX_COMPLETE_KEY = 'sfx_complete';
const BANNER_TITLE = 'Bé tô số và đếm nấm'; // Tiêu đề mới

// Tracing game assets
const DOTTED_LINE_ASSET_KEY = 'dotted_line'; // Legacy, kept if needed later or remove
const PAINT_LINE_ASSET_KEY = 'paint_line';

// Counting game assets
const RABBIT_ASSET_KEY = 'rabbit';
const MUSHROOM_ASSET_KEY = 'mushroom';

/* ===================== LAYOUT & CONFIG ===================== */

const BANNER_Y = 55; // Shifted down from 42
const BANNER_SCALE = 0.5;
const PROMPT_FONT_SIZE = 30;
const FEEDBACK_FONT_SIZE = 22;
const LINE_THICKNESS = 12; // Độ dày của đường nét
const TRACING_TOLERANCE = 20; // Khoảng cách tối đa để được coi là đang tô đúng

/* ===================== TYPES ===================== */

type GameState = 'TRACING_INTRO' | 'TRACING' | 'TRACING_END' | 'COUNTING_INTRO' | 'COUNTING' | 'COUNTING_END';

type WindowGameApi = {
  setRandomGameViewportBg?: () => void;
  setGameButtonsVisible?: (visible: boolean) => void;
} & Record<string, unknown>;

/* ===================== SCENE ===================== */

export default class GameScene extends Phaser.Scene {
  public score = 0;

  private gameState: GameState = 'TRACING_INTRO';
  private hasPlayedInstructionVoice = false;

  private promptText!: Phaser.GameObjects.Text;
  private promptImage?: Phaser.GameObjects.Image;
  private feedbackText!: Phaser.GameObjects.Text;
  private questionBanner!: Phaser.GameObjects.Image;
  private itemsBoard?: Phaser.GameObjects.Image;

  // private currentNumber = 1; // Removed
  // Old tracing vars removed
  private isTracing = false;
  private visitedPoints: boolean[] = [];
  private isBlockingInput = false;
  private tutorialHand?: Phaser.GameObjects.Image;

  private rabbit!: Phaser.GameObjects.Image; // Kept for now or remove if unused
  private mushrooms: Phaser.GameObjects.Image[] = []; // Kept
  private correctMushroomCount = 0;
  private currentAnswerText!: Phaser.GameObjects.Text;
  private answerInput!: Phaser.GameObjects.Text;
  private numpadButtons: Phaser.GameObjects.Text[] = [];

  private lastInteractionAtMs = 0;
  private audioReady = false;



  constructor() {
    super('GameScene');
  }

  /* ===================== INIT ===================== */

  init(data: { score?: number }) {
    this.score = data.score ?? 0;
    this.promptImage = undefined;
    this.hasPlayedInstructionVoice = false;

    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: this.score,
    };
    sdk.score(this.score, 0);

    this.lastInteractionAtMs = 0;

    const win = window as unknown as Record<string, unknown>;
    this.audioReady = !!win[AUDIO_UNLOCKED_KEY];
  }

  private recordCorrect() {
    (window as any).irukaGameState.currentScore = this.score;
    sdk.score(this.score, 1);
  }

  private recordWrong() {
  }

  private addHint() {
  }

  private saveProgress() {
  }

  private finalizeAttempt() {
  }

  /* ===================== CREATE ===================== */

  create() {
    this.input.once('pointerdown', () => {
      try {
        (window as any).ensureBgmStarted?.();
      } catch { }
    });

    try {
      (window as unknown as WindowGameApi).setRandomGameViewportBg?.();
    } catch {
      // Optional host helper may not exist.
    }

    const { width, height } = this.scale;
    const w = window as unknown as WindowGameApi;
    w.setGameButtonsVisible?.(true);
    w.setRandomGameViewportBg?.();

    const replayBtnEl = document.getElementById('btn-replay') as HTMLButtonElement | null;
    const nextBtnEl = document.getElementById('btn-next') as HTMLButtonElement | null;

    const setBtnBgFromUrl = (el: HTMLButtonElement | null, url?: string) => {
      if (!el || !url) return;
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      el.style.backgroundSize = 'contain';
    };

    setBtnBgFromUrl(replayBtnEl, 'assets/button/replay.png');
    setBtnBgFromUrl(nextBtnEl, 'assets/button/next.png');

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    window.addEventListener(AUDIO_UNLOCKED_EVENT, this.onAudioUnlocked, { once: true } as AddEventListenerOptions);
    (window as any).playInstructionVoice = (force?: boolean) => this.playInstructionVoice(!!force);
    this.consumePendingInstructionVoice();
    this.events.once('shutdown', () => {
      try {
        if ((window as any).playInstructionVoice) delete (window as any).playInstructionVoice;
      } catch { }
    });

    // Banner Background (HTU.png)
    this.add
      .image(width / 2, BANNER_Y, 'btn_primary_pressed')
      .setOrigin(0.5)
      .setScale(0.62, 0.42) // Reduced height from 0.5 to 0.42
      .setDepth(20);

    // Banner Text Image (Question.png)
    // Banner Text Image (Question.png)
    this.questionBanner = this.add
      .image(width / 2, BANNER_Y, 'banner_question')
      .setOrigin(0.5)
      .setScale(0.63) // Scaled down to fit HTU.png
      .setDepth(21);

    this.promptText = this.add
      .text(this.questionBanner.x, this.questionBanner.y, '', {
        fontFamily: 'Fredoka, Arial',
        fontSize: `${PROMPT_FONT_SIZE}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.feedbackText = this.add
      .text(0, 0, '', {
        fontFamily: 'Fredoka, Arial',
        fontSize: `${FEEDBACK_FONT_SIZE}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.createTracingGame();
    this.startTracingGame();
  }

  /* ===================== PATH TRACING LOGIC ===================== */

  /* ===================== PATH TRACING LOGIC ===================== */

  private pathCurve!: Phaser.Curves.Spline;
  private pathPoints: Phaser.Math.Vector2[] = [];
  private stationImages: Phaser.GameObjects.Image[] = [];
  private numberImages: Phaser.GameObjects.Image[] = [];
  private dottedPathGroup!: Phaser.GameObjects.Group;
  private paintedPathGraphics!: Phaser.GameObjects.Graphics;

  private traceProgress = 0; // 0.0 to 1.0 along the curve
  private totalCurveLength = 0;

  private createTracingGame() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    // Add Game Board
    // Using 'game_board' loaded in PreloadScene
    // Add Game Board
    // Using 'game_board' loaded in PreloadScene
    // Shifted board up further as requested
    const board = this.add.image(centerX, centerY + 40, 'game_board');
    // Scale board to fit nicely, assuming it's a rectangle
    // width * 0.7 for narrower width
    // height * 0.9 for taller height
    // Scale board to fit nicely, slightly smaller as requested ("board co theo")
    board.setDisplaySize(width * 0.68, height * 0.82);
    board.setDepth(1); // Behind lines and stations

    // The board rendering bounds
    const boardX = centerX;
    const boardY = centerY - 20; // Shifted up 40px from prev default (+20)
    const boardW = width * 0.7;
    const boardH = height * 0.9;

    // Bounds for stations inside the board
    // We leave larger padding to ensure images attached to points don't go off-screen
    const padding = 120;
    const boundLeft = boardX - boardW / 2 + padding;
    const boundRight = boardX + boardW / 2 - padding;
    const boundTop = boardY - boardH / 2 + padding;
    const boundBottom = boardY + boardH / 2 + padding;

    // Define 5 key points relative to these bounds (Zig-Zag: Left -> Right -> Center -> Left -> Right)
    const pointsNormalized = [
      { x: 0.1, y: 0.1 },   // 1 (Top Left)
      { x: 0.9, y: 0.3 },   // 2 (Top Right)
      { x: 0.5, y: 0.5 },   // 3 (Center)
      { x: 0.2, y: 0.75 },  // 4 (Bottom Left)
      { x: 0.8, y: 0.9 }    // 5 (Bottom Right)
    ];

    this.pathPoints = pointsNormalized.map((p, index) => {
      let x = boundLeft + p.x * (boundRight - boundLeft);
      let y = boundTop + p.y * (boundBottom - boundTop);

      // Manual adjustments to align line/dot with user's specific station shifts
      if (index === 0) { x += 110; y += 30; } // Follows Image 1 Right shift and Down slightly
      if (index === 1) x -= 110;        // Follows Image 2 Left shift more (Compensated for increased separation)
      if (index === 2) { x -= 20; y -= 20; } // Follows Image 3 Left/Up
      if (index === 3) y -= 20;         // Follows Image 4 Up
      if (index === 4) { x -= 110; y -= 120; } // Follows Image 5 Left/Up more (Compensated)

      return new Phaser.Math.Vector2(x, y);
    });

    // Create Spline Curve
    this.pathCurve = new Phaser.Curves.Spline(this.pathPoints);
    this.totalCurveLength = this.pathCurve.getLength();

    // Create Dashed Line Visualization (replaced dots with 1px dashes)
    this.dottedPathGroup = this.add.group();
    const dashedGraphics = this.add.graphics();
    dashedGraphics.setDepth(2);
    this.dottedPathGroup.add(dashedGraphics);

    const dashedSteps = Math.floor(this.totalCurveLength / 15);
    const dashLen = 8;

    dashedGraphics.lineStyle(1, 0x555555, 1);

    for (let i = 0; i < dashedSteps; i++) {
      const t = i / dashedSteps;
      const p = this.pathCurve.getPoint(t);
      const tangent = this.pathCurve.getTangent(t);

      const start = p.clone().subtract(tangent.clone().scale(dashLen / 2));
      const end = p.clone().add(tangent.clone().scale(dashLen / 2));

      dashedGraphics.lineBetween(start.x, start.y, end.x, end.y);
    }

    // Create Painted Graphics (for user tracing)
    this.paintedPathGraphics = this.add.graphics();
    this.paintedPathGraphics.lineStyle(20, 0xffa500, 1); // Orange, thick
    this.paintedPathGraphics.setDepth(3);

    // Create Stations, Numbers, & Dots
    this.pathPoints.forEach((p, index) => {
      // 1. Dot on the path
      const dot = this.add.image(p.x, p.y, 'dot').setScale(0.8).setDepth(5).setTint(0xff6600);
      // We can store dots if we need to hide them later, or add them to a group
      // For now, let's just make sure they render. 
      // If we need to hide them for counting game, we might need a group.
      // Let's add them to dottedPathGroup or a new group? 
      // Reuse dottedPathGroup for "path elements" might be easiest if we hide it all.
      this.dottedPathGroup.add(dot);

      // 2. Number Image (Above the dot)
      const numKey = `number_${index + 1}`;
      let localNumOffsetY = 45;
      // Fix Number 4 obscured by line - move it further up
      if (index === 3) localNumOffsetY = 80;

      const numImg = this.add.image(p.x, p.y - localNumOffsetY, numKey).setScale(0.5).setDepth(20);
      this.numberImages.push(numImg); // Changed from numberLabels text

      // 3. Station Image (Scene) - ZigZag placement
      const stKey = `station_${index + 1}`;

      // Use specific manually adjusted offsets
      let offsetX = 0;
      let offsetY = 0;

      // Reverted to baseline offsets so image maintains relative position to the SHIFTED point
      switch (index) {
        case 0:
          offsetX = -130;  // Increased separation (was -80)
          offsetY = -20;
          break;
        case 1:
          offsetX = 130;   // Increased separation (was 80)
          offsetY = -20;
          break;
        case 2:
          offsetX = -140;
          offsetY = -50;
          break;
        case 3:
          offsetX = -120;
          offsetY = -50;
          break;
        case 4:
          offsetX = 130;   // Increased separation (was 80)
          offsetY = -50;
          break;
        default:
          offsetX = 0;
          offsetY = 0;
      }
      console.log(`Station ${index + 1} offset: x=${offsetX}, y=${offsetY}`);

      const stImg = this.add.image(p.x + offsetX, p.y + offsetY, stKey).setScale(0.5).setDepth(10);
      this.stationImages.push(stImg);
    });

    // Setup Interaction
    this.input.on('pointerdown', this.handlePathPointerDown, this);
    this.input.on('pointermove', this.handlePathPointerMove, this);
    this.input.on('pointerup', this.handlePathPointerUp, this);
  }



  private startTracingGame() {
    this.gameState = 'TRACING';
    this.promptText.setVisible(false); // Hide text as banner image contains it
    this.traceProgress = 0;
    this.visitedPoints = new Array(5).fill(false);
    this.isBlockingInput = false;
    this.updatePaintedPath();

    // Start tutorial after a short delay
    this.time.delayedCall(500, () => this.playHandTutorial());
  }

  // --- Interaction Handlers for Path ---

  private handlePathPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.gameState !== 'TRACING') return;
    if (this.isBlockingInput) return;

    // Check if close to current progress point on curve
    const currentPoint = this.pathCurve.getPoint(this.traceProgress);
    const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, currentPoint.x, currentPoint.y);

    if (dist < 100) { // Generous hit area
      this.isTracing = true;

      // Stop tutorial if user interacts
      if (this.tutorialHand) {
        this.tutorialHand.destroy();
        this.tutorialHand = undefined;
      }

      // Special check for Point 0 (Start)
      if (this.traceProgress < 0.05 && !this.visitedPoints[0]) {
        const distToStart = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.pathPoints[0].x, this.pathPoints[0].y);
        if (distToStart < 100) {
          this.triggerPointVisit(0);
        }
      }
    }
  }

  private handlePathPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.gameState !== 'TRACING' || !this.isTracing) return;
    if (this.isBlockingInput) return;

    // We want to advance traceProgress if pointer is "ahead" along the curve
    // Simple approach: find closest point on curve? 
    // Optimization: Just check if pointer is close to a future point.

    // Look ahead a bit
    const lookAhead = 0.05; // 5% of curve
    let bestProgress = this.traceProgress;

    // Scan a small segment ahead to see if user is tracing forward
    for (let p = this.traceProgress; p <= Math.min(1, this.traceProgress + lookAhead); p += 0.002) {
      const pt = this.pathCurve.getPoint(p);
      const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, pt.x, pt.y);
      if (d < 50) { // Close enough to the line
        if (p > bestProgress) {
          bestProgress = p;
        }
      }
    }

    if (bestProgress > this.traceProgress) {
      this.traceProgress = bestProgress;
      this.updatePaintedPath();

      // Check for voice playback at each point (Indices 1 to 4)
      // We check all points just to be safe, but primarily new ones
      this.pathPoints.forEach((p, i) => {
        if (!this.visitedPoints[i]) {
          const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, p.x, p.y);
          if (dist < 60) {
            this.triggerPointVisit(i);
          }
        }
      });

      // Check completion
      if (this.traceProgress >= 0.99 && !this.isBlockingInput) {
        // Ensure all points visited?
        if (this.visitedPoints.every(v => v)) {
          this.handleTracingComplete();
        }
      }
    }
  }

  private triggerPointVisit(index: number) {
    if (this.visitedPoints[index]) return;

    this.visitedPoints[index] = true;
    this.isBlockingInput = true;

    // Play sound effects & voice
    AudioManager.play('sfx_correct');
    AudioManager.playCorrectAnswer(); // "Correct!" voice

    const voiceKey = `count_${index + 1}`;
    AudioManager.play(voiceKey);

    // Visual Animation (Pop effect)
    if (this.numberImages[index] && this.stationImages[index]) {
      this.tweens.add({
        targets: [this.numberImages[index], this.stationImages[index]],
        scale: '*=1.3',
        duration: 200,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    }

    AudioManager.onceEnded(voiceKey, () => {
      this.isBlockingInput = false;

      // If completed immediately after voice
      if (index === 4 && this.traceProgress >= 0.99) {
        this.handleTracingComplete();
      }
    });
  }

  private handlePathPointerUp() {
    this.isTracing = false;
  }

  private updatePaintedPath() {
    this.paintedPathGraphics.clear();
    this.paintedPathGraphics.lineStyle(20, 0xff6600, 1);
    // Use chained calls if available, otherwise just lineStyle. 
    // High resolution points creates "round" join effect.

    // Draw curve segment from 0 to traceProgress
    // Increase resolution for smoother corners (totalCurveLength / 3)
    const points = this.pathCurve.getSpacedPoints(Math.floor(this.totalCurveLength / 3));
    const drawnPointsCount = Math.floor(points.length * this.traceProgress);

    if (drawnPointsCount < 2) return;

    this.paintedPathGraphics.beginPath();
    this.paintedPathGraphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < drawnPointsCount; i++) {
      this.paintedPathGraphics.lineTo(points[i].x, points[i].y);
    }
    // Add current exact point
    const tip = this.pathCurve.getPoint(this.traceProgress);
    this.paintedPathGraphics.lineTo(tip.x, tip.y);

    this.paintedPathGraphics.strokePath();
  }

  private handleTracingComplete() {
    this.isTracing = false;
    this.gameState = 'TRACING_END';
    AudioManager.play(SFX_COMPLETE_KEY);
    this.recordCorrect();
    this.promptText.setText('Tuyệt vời! Bạn đã kết nối hết các trạm.');

    this.time.delayedCall(500, () => {
      // End game immediately (Single level as requested) - Very fast transition
      AudioManager.play('voice_complete');
      this.finalizeAttempt();
      this.scene.start('EndGameScene', {
        lessonId: '',
        score: this.score,
        total: 1,
      });
    });
  }

  // Removed Counting Game logic as requested (Single level)


  private playHandTutorial() {
    if (this.gameState !== 'TRACING' || this.isTracing) return;
    if (this.tutorialHand) this.tutorialHand.destroy();

    const p0 = this.pathPoints[0];
    const p1 = this.pathPoints[1];

    // Start slightly offset to show movement towards 1
    this.tutorialHand = this.add.image(p0.x + 80, p0.y + 80, 'paint_brush')
      .setScale(0.8)
      .setDepth(100)
      .setOrigin(0.5, 0);

    // 1. Move to Number 1
    this.tweens.add({
      targets: this.tutorialHand,
      x: p0.x,
      y: p0.y,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        if (!this.tutorialHand) return;

        // 2. Tap indication (Scale down/up)
        this.tweens.add({
          targets: this.tutorialHand,
          scale: 0.6,
          duration: 200,
          yoyo: true,
          repeat: 1,
          onComplete: () => {
            if (!this.tutorialHand) return;

            // 3. Move to Number 2 (Tracing help)
            this.tweens.add({
              targets: this.tutorialHand,
              x: p1.x,
              y: p1.y,
              duration: 1000,
              ease: 'Sine.easeInOut',
              delay: 200,
              onComplete: () => {
                if (!this.isTracing && this.tutorialHand) {
                  this.playHandTutorial();
                }
              }
            });
          }
        });
      }
    });
  }

  private consumePendingInstructionVoice() {
    try {
      const win = window as any;
      if (win.__rotateOverlayActive__) return;
      if (!win.__pendingInstructionVoice__) return;
      const force = !!win.__pendingInstructionVoiceForce__;
      win.__pendingInstructionVoice__ = false;
      win.__pendingInstructionVoiceForce__ = false;
      this.playInstructionVoice(force);
    } catch { }
  }
  private readonly onAudioUnlocked = () => {
    const win = window as unknown as Record<string, unknown>;
    win[AUDIO_UNLOCKED_KEY] = true;
    this.audioReady = true;

    try {
      void AudioManager.unlockAndWarmup?.();
    } catch { }

    this.consumePendingInstructionVoice();
    this.playInstructionVoice();
  };

  private playInstructionVoice(force = false) {
    if (!force && this.hasPlayedInstructionVoice) return;
    if ((window as any).__rotateOverlayActive__) return;

    const play = () => {
      if (!force && this.hasPlayedInstructionVoice) return;
      if (force) AudioManager.stop('voice_join');
      try {
        (window as any).ensureBgmStarted?.();
      } catch { }
      AudioManager.playWhenReady?.('voice_join');
      this.hasPlayedInstructionVoice = true;
      this.input.once('pointerdown', () => AudioManager.stop('voice_join'));
    };

    if (this.audioReady) {
      play();
      return;
    }

    try {
      const win = window as any;
      win.__pendingInstructionVoice__ = true;
      win.__pendingInstructionVoiceForce__ = !!(win.__pendingInstructionVoiceForce__ || force);
    } catch { }
  }
}
