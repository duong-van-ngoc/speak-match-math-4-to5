import { Howl, Howler } from 'howler';
import { AUDIO_ASSETS, type AudioAssetConfig } from './audioAssets';

const isIOS = () => {
  const ua = navigator.userAgent;
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  return iDevice || iPadOS;
};

class AudioManager {
  private sounds: Record<string, Howl> = {};
  private lastPlayTimes: Record<string, number> = {};
  private dynamicSources: Record<string, string> = {};
  private pendingReadyPlays: Record<string, boolean> = {};
  private sequenceToken = 0;
  private voicePlayOrder = 0;
  private voiceInstances: Record<string, Array<{ sid: number; order: number }>> = {};

  private unlocked = false;
  private unlocking = false;

  constructor() {
    Howler.autoUnlock = true;
    Howler.volume(1.0);
    (Howler as any).html5PoolSize = 100;
  }

  has(id: string): boolean {
    return !!this.sounds[id] || !!AUDIO_ASSETS[id] || !!this.dynamicSources[id];
  }

  private isRotateOverlayActive(): boolean {
    try {
      return (window as any).__rotateOverlayActive__ === true;
    } catch {
      return false;
    }
  }

  private shouldBlockWhileRotateOverlay(id: string): boolean {
    if (!this.isRotateOverlayActive()) return false;
    if (!this.isVoiceKey(id)) return false;
    return id !== 'voice_rotate';
  }

  getActiveVoiceSnapshot(): { id: string; seek: number } | null {
    let bestId: string | null = null;
    let bestSeek = 0;
    let bestOrder = -1;

    for (const id of Object.keys(this.voiceInstances)) {
      if (id === 'voice_rotate') continue;
      const sound = this.sounds[id];
      if (!sound) continue;

      const inst = this.voiceInstances[id] ?? [];
      for (const { sid, order } of inst) {
        let playing = false;
        try {
          playing = !!(sound as any).playing?.(sid);
        } catch {}
        if (!playing) continue;

        if (order <= bestOrder) continue;
        bestOrder = order;
        bestId = id;

        try {
          const v = (sound as any).seek?.(sid);
          bestSeek = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
        } catch {
          bestSeek = 0;
        }
      }
    }

    return bestId ? { id: bestId, seek: bestSeek } : null;
  }

  resumeVoiceSnapshot(snapshot: { id: string; seek: number } | null): boolean {
    if (!snapshot) return false;
    const id = snapshot.id;
    if (!id) return false;
    if (!this.isVoiceKey(id)) return false;
    if (id === 'voice_rotate') return false;
    if (this.unlocking) return false;
    if (this.shouldBlockWhileRotateOverlay(id)) return false;

    const sound = this.sounds[id];
    if (!sound) return false;

    const playFrom = () => {
      try {
        this.stopAllVoices();
      } catch {}

      let sid: number | undefined;
      try {
        sid = sound.play() as unknown as number;
      } catch {
        sid = undefined;
      }
      if (!sid) return;

      try {
        this.lastPlayTimes[id] = Date.now();
      } catch {}

      this.trackVoiceInstance(id, sid);
      try {
        (sound as any).seek?.(snapshot.seek ?? 0, sid);
      } catch {}
    };

    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
    if (!state || state === 'loaded') {
      playFrom();
      return true;
    }

    try {
      sound.off('load');
      sound.once('load', () => playFrom());
      if (state === 'unloaded') sound.load();
    } catch {}
    return true;
  }

  loadAll(): Promise<void> {
    return new Promise((resolve) => {
      const keys = Object.keys(AUDIO_ASSETS);
      let loadedCount = 0;
      const total = keys.length;
      if (total === 0) return resolve();

      keys.forEach((key) => {
        const config = AUDIO_ASSETS[key] as AudioAssetConfig | undefined;
        if (!config) {
          loadedCount++;
          if (loadedCount === total) resolve();
          return;
        }
        const defaultHtml5 = isIOS() ? true : false;

        this.sounds[key] = new Howl({
          src: [config.src],
          loop: config.loop ?? false,
          volume: config.volume ?? 1.0,
          html5: config.html5 ?? defaultHtml5,

          onload: () => {
            loadedCount++;
            if (loadedCount === total) resolve();
          },
          onloaderror: (id: number, error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[Howler Load Error] Key:${key} ID:${id} Msg:${msg} Path:${config.src}`);
            loadedCount++;
            if (loadedCount === total) resolve();
          },
        });
      });
    });
  }

  async unlockAndWarmup(
    ids: string[] = ['sfx_click', 'sfx_correct', 'sfx_wrong', 'voice_stage1_count_again', 'voice_count_1']
  ) {
    if (this.unlocked || this.unlocking) return;
    this.unlocking = true;

    try {
      const ctx = (Howler as any).ctx as AudioContext | undefined;
      if (ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {}
      }

      if (isIOS()) {
        ids.forEach((id) => {
          const sound = this.sounds[id];
          if (!sound) return;
          const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
          if (state === 'unloaded') sound.load();
        });
      } else {
        await Promise.all(ids.map((id) => this.warmupOne(id).catch(() => undefined)));
      }

      this.unlocked = true;
    } finally {
      this.unlocking = false;
    }
  }

  private warmupOne(id: string): Promise<void> {
    const sound = this.sounds[id];
    if (!sound) return Promise.resolve();

    return new Promise((resolve) => {
      const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;

      const doPlaySilent = () => {
        const originalVol = sound.volume();
        sound.volume(0);

        const sid = sound.play();
        setTimeout(() => {
          try {
            sound.stop(sid as any);
          } catch {}
          sound.volume(originalVol);
          resolve();
        }, 30);
      };

      if (state === 'loaded' || state === undefined) {
        doPlaySilent();
        return;
      }

      sound.off('load');
      sound.once('load', () => doPlaySilent());

      if (state === 'unloaded') sound.load();
    });
  }

  private waitForLoaded(id: string, timeoutMs = 5000): Promise<boolean> {
    const sound = this.sounds[id];
    if (!sound) return Promise.resolve(false);

    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
    if (!state || state === 'loaded') return Promise.resolve(true);
    if (state === 'unloaded') sound.load();

    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        try {
          sound.off('load');
          sound.off('loaderror');
        } catch {}
        resolve(ok);
      };

      sound.once('load', () => finish(true));
      sound.once('loaderror', () => finish(false));
      setTimeout(() => finish(false), timeoutMs);
    });
  }

  async playAndWait(id: string, opts?: { timeoutMs?: number }): Promise<boolean> {
    if (this.unlocking) return false;
    if (this.shouldBlockWhileRotateOverlay(id)) return false;

    const sound = this.sounds[id];
    if (!sound) {
      console.warn(`[AudioManager] Sound ID not found: ${id}`);
      return false;
    }

    const loaded = await this.waitForLoaded(id, opts?.timeoutMs ?? 5000);
    if (!loaded) return false;

    const sid = this.play(id);
    if (sid == null) return false;

    return await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        try {
          sound.off('end', onEnd as any);
          sound.off('stop', onStop as any);
        } catch {}
        resolve(ok);
      };

      const onEnd = () => finish(true);
      const onStop = () => finish(false);

      sound.once('end', onEnd as any, sid as any);
      sound.once('stop', onStop as any, sid as any);
      setTimeout(() => finish(true), opts?.timeoutMs ?? 5000);
    });
  }

  async playSequence(ids: string[], opts?: { timeoutMsPerItem?: number; gapMs?: number }): Promise<void> {
    const token = ++this.sequenceToken;
    for (let idx = 0; idx < ids.length; idx++) {
      const id = ids[idx];
      if (token !== this.sequenceToken) return;
      await this.playAndWait(id, { timeoutMs: opts?.timeoutMsPerItem ?? 5000 });
      if (token !== this.sequenceToken) return;
      const gap = opts?.gapMs ?? 0;
      if (gap > 0 && idx < ids.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, gap));
      }
    }
  }

  play(id: string): number | undefined {
    if (this.unlocking) return;
    if (this.shouldBlockWhileRotateOverlay(id)) return;

    const now = Date.now();
    const cooldown = this.getCooldown(id);
    const lastTime = this.lastPlayTimes[id] ?? 0;
    if (cooldown > 0 && now - lastTime < cooldown) return;

    const sound = this.sounds[id];
    if (!sound) {
      console.warn(`[AudioManager] Sound ID not found: ${id}`);
      return;
    }

    // Prevent stacking the same looping track (e.g. BGM) on repeated gestures.
    if (AUDIO_ASSETS[id]?.loop && sound.playing()) return;

    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
    if (state && state !== 'loaded') {
      if (state === 'unloaded') sound.load();
      return;
    }

    this.lastPlayTimes[id] = now;
    return sound.play();
  }

  playWhenReady(id: string): void {
    if (this.unlocking) return;
    if (this.shouldBlockWhileRotateOverlay(id)) return;

    const sound = this.sounds[id];
    if (!sound) {
      console.warn(`[AudioManager] Sound ID not found: ${id}`);
      return;
    }

    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
    if (!state || state === 'loaded') {
      this.play(id);
      return;
    }

    if (this.pendingReadyPlays[id]) return;
    this.pendingReadyPlays[id] = true;

    sound.off('load');
    sound.once('load', () => {
      this.pendingReadyPlays[id] = false;
      this.play(id);
    });
    sound.once('loaderror', () => {
      this.pendingReadyPlays[id] = false;
    });

    if (state === 'unloaded') sound.load();
  }

  isPlaying(id: string): boolean {
    const sound = this.sounds[id];
    return !!sound && sound.playing();
  }

  playFromUrl(id: string, src: string, opts?: { loop?: boolean; volume?: number; html5?: boolean }): number | undefined {
    if (this.unlocking) return;

    const now = Date.now();
    const cooldown = this.getCooldown(id);
    const lastTime = this.lastPlayTimes[id] ?? 0;
    if (cooldown > 0 && now - lastTime < cooldown) return;

    const existing = this.sounds[id];
    const prevSrc = this.dynamicSources[id];

    if (!existing || prevSrc !== src) {
      this.dynamicSources[id] = src;
      const defaultHtml5 = isIOS() ? true : false;

      this.sounds[id] = new Howl({
        src: [src],
        loop: opts?.loop ?? false,
        volume: opts?.volume ?? 1.0,
        html5: opts?.html5 ?? defaultHtml5,
        onloaderror: (soundId: number, error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[Howler Load Error] Dynamic Key:${id} ID:${soundId} Msg:${msg} Path:${src}`);
        },
      });
    }

    const sound = this.sounds[id];
    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
    if (state && state !== 'loaded') {
      if (state === 'unloaded') sound.load();
      return;
    }

    this.lastPlayTimes[id] = now;
    const sid = sound.play() as unknown as number | undefined;
    this.trackVoiceInstance(id, sid);
    return sid;
  }

  private isVoiceKey(id: string) {
    return id.startsWith('voice_') || id.startsWith('correct_answer_') || id.startsWith('prompt_');
  }

  private trackVoiceInstance(id: string, sid: number | undefined) {
    if (!sid) return;
    if (!this.isVoiceKey(id)) return;
    const sound = this.sounds[id];
    if (!sound) return;

    const entry = { sid, order: ++this.voicePlayOrder };
    (this.voiceInstances[id] ??= []).push(entry);

    const cleanup = () => {
      const list = this.voiceInstances[id];
      if (!list) return;
      const next = list.filter((x) => x.sid !== sid);
      if (next.length === 0) {
        delete this.voiceInstances[id];
      } else {
        this.voiceInstances[id] = next;
      }
    };

    try {
      sound.once('end', cleanup, sid as any);
      sound.once('stop', cleanup, sid as any);
    } catch {}
  }

  private cancelPendingVoicePlays(): void {
    for (const [id, pending] of Object.entries(this.pendingReadyPlays)) {
      if (!pending) continue;
      if (!this.isVoiceKey(id)) continue;
      this.pendingReadyPlays[id] = false;
      const sound = this.sounds[id];
      if (!sound) continue;
      try {
        sound.off('load');
        sound.off('loaderror');
      } catch {}
    }
  }

  // Interrupt current voice and play the requested voice immediately.
  // Used for guides/reading voices so rapid taps feel responsive.
  playVoiceInterrupt(id: string): void {
    if (!id) return;
    if (!this.has(id)) return;
    if (this.unlocking) return;
    if (this.shouldBlockWhileRotateOverlay(id)) return;

    this.cancelPendingVoicePlays();
    this.stopAllVoices();
    this.playWhenReady(id);
  }

  playVoiceInterruptAndWait(id: string, opts?: { timeoutMs?: number }): Promise<boolean> {
    if (!id) return Promise.resolve(false);
    if (!this.has(id)) return Promise.resolve(false);
    if (this.unlocking) return Promise.resolve(false);
    if (this.shouldBlockWhileRotateOverlay(id)) return Promise.resolve(false);

    this.cancelPendingVoicePlays();
    this.stopAllVoices();
    return this.playAndWait(id, opts);
  }

  stop(id: string): void {
    const s = this.sounds[id];
    if (!s) return;
    s.stop();
  }

  stopSound(id: string): void {
    const s = this.sounds[id];
    if (s) s.stop();
  }

  stopAll(): void {
    Howler.stop();
  }

  private getCooldown(id: string): number {
    return AUDIO_ASSETS[id]?.cooldownMs ?? 0;
  }

  stopAllVoicePrompts(): void {
    const voiceKeys = Object.keys(AUDIO_ASSETS).filter((key) => key.startsWith('prompt_') || key.startsWith('correct_answer_'));
    voiceKeys.forEach((key) => this.stopSound(key));
  }

  stopByPrefixes(prefixes: string[]): void {
    const keys = Object.keys(this.sounds);
    keys.forEach((key) => {
      for (const p of prefixes) {
        if (key.startsWith(p)) {
          this.stopSound(key);
          break;
        }
      }
    });
  }

  // Use when enabling SpeechRecognition to avoid OS/browser ducking or routing voices to the earpiece.
  stopAllVoices(): void {
    this.stopByPrefixes(['voice_', 'correct_answer_', 'prompt_']);
    this.cancelPendingVoicePlays();
    this.voiceInstances = {};
  }

  playCorrectAnswer(): void {
    const randomIndex = Math.floor(Math.random() * 4) + 1;
    this.play(`correct_answer_${randomIndex}`);
  }

  async playCorrectAnswerAndWait(): Promise<void> {
    const randomIndex = Math.floor(Math.random() * 4) + 1;
    const id = `correct_answer_${randomIndex}`;
    if (!this.has(id)) return;
    await this.playAndWait(id, { timeoutMs: 5000 });
  }

  playStage1PaintPrompt(objectKey: string): void {
    const id =
      objectKey === 'watermelon'
        ? 'voice_stage1_paint_watermelon'
        : objectKey === 'square_cake'
          ? 'voice_stage1_paint_square_cake'
          : objectKey === 'red_envelope'
            ? 'voice_stage1_paint_red_envelope'
            : objectKey === 'lantern'
              ? 'voice_stage1_paint_lantern'
              : objectKey === 'sticky_roll'
                ? 'voice_stage1_paint_sticky_roll'
                : undefined;
    if (!id) return;
    this.playVoiceInterrupt(id);
  }

  playStage1CountAgainAndWait(): Promise<boolean> {
    if (!this.has('voice_stage1_count_again')) return Promise.resolve(false);
    return this.playAndWait('voice_stage1_count_again', { timeoutMs: 5000 });
  }

  playCountNumber(n: number): void {
    const num = Math.max(1, Math.min(8, Math.round(n || 1)));
    this.playVoiceInterrupt(`voice_count_${num}`);
  }

  playCountSequence(n: number): Promise<void> {
    const max = Math.max(1, Math.min(8, Math.round(n || 1)));
    const ids = Array.from({ length: max }, (_, i) => `voice_count_${i + 1}`);
    return this.playSequence(ids, { timeoutMsPerItem: 4000 });
  }

  playPrompt(type: 'less' | 'more', animal: string): void {
    const id = `prompt_${type}_${animal}`;
    this.play(id);
  }
}

export default new AudioManager();
