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

  bgm_main: { src: `${BASE_PATH}bgm_main.mp3`, loop: true, volume: 0.25, html5: false },

  complete: { src: `${BASE_PATH}vic_sound.mp3`, volume: 1.0 },
  voice_need_finish: { src: `${BASE_PATH}voice_need_finish.mp3`, volume: 1.0 },

  voice_complete: { src: `${BASE_PATH}complete.mp3`, volume: 0.35 },
  fireworks: { src: `${BASE_PATH}fireworks.mp3`, volume: 0.8 },
  applause: { src: `${BASE_PATH}applause.mp3`, volume: 0.8 },
  // ColorScene level 1/2 guide voices
  voice_guide_color_1: { src: `${BASE_PATH}color.mp3`, volume: 1.0 },
  voice_guide_color_2: { src: `${BASE_PATH}cricle.mp3`, volume: 1.0 },
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
  private activeBgmId: string | null = null;

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

  unlockAndWarmup(ids: string[] = ['sfx_click', 'sfx_correct', 'sfx_wrong']): void {
    if (this.unlocked || this.unlocking) return;
    this.unlocking = true;

    try {
      const ctx = (Howler as any).ctx as AudioContext | undefined;
      if (ctx && ctx.state === 'suspended') {
        try {
          void ctx.resume();
        } catch {
          // Ignore: some browsers throw if resume is not allowed.
        }
      }

      // IMPORTANT:
      // This must happen synchronously in the same user gesture stack to satisfy
      // browser autoplay policies. Don't `await` here.
      ids.forEach((id) => this.warmupOneSync(id));
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

  private warmupOneSync(id: string): void {
    const sound = this.sounds[id];
    if (!sound) return;

    const state = (sound as any).state?.() as 'unloaded' | 'loading' | 'loaded' | undefined;

    // TRÁNH warmup bằng cách phát silent (volume=0) vì nó hay làm kẹt volume ở mức 0 hoặc thấp.
    // Đối với trình duyệt hiện đại, chỉ cần tương tác người dùng gọi .resume() trên context
    // hoặc phát 1 âm thanh thực sự (vd click) là đủ unlock.
    if (state === 'unloaded') {
      sound.load();
    }
  }

  private clearQueuedPlay(id: string) {
    delete this.queuedUnlockPlays[id];
    delete this.queuedMissingPlays[id];
    delete this.pendingReadyPlays[id];
  }

  play(id: string): number | undefined {
    if (!this.unlocked || this.unlocking) {
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

    // Nếu là BGM và đang phát rồi thì không phát đè lên
    if (id === 'bgm_main' && this.activeBgmId === id) {
      return;
    }

    // Đảm bảo master volume luôn ở mức 1.0
    Howler.volume(1.0);

    const config = SOUND_MAP[id];
    const targetVol = config?.volume ?? 1.0;

    // Set volume cho file gốc
    sound.volume(targetVol);

    const instanceId = sound.play();

    // Đảm bảo volume được áp dụng cho chính instance vừa tạo
    if (typeof instanceId === 'number') {
      sound.volume(targetVol, instanceId);

      // Fix cho một số trình duyệt: apply lại volume sau một tick nếu là BGM
      if (id === 'bgm_main') {
        setTimeout(() => {
          try { sound.volume(targetVol, instanceId); } catch { }
        }, 100);
      }
    }

    if (id === 'bgm_main') {
      this.activeBgmId = id;
    }
    return instanceId;
  }

  playWhenReady(id: string): void {
    if (!this.unlocked || this.unlocking) {
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
      // Khi load xong và chuẩn bị play, đảm bảo volume được set đúng config
      const config = SOUND_MAP[id];
      if (config && typeof config.volume === 'number') {
        sound.volume(config.volume);
      }
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
    if (!this.unlocked || this.unlocking) {
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

    // Đảm bảo volume luôn đúng theo config hoặc options khi play
    const config = SOUND_MAP[id];
    const targetVol = opts?.volume ?? config?.volume ?? 1.0;
    sound.volume(targetVol);

    return sound.play();
  }

  stop(id: string): void {
    this.clearQueuedPlay(id);
    const s = this.sounds[id];
    if (!s) return;
    s.stop();
  }

  stopSound(id: string): void {
    this.clearQueuedPlay(id);
    const s = this.sounds[id];
    if (s) s.stop();
  }

  stopAll(): void {
    this.queuedUnlockPlays = {};
    this.queuedMissingPlays = {};
    this.pendingReadyPlays = {};
    this.activeBgmId = null;

    // Ngắt toàn bộ âm thanh
    Howler.stop();

    // Reload lại master volume
    Howler.volume(1.0);

    // Đảm bảo trạng thái âm lượng của từng sound được reset
    Object.keys(this.sounds).forEach(id => {
      const sound = this.sounds[id];
      const config = SOUND_MAP[id];
      if (sound) {
        sound.stop();
        if (config && typeof config.volume === 'number') {
          sound.volume(config.volume);
        }
      }
    });
  }

  // Phương thức tập trung để bật BGM, tránh lặp lại
  startBgm(id: string = 'bgm_main'): void {
    if (this.activeBgmId === id) return;
    this.playWhenReady(id);
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
