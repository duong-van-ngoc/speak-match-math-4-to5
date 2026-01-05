import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager';
import CountGroupsScene from './CountGroupsScene';
import ConnectSixScene from './ConnectSixScene';
import { COUNT_AND_PAINT_COMPLETE_EVENT, CountAndPaintScene } from './QuantityScene';
import { CONNECT_SIX_ASSET_KEYS } from '../assets/assetKeys';
import { getReplayMode } from '../config/replayMode';

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
  private startStage = 0; // 0: Count&Paint, 1: CountGroups, 2: ConnectSix
  private stageOrder: number[] = [0, 1, 2];
  private stagePos = 0;
  private connectSixStart = 0;

  private audioReady = false;
  private hasPlayedInstructionVoice = false;
  private playedStageGuides = new Set<number>();
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
      this.playStageGuideOnce(this.stageOrder[this.stagePos] ?? 0);
    })();
  };

  constructor() {
    super('GameScene');
  }

  init(data: { score?: number }) {
    this.score = data.score ?? 0;
    this.hasPlayedInstructionVoice = false;
    this.playedStageGuides = new Set();
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

    const sStart = (data as any)?.startStage;
    this.startStage =
      typeof sStart === 'number' && Number.isFinite(sStart)
        ? Math.max(0, Math.min(2, Math.floor(sStart)))
        : replayMode === 'debug'
          ? Phaser.Math.Between(0, 2)
          : 0;
    this.stageOrder = replayMode === 'debug' ? this.buildCyclicOrder(3, this.startStage) : [0, 1, 2];

    const cStart = (data as any)?.connectSixStart;
    this.connectSixStart =
      typeof cStart === 'number' && Number.isFinite(cStart)
        ? Math.max(0, Math.min(2, cStart))
        : replayMode === 'debug'
          ? Phaser.Math.Between(0, 2)
          : 0;

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
    if (stageId === 1) {
      AudioManager.playVoiceInterrupt?.('voice_stage2_guide');
      return;
    }
    if (stageId === 2) {
      AudioManager.playVoiceInterrupt?.('voice_stage3_guide');
    }
  }

  private playStageGuideOnce(stageId: number) {
    if (!this.audioReady) return;
    if (this.playedStageGuides.has(stageId)) return;
    if (stageId !== 0 && stageId !== 1 && stageId !== 2) return;
    // Stage 1/2 have their own per-level/per-item audio prompts.
    if (stageId === 0 || stageId === 1) return;
    this.playedStageGuides.add(stageId);
    try {
      AudioManager.playStageGuide(stageId);
    } catch {}
  }

  private ensureMiniGameScenesAdded() {
    try {
      if (!this.scene.get('CountAndPaintScene')) {
        this.scene.add('CountAndPaintScene', CountAndPaintScene, false);
      }
    } catch {}

    try {
      if (!this.scene.get('CountGroupsScene')) {
        this.scene.add('CountGroupsScene', CountGroupsScene, false);
      }
    } catch {}

    try {
      if (!this.scene.get('ConnectSixScene')) {
        this.scene.add('ConnectSixScene', ConnectSixScene, false);
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

    if (stageId === 1) {
      this.scene.launch('CountGroupsScene', { score: this.score });
      this.scene.bringToTop('CountGroupsScene');

      const countGroups = this.scene.get('CountGroupsScene');
      countGroups.events.off('minigame:done');
      countGroups.events.once('minigame:done', () => {
        try {
          this.scene.stop('CountGroupsDetailScene');
        } catch {}
        try {
          this.scene.stop('CountGroupsScene');
        } catch {}
        this.onStageDone();
      });
      return;
    }

    // stageId === 2 (ConnectSix)
    this.playStageGuideOnce(2);
    this.runConnectSixOnce(() => this.onStageDone());
  }

  private onStageDone() {
    const next = this.stagePos + 1;
    if (next < this.stageOrder.length) {
      this.startStageSequence(next);
      return;
    }
    this.scene.start('EndGameScene', { total: 3 });
  }

  private runConnectSixOnce(onDone: (() => void) | undefined) {
    const pack = this.getConnectSixPack(this.connectSixStart);

    try {
      this.scene.stop('ConnectSixScene');
    } catch {}

    this.scene.launch('ConnectSixScene', { pack });
    this.scene.bringToTop('ConnectSixScene');

    const connectSix = this.scene.get('ConnectSixScene');
    connectSix.events.off('minigame:done');
    connectSix.events.once('minigame:done', () => {
      try {
        this.scene.stop('ConnectSixScene');
      } catch {}

      onDone?.();
    });
  }

  private buildCyclicOrder(count: number, startIndex: number) {
    const n = Math.max(1, Math.floor(count));
    const start = ((Math.floor(startIndex) % n) + n) % n;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((start + i) % n);
    return out;
  }

  private getConnectSixPack(levelIndex: number) {
    void levelIndex;
    // ConnectSix chỉ có 1 pack: 6 xe máy, 6 thuyền, 5 xe đạp, 4 máy bay.
    return {
      groups: [
        { id: 'scooters', label: 'xe máy', count: 6, spriteKey: CONNECT_SIX_ASSET_KEYS.groupScooters6, x: 260, y: 170, cols: 3 },
        { id: 'boats', label: 'thuyền', count: 6, spriteKey: CONNECT_SIX_ASSET_KEYS.groupBoats6, x: 1020, y: 170, cols: 3 },
        { id: 'bikes', label: 'xe đạp', count: 5, spriteKey: CONNECT_SIX_ASSET_KEYS.groupBikes5, x: 260, y: 560, cols: 3 },
        { id: 'helis', label: 'máy bay', count: 4, spriteKey: CONNECT_SIX_ASSET_KEYS.groupHelis4, x: 1020, y: 560, cols: 2 },
      ],
    };
  }
}
