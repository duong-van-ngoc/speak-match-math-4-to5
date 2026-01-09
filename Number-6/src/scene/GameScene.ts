import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager';
import { COUNT_AND_PAINT_COMPLETE_EVENT, CountAndPaintScene } from './QuantityScene';
import { getReplayMode } from '../config/replayMode';
import { sdk, game } from '../main';

/* ===================== AUDIO GLOBAL FLAG ===================== */
const AUDIO_UNLOCKED_KEY = '__audioUnlocked__';
const AUDIO_UNLOCKED_EVENT = 'audio-unlocked';

// ASSETS (keys only; loaded elsewhere)
// - Voice: 'voice_intro'

type WindowGameApi = {
  setRandomGameViewportBg?: () => void;
  setGameButtonsVisible?: (visible: boolean) => void;
} & Record<string, unknown>;

export default class GameScene extends Phaser.Scene {
  public score = 0;
  public levelIndex = 0;
  // Total randomizable "levels" for replay: reuse CountAndPaintScene's internal levels count (currently 5).
  public readonly totalLevels = 5;
  private stageOrder: number[] = [0];
  private stagePos = 0;

  private audioReady = false;
  private hasPlayedInstructionVoice = false;
  private isRotateOverlayActive(): boolean {
    try {
      return (window as any).__rotateOverlayActive__ === true;
    } catch {
      return false;
    }
  }

  private readonly onAudioUnlocked = () => {
    (async () => {
      const win = window as unknown as Record<string, unknown>;
      win[AUDIO_UNLOCKED_KEY] = true;
      this.audioReady = true;

      try {
        await AudioManager.unlockAndWarmup?.();
      } catch {}

      this.playInstructionVoiceOnce();
    })();
  };

  constructor() {
    super('GameScene');
  }

  init(data: { score?: number }) {
    this.score = data.score ?? 0;
    this.hasPlayedInstructionVoice = false;
    this.stagePos = 0;
    const replayMode = getReplayMode();
    // Allow replay button to randomize a "level" pack.
    const max = Math.max(1, this.totalLevels);
    const requested = (data as any)?.levelIndex;
    this.levelIndex =
      typeof requested === 'number' && Number.isFinite(requested)
        ? Math.max(0, Math.min(requested, max - 1))
        : replayMode === 'debug'
          ? Phaser.Math.Between(0, max - 1)
          : 0;
    // Only Stage 1 (Count&Paint) is used in this game variant.
    this.stageOrder = [0];

    const win = window as unknown as Record<string, unknown>;
    this.audioReady = !!win[AUDIO_UNLOCKED_KEY];
  }

  create() {
    try {
      (window as unknown as WindowGameApi).setRandomGameViewportBg?.();
    } catch {
      // Optional host helper may not exist.
    }

    const w = window as unknown as WindowGameApi;
    w.setGameButtonsVisible?.(true);

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    window.addEventListener(AUDIO_UNLOCKED_EVENT, this.onAudioUnlocked, { once: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener(AUDIO_UNLOCKED_EVENT, this.onAudioUnlocked);
    });

    this.playInstructionVoiceOnce();

    this.ensureMiniGameScenesAdded();
    // Khởi tạo trạng thái lưu điểm cho SDK
    (window as any).irukaGameState = {
      startTime: Date.now(),
      currentScore: 0,
    };
    // Khởi tạo tổng số level cho SDK
    game.setTotal(this.totalLevels);
    sdk.score(this.score, 0);
    sdk.progress({ levelIndex: this.levelIndex, total: this.totalLevels });

    this.startStageSequence(0);
  }

  update() {
    // Intentionally empty: replace with new game loop logic.
  }

  private playInstructionVoiceOnce() {
    if (this.hasPlayedInstructionVoice) return;
    if (!this.audioReady) return;
    if (this.isRotateOverlayActive()) return;

    this.hasPlayedInstructionVoice = true;
    // Stage 1 plays its own per-object prompt; replay it once after audio is unlocked.
    const stageId = this.stageOrder[this.stagePos] ?? 0;
    if (stageId === 0) {
      try {
        const s = this.scene.get('CountAndPaintScene') as any;
        const idx = Number(s?.currentLevelIndex ?? 0) || 0;
        const level = s?.levels?.[idx];
        const objectKey = String(level?.objectKey ?? '');
        if (objectKey) AudioManager.playStage1PaintPrompt(objectKey);
      } catch {}
      return;
    }
  }

  private ensureMiniGameScenesAdded() {
    try {
      if (!this.scene.get('CountAndPaintScene')) {
        this.scene.add('CountAndPaintScene', CountAndPaintScene, false);
      }
    } catch {}
  }

  private startStageSequence(pos: number) {
    this.stagePos = Math.max(0, Math.min(pos, this.stageOrder.length - 1));
    const stageId = this.stageOrder[this.stagePos] ?? 0;

    // Make sure nothing from the previous stage blocks rendering/input.
    try {
      this.scene.stop('CountGroupsDetailScene');
    } catch {}
    try {
      this.scene.stop('CountGroupsScene');
    } catch {}
    try {
      this.scene.stop('ConnectSixScene');
    } catch {}
    try {
      this.scene.stop('CountAndPaintScene');
    } catch {}

    if (stageId === 0) {
      const quantityScene = this.scene.get('CountAndPaintScene');
      quantityScene.events.off(COUNT_AND_PAINT_COMPLETE_EVENT);
      quantityScene.events.once(COUNT_AND_PAINT_COMPLETE_EVENT, () => {
        try {
          this.scene.stop('CountAndPaintScene');
        } catch {}
        this.onStageDone();
      });

      this.scene.launch('CountAndPaintScene', {
        score: this.score,
        levelOrder: this.buildCyclicOrder(this.totalLevels, this.levelIndex),
      } as any);
      this.scene.bringToTop('CountAndPaintScene');
      return;
    }
  }

  private onStageDone() {
    const next = this.stagePos + 1;
    if (next < this.stageOrder.length) {
      this.startStageSequence(next);
      return;
    }
    // Khi hoàn thành stage, gửi thông tin hoàn thành cho SDK
    game.finalizeAttempt();
    this.scene.start('EndGameScene', { total: this.totalLevels, score: this.score });
  }

  private buildCyclicOrder(count: number, startIndex: number) {
    const n = Math.max(1, Math.floor(count));
    const start = ((Math.floor(startIndex) % n) + n) % n;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((start + i) % n);
    return out;
  }
}
