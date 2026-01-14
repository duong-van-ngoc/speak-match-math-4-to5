import { Howl, Howler } from 'howler';

interface SoundConfig {
  src: string;
  loop?: boolean;
  volume?: number;
  html5?: boolean;
}

const BASE_PATH = 'assets/audio/';

const SOUND_MAP: Record<string, SoundConfig> = {
  sfx_correct: { src: `${BASE_PATH}correct.mp3`, volume: 0.6 },
  sfx_wrong: { src: `${BASE_PATH}wrong.mp3`, volume: 0.6 },
  sfx_click: { src: `${BASE_PATH}click.mp3`, volume: 0.6 },
  voice_rotate: { src: `${BASE_PATH}xoay.mp3`, volume: 0.8 },

  correct_answer_1: { src: `${BASE_PATH}correct_answer_1.mp3`, volume: 1.0 },
  correct_answer_2: { src: `${BASE_PATH}correct_answer_2.mp3`, volume: 1.0 },
  correct_answer_3: { src: `${BASE_PATH}correct_answer_3.mp3`, volume: 1.0 },
  correct_answer_4: { src: `${BASE_PATH}correct_answer_4.mp3`, volume: 1.0 },

  bgm_main: { src: `${BASE_PATH}bgm_main.mp3`, loop: true, volume: 0.3, html5: false },

  complete: { src: `${BASE_PATH}vic_sound.mp3` },
  voice_intro: { src: `${BASE_PATH}voice_intro.mp3` },
  voice_join: { src: `${BASE_PATH}join.mp3`, volume: 1.0 },
  voice_need_finish: { src: `${BASE_PATH}voice_need_finish.mp3` },

  voice_complete: { src: `${BASE_PATH}complete.mp3`, volume: 0.35 },
  fireworks: { src: `${BASE_PATH}fireworks.mp3`, volume: 1.0 },
  applause: { src: `${BASE_PATH}applause.mp3`, volume: 1.0 },
};

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
  private queuedMissingPlays: Record<string, boolean> = {};
  private queuedUnlockPlays: Record<string, boolean> = {};

  private unlocked = false;
  private unlocking = false;

  constructor() {
    Howler.autoUnlock = true;
    Howler.volume(1.0);
    (Howler as any).html5PoolSize = 100;
  }

  loadAll(): Promise<void> {
    return new Promise((resolve) => {
      const keys = Object.keys(SOUND_MAP);
      let loadedCount = 0;
      const total = keys.length;
      if (total === 0) return resolve();

      keys.forEach((key) => {
        const config = SOUND_MAP[key];
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

        // If something requested this sound before `loadAll()` finished (e.g. first click),
        // start it as soon as the Howl exists / finishes loading.
        if (this.queuedMissingPlays[key]) {
          delete this.queuedMissingPlays[key];
          this.playWhenReady(key);
        }
      });
    });
  }

  async unlockAndWarmup(ids: string[] = ['sfx_click', 'sfx_correct', 'sfx_wrong']) {
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

      // Flush any play requests that came in while we were unlocking.
      // (First user gesture often triggers unlock + BGM start together.)
      const idsToPlay = Object.keys(this.queuedUnlockPlays);
      if (idsToPlay.length) {
        this.queuedUnlockPlays = {};
        idsToPlay.forEach((id) => this.playWhenReady(id));
      }
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

      sound.once('load', () => doPlaySilent());

      if (state === 'unloaded') sound.load();
    });
  }

  play(id: string): number | undefined {
    if (this.unlocking) {
      this.queuedUnlockPlays[id] = true;
      return;
    }

    const now = Date.now();
    const cooldown = this.getCooldown(id);
    const lastTime = this.lastPlayTimes[id] ?? 0;
    if (cooldown > 0 && now - lastTime < cooldown) return;

    const sound = this.sounds[id];
    if (!sound) {
      console.warn(`[AudioManager] Sound ID not found: ${id}`);
      return;
    }

    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
    if (state && state !== 'loaded') {
      if (state === 'unloaded') sound.load();
      return;
    }

    this.lastPlayTimes[id] = now;
    return sound.play();
  }

  playWhenReady(id: string): void {
    if (this.unlocking) {
      this.queuedUnlockPlays[id] = true;
      return;
    }

    const sound = this.sounds[id];
    if (!sound) {
      // The sound may not exist yet if `loadAll()` is still in progress.
      // Queue this request so it can start once the Howl is created.
      this.queuedMissingPlays[id] = true;
      return;
    }

    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;
    if (!state || state === 'loaded') {
      this.play(id);
      return;
    }

    if (this.pendingReadyPlays[id]) return;
    this.pendingReadyPlays[id] = true;

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

  onceEnded(id: string, cb: () => void): void {
    const sound = this.sounds[id];
    if (!sound) {
      cb();
      return;
    }

    // Howler will call the handler when the current playback ends.
    sound.once('end', () => cb());
  }

  playFromUrl(id: string, src: string, opts?: { loop?: boolean; volume?: number; html5?: boolean }): number | undefined {
    if (this.unlocking) {
      this.queuedUnlockPlays[id] = true;
      return;
    }

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
    return sound.play();
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
    switch (id) {
      case 'sfx_click':
        return 200;
      case 'voice_intro':
        return 3000;
      case 'voice_complete':
      case 'complete':
        return 1500;
      default:
        return 0;
    }
  }

  stopAllVoicePrompts(): void {
    const voiceKeys = Object.keys(SOUND_MAP).filter((key) => key.startsWith('prompt_') || key.startsWith('correct_answer_'));
    voiceKeys.forEach((key) => this.stopSound(key));
  }

  playCorrectAnswer(): void {
    const randomIndex = Math.floor(Math.random() * 4) + 1;
    this.play(`correct_answer_${randomIndex}`);
  }

  playPrompt(type: 'less' | 'more', animal: string): void {
    const id = `prompt_${type}_${animal}`;
    this.play(id);
  }
}

export default new AudioManager();
