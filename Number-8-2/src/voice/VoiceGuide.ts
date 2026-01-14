import AudioManager from '../audio/AudioManager';

    type VoiceGuideOpts = {
    enabled: boolean;
    rate?: number;
    pitch?: number;
    volume?: number;
    };

export class VoiceGuide {
  private opts: VoiceGuideOpts;
  private currentAudioId?: string;

    constructor(opts: VoiceGuideOpts) {
        this.opts = { rate: 1, pitch: 1, volume: 1, ...opts };
    }

    stop() {
        if (this.currentAudioId) {
        try {
            AudioManager.stop(this.currentAudioId);
        } catch {}
        }
        this.currentAudioId = undefined;
    }

  speak(text: string, audioKey?: string) {
    if (!this.opts.enabled) return;
    if (!text?.trim()) return;

    // Audio-only: no TTS fallback.
    if (!audioKey || !AudioManager.has(audioKey)) return;
    this.currentAudioId = audioKey;
    AudioManager.playVoiceInterrupt?.(audioKey);
  }
}
