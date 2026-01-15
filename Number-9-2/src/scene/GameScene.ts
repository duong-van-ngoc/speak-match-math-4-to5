import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager';
import ConnectSixScene from './ConnectSixScene';
import { getReplayMode } from '../config/replayMode';
import { CONNECT_SIX_ASSET_KEYS } from '../assets/assetKeys';

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
  private stageOrder: number[] = [1];
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
    this.stageOrder = [1];

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
    const stageId = this.stageOrder[this.stagePos] ?? 0;
    if (stageId === 1) {
      AudioManager.playVoiceInterrupt?.('voice_stage3_guide');
    }
  }

  private playStageGuideOnce(stageId: number) {
    if (!this.audioReady) return;
    if (this.playedStageGuides.has(stageId)) return;
    if (stageId !== 0 && stageId !== 1) return;
    // Stage 2 has its own guide; only auto-guide ConnectSix here.
    if (stageId === 0) return;
    this.playedStageGuides.add(stageId);
    try {
      AudioManager.playStageGuide(2);
    } catch {}
  }

  private ensureMiniGameScenesAdded() {
    try {
      if (!this.scene.get('ConnectSixScene')) {
        this.scene.add('ConnectSixScene', ConnectSixScene, false);
      }
    } catch {}
  }

  private startStageSequence(pos: number) {
    this.stagePos = Math.max(0, Math.min(pos, this.stageOrder.length - 1));
    // const stageId = this.stageOrder[this.stagePos] ?? 0;

    // Make sure nothing from the previous stage blocks rendering/input.
    try {
      this.scene.stop('ConnectSixScene');
    } catch {}

    // stageId === 1 (ConnectSix)
    this.playStageGuideOnce(1);
    this.runConnectSixOnce(() => this.onStageDone());
  }

  private onStageDone() {
    const next = this.stagePos + 1;
    if (next < this.stageOrder.length) {
      this.startStageSequence(next);
      return;
    }
    this.scene.start('EndGameScene', { total: 1 });
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

  private getConnectSixPack(levelIndex: number) {
    void levelIndex;
    return {
      groups: [
        { id: 'carp_lantern', label: 'đèn lồng cá chép', count: 6, spriteKey: CONNECT_SIX_ASSET_KEYS.groupCarpLantern, x: 260, y: 170, cols: 3 },
        { id: 'star_lantern', label: 'đèn ông sao', count: 9, spriteKey: CONNECT_SIX_ASSET_KEYS.groupStarLantern, x: 1020, y: 170, cols: 3 },
        { id: 'lantern', label: 'đèn lồng', count: 9, spriteKey: CONNECT_SIX_ASSET_KEYS.groupLantern, x: 260, y: 560, cols: 3 },
        { id: 'paper_lantern', label: 'đèn lồng giấy xếp', count: 8, spriteKey: CONNECT_SIX_ASSET_KEYS.groupPaperLantern, x: 1020, y: 560, cols: 3 },
      ],
    };
  }
}
