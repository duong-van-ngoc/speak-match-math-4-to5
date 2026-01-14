export type TtsSpeakOptions = {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
};

type ProxyRequest = {
  text: string;
  voice?: string;
  lang?: string;
  rate?: number;
};

/**
 * Unified TTS helper:
 * - If `VITE_TTS_PROXY_URL` is set, fetches an audio blob from that endpoint (recommended for Vbee).
 * - Otherwise falls back to WebSpeech `speechSynthesis`.
 *
 * The proxy is expected to return `audio/*` (e.g. `audio/mpeg`) as the response body.
 */
class TtsEngine {
  private audio?: HTMLAudioElement;
  private currentObjectUrl?: string;
  private utter?: SpeechSynthesisUtterance;

  private async getWebSpeechVoice(lang: string): Promise<SpeechSynthesisVoice | undefined> {
    if (!('speechSynthesis' in window)) return undefined;

    const preferred = ((import.meta as any).env?.VITE_WEB_SPEECH_VOICE as string | undefined)?.trim();
    const wantLang = (lang || 'vi-VN').toLowerCase();

    const readVoices = () => {
      try {
        return window.speechSynthesis.getVoices() || [];
      } catch {
        return [];
      }
    };

    // Some browsers populate voices asynchronously.
    let voices = readVoices();
    if (!voices.length) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        try {
          window.speechSynthesis.onvoiceschanged = () => finish();
        } catch {}

        setTimeout(() => finish(), 300);
      });
      voices = readVoices();
    }

    const matchByName = (v: SpeechSynthesisVoice, needle: string) =>
      v.name?.toLowerCase().includes(needle.toLowerCase());

    // 1) Exact/preferred name hint (if installed on the system).
    if (preferred) {
      const byPref =
        voices.find((v) => v.name === preferred) || voices.find((v) => matchByName(v, preferred));
      if (byPref) return byPref;
    }

    // 2) Vietnamese voices first.
    const vi = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('vi'));
    const viExact = vi.find((v) => (v.lang || '').toLowerCase() === wantLang);

    // Heuristic: pick a likely female voice if the name hints it (not standardized).
    const femaleHints = [/female/i, /\bnu\b/i, /woman/i, /girl/i];
    const pickFemale = (list: SpeechSynthesisVoice[]) =>
      list.find((v) => femaleHints.some((r) => r.test(v.name || '')));

    return pickFemale(vi) || viExact || vi[0] || voices.find((v) => (v.lang || '').toLowerCase() === wantLang);
  }

  stop() {
    try {
      this.audio?.pause();
    } catch {}
    this.audio = undefined;

    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch {}
      this.currentObjectUrl = undefined;
    }

    if (this.utter) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      this.utter = undefined;
    }
  }

  async speak(text: string, opts?: TtsSpeakOptions) {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return;

    this.stop();

    const proxyUrl = (import.meta as any).env?.VITE_TTS_PROXY_URL as string | undefined;
    if (proxyUrl) {
      const voice = ((import.meta as any).env?.VITE_TTS_VOICE as string | undefined) ?? undefined;
      const lang = opts?.lang ?? ((import.meta as any).env?.VITE_TTS_LANG as string | undefined) ?? 'vi-VN';

      const body: ProxyRequest = {
        text: trimmed,
        voice,
        lang,
        rate: opts?.rate,
      };

      try {
        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`TTS proxy failed: ${res.status}`);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        this.currentObjectUrl = objectUrl;

        const audio = new Audio(objectUrl);
        audio.volume = Math.max(0, Math.min(1, opts?.volume ?? 1));
        this.audio = audio;

        try {
          await audio.play();
          return;
        } catch {
          // If autoplay is blocked, fall through to WebSpeech.
          this.stop();
        }
      } catch {
        // Network/proxy not available -> fall back.
        this.stop();
      }
    }

    if ('speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(trimmed);
        const lang = opts?.lang ?? 'vi-VN';
        u.lang = lang;
        u.rate = opts?.rate ?? 1;
        u.pitch = opts?.pitch ?? 1;
        u.volume = opts?.volume ?? 1;
        try {
          const v = await this.getWebSpeechVoice(lang);
          if (v) u.voice = v;
        } catch {}
        this.utter = u;
        window.speechSynthesis.speak(u);
      } catch {}
    }
  }
}

export const ttsEngine = new TtsEngine();
