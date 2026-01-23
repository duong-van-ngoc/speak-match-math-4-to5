import Phaser from 'phaser';
import AudioManager from './AudioManager';
import { sdk } from './main';
// import { game as irukaGame } from '@iruka-edu/mini-game-sdk';

const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';
const SFX_COMPLETE_KEY = 'sfx_complete';

const BANNER_Y = 55; // Shifted down from 42
const PROMPT_FONT_SIZE = 30;

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
  private questionBanner!: Phaser.GameObjects.Image;

  private isTracing = false;
  private visitedPoints: boolean[] = [];
  private isBlockingInput = false;
  private tutorialHand?: Phaser.GameObjects.Image;
  private audioReady = false;

  constructor() {
    super('GameScene');
  }

  /* ===================== INIT ===================== */

  init(data: { score?: number }) {
    this.score = data.score ?? 0;
    this.hasPlayedInstructionVoice = false;

    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: this.score,
    };
    sdk.score(this.score, 0);

    const win = window as unknown as Record<string, unknown>;
    this.audioReady = !!win[AUDIO_UNLOCKED_KEY];
  }

  private recordCorrect() {
    (window as any).irukaGameState.currentScore = this.score;
    sdk.score(this.score, 1);
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

    const { width } = this.scale;
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

    this.createTracingGame();
    this.startTracingGame();
    this.playInstructionVoice();
  }

  /* ===================== PATH TRACING LOGIC ===================== */

  private pathCurve!: Phaser.Curves.Spline;
  private pathPoints: Phaser.Math.Vector2[] = [];
  private stationImages: Phaser.GameObjects.Image[] = [];
  private numberImages: Phaser.GameObjects.Image[] = [];
  private dottedPathGroup!: Phaser.GameObjects.Group;
  private paintedPathGraphics!: Phaser.GameObjects.Graphics;

  private traceProgress = 0; // 0.0 to 1.0 along the curve
  private totalCurveLength = 0;

  private traceParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burstParticles!: Phaser.GameObjects.Particles.ParticleEmitter;

  private createTracingGame() {
    this.stationImages = [];
    this.numberImages = [];

    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const board = this.add.image(centerX, centerY + 40, 'game_board');
    board.setDisplaySize(width * 0.68, height * 0.82);
    board.setDepth(1);

    const boardX = centerX;
    const boardY = centerY - 20;
    const boardW = width * 0.7;
    const boardH = height * 0.9;

    const padding = 120;
    const boundLeft = boardX - boardW / 2 + padding;
    const boundRight = boardX + boardW / 2 - padding;
    const boundTop = boardY - boardH / 2 + padding;
    const boundBottom = boardY + boardH / 2 + padding;

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

      if (index === 0) { x += 140; y -= 15; }
      if (index === 1) { x -= 110; y -= 80; }
      if (index === 2) { x += 10; y -= 50; }
      if (index === 3) { x += 20; y -= 40; }
      if (index === 4) { x -= 90; y -= 80; }

      return new Phaser.Math.Vector2(x, y);
    });

    this.pathCurve = new Phaser.Curves.Spline(this.pathPoints);
    this.totalCurveLength = this.pathCurve.getLength();

    this.dottedPathGroup = this.add.group();
    const dashedGraphics = this.add.graphics();
    dashedGraphics.setDepth(2);
    this.dottedPathGroup.add(dashedGraphics);

    // Layout: Dashes 19, 19 | Border 1px
    const dashLen = 19;
    const gapLen = 19;
    const stepSize = (dashLen + gapLen);
    const numSteps = Math.floor(this.totalCurveLength / stepSize);

    dashedGraphics.lineStyle(1, 0x555555, 0.8);

    for (let i = 0; i < numSteps; i++) {
      const tStart = (i * stepSize) / this.totalCurveLength;
      const tEnd = (i * stepSize + dashLen) / this.totalCurveLength;

      const pStart = this.pathCurve.getPoint(tStart);
      const pEnd = this.pathCurve.getPoint(tEnd);

      dashedGraphics.lineBetween(pStart.x, pStart.y, pEnd.x, pEnd.y);
    }

    this.paintedPathGraphics = this.add.graphics();
    this.paintedPathGraphics.lineStyle(20, 0xffa500, 1);
    this.paintedPathGraphics.setDepth(3);

    this.pathPoints.forEach((p, index) => {
      const dot = this.add.image(p.x, p.y, 'dot').setScale(0.8).setDepth(5).setTint(0xff6600);
      this.dottedPathGroup.add(dot);

      const numKey = `number_${index + 1}`;
      let localNumOffsetY = 45;
      if (index === 3) localNumOffsetY = 80;

      const numImg = this.add.image(p.x, p.y - localNumOffsetY, numKey).setScale(0.5).setDepth(20);
      this.numberImages.push(numImg);

      const stKey = `station_${index + 1}`;
      let offsetX = 0;
      let offsetY = 0;

      switch (index) {
        case 0: offsetX = -130; offsetY = 10; break;
        case 1: offsetX = 130; offsetY = -20; break;
        case 2: offsetX = -140; offsetY = -50; break;
        case 3: offsetX = -120; offsetY = -50; break;
        case 4: offsetX = 130; offsetY = -50; break;
      }

      const stImg = this.add.image(p.x + offsetX, p.y + offsetY, stKey).setScale(0.5).setDepth(10);
      this.stationImages.push(stImg);
    });

    // Setup Particles
    const particles = this.add.particles(0, 0, 'dot', {
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.8, end: 0 },
      speed: 15,
      lifespan: 600,
      blendMode: 'ADD',
      tint: 0xffa500,
      emitting: false
    }).setDepth(4);
    this.traceParticles = particles;

    this.burstParticles = this.add.particles(0, 0, 'dot', {
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      speed: { min: 60, max: 200 },
      lifespan: 800,
      blendMode: 'ADD',
      tint: 0xffff00,
      emitting: false
    }).setDepth(22);

    this.input.on('pointerdown', this.handlePathPointerDown, this);
    this.input.on('pointermove', this.handlePathPointerMove, this);
    this.input.on('pointerup', this.handlePathPointerUp, this);
  }

  private startTracingGame() {
    this.gameState = 'TRACING';
    this.promptText.setVisible(false);
    this.traceProgress = 0;
    this.visitedPoints = new Array(5).fill(false);
    this.isBlockingInput = false;
    this.updatePaintedPath();
    this.time.delayedCall(500, () => this.playHandTutorial());
  }

  private handlePathPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.gameState !== 'TRACING') return;
    if (this.isBlockingInput) return;

    const currentPoint = this.pathCurve.getPoint(this.traceProgress);
    const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, currentPoint.x, currentPoint.y);

    if (dist < 100) {
      this.isTracing = true;
      if (this.tutorialHand) {
        this.tutorialHand.destroy();
        this.tutorialHand = undefined;
      }
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

    const lookAhead = 0.05;
    let bestProgress = this.traceProgress;

    for (let p = this.traceProgress; p <= Math.min(1, this.traceProgress + lookAhead); p += 0.002) {
      const pt = this.pathCurve.getPoint(p);
      const d = Phaser.Math.Distance.Between(pointer.x, pointer.y, pt.x, pt.y);
      if (d < 50) {
        if (p > bestProgress) bestProgress = p;
      }
    }

    if (bestProgress > this.traceProgress) {
      this.traceProgress = bestProgress;
      this.updatePaintedPath();

      // Emit particles at tip
      const tip = this.pathCurve.getPoint(this.traceProgress);
      this.traceParticles.emitParticleAt(tip.x, tip.y);

      this.pathPoints.forEach((p, i) => {
        if (!this.visitedPoints[i]) {
          const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, p.x, p.y);
          if (dist < 60) this.triggerPointVisit(i);
        }
      });

      if (this.traceProgress >= 0.99 && !this.isBlockingInput) {
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

    AudioManager.play('sfx_correct');
    const correctKey = AudioManager.playCorrectAnswer();

    // Visual Burst Animation
    this.burstParticles.explode(20, this.pathPoints[index].x, this.pathPoints[index].y);

    if (this.numberImages[index] && this.stationImages[index]) {
      this.tweens.add({
        targets: [this.numberImages[index], this.stationImages[index]],
        scale: '*=1.3',
        duration: 200,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    }

    const playCountVoice = () => {
      const voiceKey = `count_${index + 1}`;
      AudioManager.play(voiceKey);

      AudioManager.onceEnded(voiceKey, () => {
        this.isBlockingInput = false;
        if (index === 4) {
          this.handleTracingComplete();
        }
      });
    };

    // For all points, wait for the congrats voice to finish first
    AudioManager.onceEnded(correctKey, playCountVoice);
  }

  private handlePathPointerUp() {
    this.isTracing = false;
  }

  private updatePaintedPath() {
    this.paintedPathGraphics.clear();

    const points = this.pathCurve.getSpacedPoints(Math.floor(this.totalCurveLength / 3));
    const drawnPointsCount = Math.floor(points.length * this.traceProgress);

    if (drawnPointsCount < 2) return;

    // 1. Draw Outer Glow (Blurry look)
    this.paintedPathGraphics.lineStyle(30, 0xffa500, 0.2);
    this.drawPath(points, drawnPointsCount);

    // 2. Draw Middle Glow
    this.paintedPathGraphics.lineStyle(24, 0xff6600, 0.4);
    this.drawPath(points, drawnPointsCount);

    // 3. Main Core Line
    this.paintedPathGraphics.lineStyle(16, 0xffffff, 1);
    this.drawPath(points, drawnPointsCount);
  }

  private drawPath(points: Phaser.Math.Vector2[], count: number) {
    this.paintedPathGraphics.beginPath();
    this.paintedPathGraphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < count; i++) {
      this.paintedPathGraphics.lineTo(points[i].x, points[i].y);
    }
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

    AudioManager.play('voice_complete');
    this.finalizeAttempt();
    this.scene.start('EndGameScene', {
      lessonId: '',
      score: this.score,
      total: 1,
    });
  }

  private playHandTutorial() {
    if (this.gameState !== 'TRACING' || this.isTracing) return;
    if (this.tutorialHand) this.tutorialHand.destroy();

    const p0 = this.pathPoints[0];
    const p1 = this.pathPoints[1];

    this.tutorialHand = this.add.image(p0.x + 70, p0.y + 80, 'paint_brush')
      .setScale(0.5)
      .setDepth(100)
      .setOrigin(0.5, 0);

    this.tweens.add({
      targets: this.tutorialHand,
      x: p0.x - 10,
      y: p0.y,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        if (!this.tutorialHand) return;
        this.tweens.add({
          targets: this.tutorialHand,
          scale: 0.4,
          duration: 200,
          yoyo: true,
          repeat: 1,
          onComplete: () => {
            if (!this.tutorialHand) return;
            this.tweens.add({
              targets: this.tutorialHand,
              x: p1.x - 10,
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
  };

  private playInstructionVoice(force = false) {
    if (!force && this.hasPlayedInstructionVoice) return;
    if ((window as any).__rotateOverlayActive__) return;

    const play = () => {
      if (!force && this.hasPlayedInstructionVoice) return;

      // Start BGM and Voice together
      try {
        (window as any).ensureBgmStarted?.();
      } catch { }

      AudioManager.playWhenReady?.('voice_join');
      this.hasPlayedInstructionVoice = true;
      this.time.delayedCall(500, () => {
        this.input.once('pointerdown', () => AudioManager.stop('voice_join'));
      });
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
