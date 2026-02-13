import Phaser from 'phaser';
import AudioManager from './AudioManager';
import { irukaGame, sdk } from './main';
import { game as irukaSdkGame } from "@iruka-edu/mini-game-sdk";
const game = irukaGame;

const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';
const SFX_COMPLETE_KEY = 'sfx_correct';

const BANNER_Y = 70;
const PROMPT_FONT_SIZE = 55;

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

  // ===== SDK Match (items) =====
  private itemSeq = 0;
  private runSeq = 1;
  private matchTracker: any = null;
  private pendingHint = 0;
  private activeTargetIndex: number | null = null;
  private consecutiveWrongAttempts = 0;
  private lastInteractionTime = 0;
  private isShowingHint = false;

  constructor() {
    super('GameScene');
  }

  /* ===================== INIT ===================== */

  init(data: { score?: number }) {
    this.score = data.score ?? 0;
    this.hasPlayedInstructionVoice = false;
    this.consecutiveWrongAttempts = 0;
    this.lastInteractionTime = Date.now();

    // Reset sequence counters to prevent payload accumulation
    this.itemSeq = 0;
    this.runSeq = 1;

    irukaGame.setTotal?.(4);
    (window as any).resetHubProgress?.();

    const win = window as unknown as Record<string, unknown>;
    this.audioReady = !!win[AUDIO_UNLOCKED_KEY];
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
      .setScale(0.7, 0.75) // Increased scale
      .setDepth(20);

    // Banner Text Image (Question.png)
    this.questionBanner = this.add
      .image(width / 2, BANNER_Y, 'banner_question')
      .setOrigin(0.5)
      .setScale(0.85) // Increased scale to match HTU.png
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
  private curvePathPoints: Phaser.Math.Vector2[] = [];
  private stationImages: Phaser.GameObjects.Image[] = [];
  private numberImages: Phaser.GameObjects.Image[] = [];
  private dottedPathGroup!: Phaser.GameObjects.Group;
  private paintedPathGraphics!: Phaser.GameObjects.Graphics;

  private traceProgress = 0; // 0.0 to 1.0 along the curve
  private traceIndex = 0;
  private totalCurveLength = 0;

  private traceParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burstParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dotCurveIndices: number[] = []; // Indices in curvePathPoints for each pathPoint

  private createTracingGame() {
    this.stationImages = [];
    this.numberImages = [];

    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    const board = this.add.image(centerX, centerY + 65, 'game_board');
    board.setDisplaySize(width * 0.88, height * 0.85);
    board.setDepth(1);

    const boardX = centerX;
    const boardY = centerY + 85;
    const boardW = width * 0.9;
    const boardH = height * 1.0;

    const paddingX = 180; // Keeps horizontal spread narrow
    const paddingY = 110; // Reduced to allow more vertical spread
    const boundLeft = boardX - boardW / 2 + paddingX;
    const boundRight = boardX + boardW / 2 - paddingX;
    const boundTop = boardY - boardH / 2 + paddingY;
    const boundBottom = boardY + boardH / 2 - paddingY;

    const pointsNormalized = [
      { x: 0.25, y: 0.0 },  // Pushed higher
      { x: 0.75, y: 0.22 },
      { x: 0.5, y: 0.5 },
      { x: 0.3, y: 0.78 },
      { x: 0.7, y: 1.0 }    // Pushed lower
    ];

    this.pathPoints = pointsNormalized.map((p, index) => {
      let x = boundLeft + p.x * (boundRight - boundLeft);
      let y = boundTop + p.y * (boundBottom - boundTop);

      // Fine-tuned offsets for maximum vertical spread within the board
      if (index === 0) { x += 40; y += 90; } // Shifted cluster 1 down from 40 to 70
      if (index === 1) { x -= 40; y -= 40; }
      if (index === 2) { x += 10; y -= 50; }
      if (index === 3) { x += 10; y -= 20; }
      if (index === 4) { x -= 40; y -= 110; }

      return new Phaser.Math.Vector2(x, y);
    });

    this.pathCurve = new Phaser.Curves.Spline(this.pathPoints);
    this.totalCurveLength = this.pathCurve.getLength();

    // Generate high-resolution points for the entire path once (approx 1px spacing)
    // Using simple array ensures both dashed and painted lines follow the EXACT same geometry
    this.curvePathPoints = this.pathCurve.getSpacedPoints(Math.floor(this.totalCurveLength));

    // Calculate exact curve indices for each dot to cap line drawing
    this.dotCurveIndices = this.pathPoints.map(dot => {
      let minDist = Infinity;
      let bestIdx = 0;
      this.curvePathPoints.forEach((cp, idx) => {
        const d = Phaser.Math.Distance.Between(dot.x, dot.y, cp.x, cp.y);
        if (d < minDist) {
          minDist = d;
          bestIdx = idx;
        }
      });
      return bestIdx;
    });

    this.dottedPathGroup = this.add.group();
    const dashedGraphics = this.add.graphics();
    dashedGraphics.setDepth(2);
    this.dottedPathGroup.add(dashedGraphics);

    dashedGraphics.lineStyle(2.5, 0x555555, 0.8);

    const dashLen = 29;
    const gapLen = 29;
    const period = dashLen + gapLen;
    // Calculate distance between points for accurate dashing
    const pointDist = this.totalCurveLength / (this.curvePathPoints.length - 1);

    dashedGraphics.beginPath();
    let isDrawing = false;

    // Use the pre-calculated high-res points
    for (let i = 0; i < this.curvePathPoints.length; i++) {
      const p = this.curvePathPoints[i];
      const currentDist = i * pointDist; // Approximate distance along curve based on index

      // Check if current distance falls within the 'dash' portion of the cycle
      if ((currentDist % period) < dashLen) {
        if (!isDrawing) {
          dashedGraphics.moveTo(p.x, p.y);
          isDrawing = true;
        } else {
          dashedGraphics.lineTo(p.x, p.y);
        }
      } else {
        isDrawing = false;
      }
    }
    dashedGraphics.strokePath();

    this.paintedPathGraphics = this.add.graphics();
    this.paintedPathGraphics.lineStyle(28, 0xffa500, 1);
    this.paintedPathGraphics.setDepth(3);

    this.pathPoints.forEach((p, index) => {
      const dot = this.add.image(p.x, p.y, 'dot').setScale(1.4).setDepth(5).setTint(0xff6600);
      this.dottedPathGroup.add(dot);

      const numKey = `number_${index + 1}`;
      let localNumOffsetX = 0;
      let localNumOffsetY = 85;

      if (index === 2) {
        localNumOffsetX = 0;   // Centered above the dot
        localNumOffsetY = 90; // Kept high enough to avoid rabbit/line
      }
      if (index === 3) {
        localNumOffsetX = 85;  // Position to the right (from 100)
        localNumOffsetY = 20;  // Shift up slightly (from 0)
      }

      const numImg = this.add.image(p.x + localNumOffsetX, p.y - localNumOffsetY, numKey).setScale(0.85).setDepth(20);
      this.numberImages.push(numImg);

      const stKey = `station_${index + 1}`;
      let offsetX = 0;
      let offsetY = 0;

      switch (index) {
        case 0: offsetX = -265; offsetY = 15; break; // Shifted rabbit 1 further left from -215 to -245
        case 1: offsetX = 215; offsetY = -10; break;
        case 2: offsetX = -280; offsetY = -55; break; // Shifted station 3 further left from -230 to -280
        case 3: offsetX = -260; offsetY = -55; break;
        case 4: offsetX = 215; offsetY = -55; break;
      }

      const stImg = this.add.image(p.x + offsetX, p.y + offsetY, stKey).setScale(0.85).setDepth(10);
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
    this.isBlockingInput = false;
    this.gameState = 'TRACING';
    this.promptText?.setVisible(false);
    this.traceProgress = 0;
    this.traceIndex = 0;
    this.visitedPoints = new Array(5).fill(false);
    this.updatePaintedPath();

    // ===== SDK MATCH INIT =====
    this.itemSeq += 1;
    const nodes = ['NUMBER_1', 'NUMBER_2', 'NUMBER_3', 'NUMBER_4', 'NUMBER_5'];
    // Pairs: 1->2, 2->3, 3->4, 4->5
    // Corresponds to indices: 0->1, 1->2, 2->3, 3->4
    const correct_pairs = [
      { from: 'NUMBER_1', to: 'NUMBER_2' },
      { from: 'NUMBER_2', to: 'NUMBER_3' },
      { from: 'NUMBER_3', to: 'NUMBER_4' },
      { from: 'NUMBER_4', to: 'NUMBER_5' },
    ];

    // --- SDK POLYFILL START ---
    let createMatchTracker = (irukaSdkGame as any).createMatchTracker;

    if (!createMatchTracker) {
      console.warn("SDK createMatchTracker not found! Using local polyfill.");

      // Minimal Polyfill Implementation
      createMatchTracker = (config: any) => {
        const history: any[] = [];
        let attemptCounter = 0;
        let currentStartTs: number | null = null;
        let currentFromNode: string | null = null;
        let pendingHintCount = 0;
        let totalHintUsed = 0;
        let finalizedItem: any = null;

        // Expose data globally instead of monkey-patching read-only module export
        (window as any)._getMatchedTrackerData = () => {

          // Only include item data if finalized
          if (!finalizedItem) return {};

          const items = [finalizedItem];
          const items_total = 1;

          // Build Summary
          const items_summary_by_type: any = {};
          const items_errors_histogram: any = {};

          const type = finalizedItem.item_type;
          const summary = {
            item_type: type,
            itemsCount: 1,
            passCount: 0,
            failCount: 0,
            quitCount: 0,
            attemptsTotal: finalizedItem.history.length,
            attemptsAvg: finalizedItem.history.length,
            hintTotal: finalizedItem.hint_used,
            hintAvg: finalizedItem.hint_used,
            timeTotalMs: 0,
            timeAvgMs: 0,
            errors: {} as any,
            metrics: { pathLengthAvgPx: 0 }
          };

          // Analyze history
          let correctCount = 0;
          let totalTimeMs = 0;
          let totalPathPx = 0;

          finalizedItem.history.forEach((h: any) => {
            if (h.is_correct) correctCount++;
            totalTimeMs += h.time_spent_ms;
            totalPathPx += h.response.path_length_px;
            if (h.error_code) {
              summary.errors[h.error_code] = (summary.errors[h.error_code] || 0) + 1;
              items_errors_histogram[h.error_code] = (items_errors_histogram[h.error_code] || 0) + 1;
            }
          });

          if (correctCount > 0) summary.passCount = 1;
          else summary.failCount = 1; // Simplification

          summary.timeTotalMs = totalTimeMs;
          summary.timeAvgMs = totalTimeMs;
          if (finalizedItem.history.length > 0) {
            summary.metrics.pathLengthAvgPx = totalPathPx / finalizedItem.history.length;
          }

          items_summary_by_type[type] = summary;

          return {
            items_total,
            items,
            items_summary_by_type,
            items_errors_histogram
          };
        };

        return {
          onMatchStart: (fromNode: string, ts: number) => {
            currentStartTs = ts;
            currentFromNode = fromNode;
          },
          onMatchEnd: (response: any, ts: number, result: any) => {
            attemptCounter++;
            const startTs = currentStartTs ?? ts;
            history.push({
              attempt: attemptCounter,
              started_at_ms: startTs,
              ended_at_ms: ts,
              time_spent_ms: Math.max(0, ts - startTs),
              response: {
                from_node: response.from_node || currentFromNode || '',
                to_node: response.to_node,
                path_length_px: response.path_length_px
              },
              is_correct: result.isCorrect,
              error_code: result.errorCode,
              hint_used: pendingHintCount
            });
            pendingHintCount = 0;
            currentStartTs = null;
            currentFromNode = null;
          },
          hint: (count: number) => {
            pendingHintCount += count;
            totalHintUsed += count;
          },
          finalize: () => {
            finalizedItem = {
              ...config.meta,
              expected: config.expected,
              history: [...history],
              hint_used: totalHintUsed
            };
          }
        };
      };
    }
    // --- SDK POLYFILL END ---

    this.matchTracker = createMatchTracker({
      meta: {
        item_id: `ORDER_NUMBERS_${this.itemSeq}`,
        item_type: "match",
        seq: this.itemSeq,
        run_seq: this.runSeq,
        difficulty: 1,
        scene_id: "SCN_ORDER_01",
        scene_seq: this.itemSeq,
        scene_type: "match",
        skill_ids: ["sap_xep_so_001"],
      },
      expected: {
        nodes,
        correct_pairs,
      },
      errorOnWrong: "WRONG_PAIR",
    });
    // We start aiming for index 1 (Point 2) from index 0 (Point 1)
    // However, the first "Attempt" strictly starts when user drags.
    // We assume the user has "visited" point 0 implicitly or will start there.
    this.activeTargetIndex = null; // Will be set on drag start

    this.time.delayedCall(500, () => this.playHandTutorial());
  }

  // Helper to start an attempt
  private startMatchAttempt(targetIndex: number) {
    if (this.activeTargetIndex === targetIndex) return; // Already tracking this segment

    // Previous attempt should be closed by now, but safety check?
    // In this game logic, we only move forward.
    this.activeTargetIndex = targetIndex;

    const fromIndex = targetIndex - 1;
    const fromNode = `NUMBER_${fromIndex + 1}`;

    const ts = Date.now();
    this.matchTracker?.onMatchStart?.(fromNode, ts);

    if (this.pendingHint > 0) {
      this.matchTracker?.hint?.(this.pendingHint);
      this.pendingHint = 0;
    }
  }

  // Helper to end an attempt
  private endMatchAttempt(success: boolean, errorCode: string | null = null) {
    if (this.activeTargetIndex === null) return;

    const fromIndex = this.activeTargetIndex - 1;
    const toIndex = this.activeTargetIndex;

    const fromNode = `NUMBER_${fromIndex + 1}`;
    // If success, we reached the target. If abandoned, to_node is null? 
    // Guide says: to_node: null if USER_ABANDONED.
    const toNode = success ? `NUMBER_${toIndex + 1}` : null;

    const ts = Date.now();
    // Path length is approximate in this logic, we can calculate distance between points or trace length
    // For simplicity, linear distance between the two points:
    const p1 = this.pathPoints[fromIndex];
    const p2 = this.pathPoints[toIndex]; // Or current pointer if abandoned?
    const len = Math.round(Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y));

    this.matchTracker?.onMatchEnd?.(
      { from_node: fromNode, to_node: toNode, path_length_px: len },
      ts,
      { isCorrect: success, errorCode: errorCode }
    );

    if (success) {
      this.consecutiveWrongAttempts = 0;
    } else if (errorCode && errorCode !== "USER_ABANDONED") {
      this.consecutiveWrongAttempts++;
      if (this.consecutiveWrongAttempts >= 2) {
        this.playHandTutorial(true);
        this.consecutiveWrongAttempts = 0;
      }
    }

    this.activeTargetIndex = null;
    this.lastInteractionTime = Date.now();
  }

  private handlePathPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.gameState !== 'TRACING') return;
    if (this.isBlockingInput) return;

    const currentPoint = this.pathCurve.getPoint(this.traceProgress);
    const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, currentPoint.x, currentPoint.y);

    if (dist < 100) {
      this.isTracing = true;
      this.lastInteractionTime = Date.now();
      this.input.setDefaultCursor('pointer');
      if (this.tutorialHand) {
        this.tutorialHand.destroy();
        this.tutorialHand = undefined;
      }

      // Determine what we are aiming for
      // Find the last visited point index
      let lastVisitedIndex = -1;
      for (let i = 0; i < this.visitedPoints.length; i++) {
        if (this.visitedPoints[i]) lastVisitedIndex = i;
        else break;
      }

      // If we haven't visited 0 yet, we are nominally at start. 
      // If we visited 0 (Point 1), we aim for 1 (Point 2).
      // If lastVisitedIndex is -1 (start), we treat it as aiming for 1 (Point 2) *after* we hit Point 1?
      // Actually, logic below triggers point 0 visit immediately if close.
      // Let's defer startMatchAttempt until we are sure we have "checked in" at the start node.

      if (this.traceProgress < 0.05 && !this.visitedPoints[0]) {
        const distToStart = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.pathPoints[0].x, this.pathPoints[0].y);
        if (distToStart < 100) {
          this.triggerPointVisit(0);
        }
      }

      // After potentially visiting 0, calc target again
      lastVisitedIndex = -1;
      for (let i = 0; i < this.visitedPoints.length; i++) {
        if (this.visitedPoints[i]) lastVisitedIndex = i;
        else break;
      }

      // If we have visited X, we are aiming for X+1.
      if (lastVisitedIndex >= 0 && lastVisitedIndex < 4) {
        this.startMatchAttempt(lastVisitedIndex + 1);
      }

      return;
    }

    // Only record mistake if clicking near ANY station (dot)
    const isNearAnyStation = this.pathPoints.some(p =>
      Phaser.Math.Distance.Between(pointer.x, pointer.y, p.x, p.y) < 80
    );
    if (isNearAnyStation) {
      game.recordWrong();
      AudioManager.play('sfx_wrong');
      AudioManager.playWrongAnswer();
    }
  }

  private handlePathPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.gameState !== 'TRACING') return;

    if (!this.isTracing) {
      // Hover effect: Show pointer when near the current drawing tip
      if (this.curvePathPoints && this.curvePathPoints.length > 0) {
        const currentP = this.curvePathPoints[this.traceIndex];
        const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, currentP.x, currentP.y);
        this.input.setDefaultCursor(dist < 100 ? 'pointer' : 'default');
      }
      return;
    }

    if (this.isBlockingInput) return;
    if (!this.curvePathPoints || this.curvePathPoints.length === 0) return;

    // Look ahead in the pre-calculated points array (Arc-Length based)
    // allowing the user to skip ahead slightly (e.g. cutting corners) but not too much
    const maxLookAhead = 150; // number of points (approx 150px)
    const maxIndex = Math.min(this.curvePathPoints.length - 1, this.traceIndex + maxLookAhead);

    let bestIndex = this.traceIndex;
    let foundNew = false;

    // Scan ahead to find the furthest point close to the pointer
    for (let i = this.traceIndex; i <= maxIndex; i += 2) { // step by 2 for optimization
      const p = this.curvePathPoints[i];
      const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, p.x, p.y);
      if (dist < 60) {
        bestIndex = i;
        foundNew = true;
      }
    }

    // CAP: Don't let the line pass the next unvisited dot
    let nextUnvisitedIdx = this.visitedPoints.findIndex(v => !v);
    if (nextUnvisitedIdx !== -1) {
      const capIndex = this.dotCurveIndices[nextUnvisitedIdx];
      if (bestIndex > capIndex) {
        bestIndex = capIndex;
      }
    }

    if (foundNew && bestIndex > this.traceIndex) {
      this.traceIndex = bestIndex;
      // Sync traceProgress for compatibility with other logic if needed
      this.traceProgress = this.traceIndex / (this.curvePathPoints.length - 1);

      this.updatePaintedPath();

      // Emit particles at current tip (matches drawn line perfecty)
      const tip = this.curvePathPoints[this.traceIndex];
      this.traceParticles.emitParticleAt(tip.x, tip.y);

      // Check for station visits based on curve progress
      this.dotCurveIndices.forEach((capIdx, i) => {
        if (!this.visitedPoints[i] && this.traceIndex >= capIdx - 10) {
          this.triggerPointVisit(i);
        }
      });

      // Continuous Tracking Logic:
      // If we are tracing, and we have passed a point, ensure we have an attempt open for the NEXT point.
      // But only if input is not blocked (which it usually IS after a visit due to voice).
      if (!this.isBlockingInput && this.gameState === 'TRACING') {
        let lastVisitedIndex = -1;
        for (let j = 0; j < this.visitedPoints.length; j++) {
          if (this.visitedPoints[j]) lastVisitedIndex = j;
          else break;
        }
        if (lastVisitedIndex >= 0 && lastVisitedIndex < 4) {
          // We should be aiming for lastVisitedIndex + 1
          this.startMatchAttempt(lastVisitedIndex + 1);
        }
      }

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

    // SDK: If this is the target we were aiming for, record success
    if (this.activeTargetIndex === index) {
      this.endMatchAttempt(true);
    }

    this.isBlockingInput = true;

    AudioManager.play('sfx_correct');

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

    const voiceKey = `count_${index + 1}`;
    AudioManager.play(voiceKey);

    // SDK: Finish segment timer (except for starting point)
    // We have 4 segments: 1->2, 2->3, 3->4, 4->5.
    // index 1 corresponds to NUMBER_2 (end of segment 1)
    if (index > 0) {
      irukaGame.finishQuestionTimer?.();
    }

    AudioManager.onceEnded(voiceKey, () => {
      if (index > 0) {
        irukaGame.recordCorrect?.({ scoreDelta: 1 });
        this.score++;
        (window as any).irukaGameState.currentScore = this.score;
        sdk.score(this.score, 1);
        sdk.progress({
          levelIndex: 0,
          score: this.score,
        });
      }

      if (index === 0) {
        this.isBlockingInput = false;
        // Start first segment timer (1 to 2)
        irukaGame.startQuestionTimer?.();
        this.playHandTutorial();
      } else if (index === 4) {
        this.matchTracker?.finalize?.();
        this.matchTracker = null;
        irukaGame.finalizeAttempt?.("pass");
        const correctKey = AudioManager.playCorrectAnswer();

        const finishSafety = this.time.delayedCall(4000, () => {
          this.isBlockingInput = false;
          this.handleTracingComplete();
        });

        AudioManager.onceEnded(correctKey, () => {
          finishSafety.remove();
          this.isBlockingInput = false;
          this.handleTracingComplete();
        });
      } else {
        this.isBlockingInput = false;
        // Start next segment timer
        irukaGame.startQuestionTimer?.();
      }
    });
  }

  private handlePathPointerUp() {
    if (this.isTracing) {
      if (this.activeTargetIndex !== null) {
        this.endMatchAttempt(false, "USER_ABANDONED");
      }
    }
    this.isTracing = false;
    this.input.setDefaultCursor('default');
  }

  private updatePaintedPath() {
    this.paintedPathGraphics.clear();

    if (!this.curvePathPoints || this.curvePathPoints.length === 0) return;

    const maxIndex = this.traceIndex;

    if (maxIndex < 1) return;

    // 1. Draw Outer Glow
    this.paintedPathGraphics.lineStyle(30, 0xffa500, 0.2);
    this.drawPathSegments(maxIndex);

    // 2. Draw Middle Glow
    this.paintedPathGraphics.lineStyle(24, 0xff6600, 0.4);
    this.drawPathSegments(maxIndex);

    // 3. Draw Inner Core
    this.paintedPathGraphics.lineStyle(16, 0xffffff, 1);
    this.drawPathSegments(maxIndex);
  }

  private drawPathSegments(maxIndex: number) {
    this.paintedPathGraphics.beginPath();
    this.paintedPathGraphics.moveTo(this.curvePathPoints[0].x, this.curvePathPoints[0].y);

    // Draw all segments up to the current progress index
    // Since points are 1px apart, this forms a silky smooth curve without corners
    for (let i = 1; i <= maxIndex; i++) {
      this.paintedPathGraphics.lineTo(this.curvePathPoints[i].x, this.curvePathPoints[i].y);
    }

    this.paintedPathGraphics.strokePath();
  }

  private handleTracingComplete() {
    this.isTracing = false;
    this.gameState = 'TRACING_END';
    AudioManager.play(SFX_COMPLETE_KEY);

    // Safety: ensure timer is finished
    game.finishQuestionTimer?.();

    this.promptText.setText('Tuyệt vời! Bạn đã kết nối hết các trạm.');

    AudioManager.play('voice_complete');

    this.scene.start('EndGameScene', {
      lessonId: '',
      score: this.score,
      total: 4,
      startTime: (window as any).irukaGameState?.startTime,
    });
  }

  private playHandTutorial(isHint = false) {
    if (this.gameState !== 'TRACING' || this.isTracing) return;
    if (this.isShowingHint) return; // Prevent overlapping tutorials

    if (this.tutorialHand) this.tutorialHand.destroy();

    // If point 2 already visited, no more tutorial
    if (this.visitedPoints[1]) {
      this.tutorialHand = undefined;
      return;
    }

    const p0 = this.pathPoints[0];
    const p1 = this.pathPoints[1];

    this.tutorialHand = this.add.image(p0.x + 100, p0.y + 100, 'paint_brush')
      .setScale(0.75)
      .setDepth(100)
      .setAlpha(0)
      .setOrigin(0.5, 0);

    this.isShowingHint = true;

    // Record Hint only if forced
    if (isHint) {
      this.pendingHint += 1;
    }

    if (!this.visitedPoints[0]) {
      // --- PHASE 1: POINT & TAP AT NUMBER 1 ---
      this.tweens.add({
        targets: this.tutorialHand,
        alpha: 1,
        x: p0.x + 50,
        y: p0.y - 10,
        duration: 800,
        ease: 'Power2',
        onComplete: () => {
          if (!this.tutorialHand) return;
          // Tap animation
          this.tweens.add({
            targets: this.tutorialHand,
            scale: 0.6,
            duration: 250,
            yoyo: true,
            repeat: 1,
            onComplete: () => {
              if (!this.tutorialHand) return;
              // Fade out and repeat Phase 1
              this.tweens.add({
                targets: this.tutorialHand,
                alpha: 0,
                duration: 400,
                delay: 200,
                onComplete: () => {
                  this.isShowingHint = false;
                  this.lastInteractionTime = Date.now();
                }
              });
            }
          });
        }
      });
    } else {
      // --- PHASE 2: TRACE FROM NUMBER 1 TO NUMBER 2 ---
      this.tutorialHand.setPosition(p0.x + 50, p0.y - 10);
      this.tweens.add({
        targets: this.tutorialHand,
        alpha: 1,
        duration: 400,
        onComplete: () => {
          if (!this.tutorialHand) return;
          this.tweens.add({
            targets: this.tutorialHand,
            x: p1.x + 50,
            y: p1.y - 10,
            duration: 1200,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              if (!this.tutorialHand) return;
              this.tweens.add({
                targets: this.tutorialHand,
                alpha: 0,
                duration: 400,
                delay: 300,
                onComplete: () => {
                  if (!this.isTracing && this.gameState === 'TRACING') {
                    this.playHandTutorial();
                  }
                }
              });
            }
          });
        }
      });
    }
  }

  update(_time: number, _delta: number) {
    if (this.gameState === 'TRACING' && !this.isTracing && !this.isShowingHint) {
      if (Date.now() - this.lastInteractionTime > 10000) {
        this.playHandTutorial(true);
        this.lastInteractionTime = Date.now();
      }
    }
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
