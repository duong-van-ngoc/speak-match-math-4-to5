export type HubCapabilities = Array<'resize' | 'score' | 'complete' | 'save_load' | 'set_state'>;

export type HubReadyPayload = {
  capabilities?: HubCapabilities;
};

export type HubCompletePayload = {
  timeMs?: number;
  extras?: unknown;
};

export type HubScorePayload = {
  levelIndex?: number;
  total?: number;
};

export type CreateGameSdkOptions = {
  hubOrigin?: string;
  onInit?: (ctx: unknown) => void;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onResize?: (size: { width: number; height: number }) => void;
  onSetState?: (state: unknown) => void;
  onQuit?: () => void;
};

export type GameSdk = {
  ready: (payload: HubReadyPayload) => void;
  complete: (payload: HubCompletePayload) => void;
  score: (score: number, delta?: number) => void;
  progress: (payload: HubScorePayload) => void;
};

type HubGame = {
  createGameSdk: (opts: CreateGameSdkOptions) => GameSdk;
  setTotal: (total: number) => void;
  finalizeAttempt: (reason?: string) => void;
  retryFromStart: () => void;
  prepareSubmitData: () => unknown;
};

const state = {
  total: 0,
  attempts: 0,
  lastFinalizeReason: '' as string | undefined,
};

function safePostToParent(message: unknown, targetOrigin: string) {
  try {
    if (typeof window === 'undefined') return;
    window.parent?.postMessage?.(message, targetOrigin);
  } catch {}
}

export const game: HubGame = {
  createGameSdk(opts) {
    const origin = String(opts?.hubOrigin ?? '*');

    const sdk: GameSdk = {
      ready(payload) {
        safePostToParent({ type: 'iruka:sdk:ready', payload }, origin);
      },
      complete(payload) {
        safePostToParent({ type: 'iruka:sdk:complete', payload }, origin);
      },
      score(score, delta) {
        safePostToParent({ type: 'iruka:sdk:score', payload: { score, delta } }, origin);
      },
      progress(payload) {
        safePostToParent({ type: 'iruka:sdk:progress', payload }, origin);
      },
    };

    // IMPORTANT: call callbacks asynchronously so callers can safely reference `sdk`
    // inside `onInit` (common pattern in existing code).
    try {
      setTimeout(() => {
        try {
          opts?.onInit?.({});
        } catch {}
      }, 0);
    } catch {
      // Fallback if timers are unavailable.
      try {
        opts?.onInit?.({});
      } catch {}
    }

    return sdk;
  },

  setTotal(total: number) {
    state.total = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  },

  finalizeAttempt(reason?: string) {
    state.attempts += 1;
    state.lastFinalizeReason = reason;
  },

  retryFromStart() {
    state.attempts += 1;
  },

  prepareSubmitData() {
    return { ...state };
  },
};

