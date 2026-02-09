import Phaser from "phaser";
import { game as irukaGame } from "@iruka-edu/mini-game-sdk";
import AudioManager from "./AudioManager";

const AUDIO_UNLOCKED_KEY = "__audioUnlocked__";
const AUDIO_UNLOCKED_EVENT = "audio-unlocked";
let audioUnlockListenersAttached = false;

// Shared game instance reference
let _gameInstance: Phaser.Game | null = null;

export function setGameInstance(game: Phaser.Game) {
    _gameInstance = game;
}

export function getGameInstance(): Phaser.Game | null {
    return _gameInstance;
}

export function markAudioUnlocked() {
    const win = window as unknown as Record<string, unknown>;
    if (win[AUDIO_UNLOCKED_KEY]) return;
    win[AUDIO_UNLOCKED_KEY] = true;
    window.dispatchEvent(new Event(AUDIO_UNLOCKED_EVENT));
}

export function ensureBgmStarted() {
    console.log("[BGM] ensure play bgm_main");
    try {
        markAudioUnlocked();
    } catch { }

    try {
        void AudioManager.unlockAndWarmup?.();
    } catch { }

    try {
        const startBgm = () => {
            if (!AudioManager.isPlaying("bgm_main")) AudioManager.playWhenReady?.("bgm_main");
        };

        if ((window as any).__rotateOverlayActive__ && AudioManager.isPlaying("voice_rotate")) {
            let started = false;
            const safeStart = () => {
                if (started) return;
                started = true;
                startBgm();
            };
            AudioManager.onceEnded?.("voice_rotate", safeStart);
            setTimeout(safeStart, 4000);
        } else {
            startBgm();
        }
    } catch { }
}

export function unlockAudioFromUserGesture() {
    ensureBgmStarted();
}

export function setupGlobalAudioUnlock() {
    const win = window as unknown as Record<string, unknown>;
    if (audioUnlockListenersAttached) return;
    if (win[AUDIO_UNLOCKED_KEY]) return;
    audioUnlockListenersAttached = true;

    const handler = () => unlockAudioFromUserGesture();
    (["pointerdown", "touchstart", "mousedown", "keydown"] as const).forEach((ev) => {
        document.addEventListener(ev, handler, { once: true, capture: true } as AddEventListenerOptions);
    });
}

function applyResize(width: number, height: number) {
    const gameDiv = document.getElementById('game-container');
    if (gameDiv) {
        gameDiv.style.width = `${width}px`;
        gameDiv.style.height = `${height}px`;
    }
    _gameInstance?.scale.resize(width, height);
}

function broadcastSetState(payload: any) {
    const scene = _gameInstance?.scene.getScenes(true)[0] as any;
    scene?.applyHubState?.(payload);
}

function getHubOrigin(): string {
    const qs = new URLSearchParams(window.location.search);
    const o = qs.get("hubOrigin");
    if (o) return o;
    try {
        const ref = document.referrer;
        if (ref) return new URL(ref).origin;
    } catch { }
    return "*";
}

export const sdk = irukaGame.createGameSdk({
    hubOrigin: getHubOrigin(),
    onInit() {
        sdk.ready({
            capabilities: ["resize", "score", "complete", "save_load", "set_state"],
        });
    },
    onStart() {
        // Resume all scenes or specific ones
        // Since we don't know exactly which scene implies "GameScene" here without main.ts context,
        // we can try to resume common scenes or check active ones.
        // But main.ts hardcoded "GameScene".
        // Let's iterate or just resume common ones.
        _gameInstance?.scene.resume("GameScene");
        _gameInstance?.scene.resume("GameSceneBalloon");
        _gameInstance?.scene.resume("GameSceneBoat");
        _gameInstance?.scene.resume("EndGameScene");
    },
    onPause() {
        _gameInstance?.scene.pause("GameScene");
        _gameInstance?.scene.pause("GameSceneBalloon");
        _gameInstance?.scene.pause("GameSceneBoat");
    },
    onResume() {
        _gameInstance?.scene.resume("GameScene");
        _gameInstance?.scene.resume("GameSceneBalloon");
        _gameInstance?.scene.resume("GameSceneBoat");
    },
    onResize(size: any) {
        applyResize(size.width, size.height);
    },
    onSetState(state: any) {
        broadcastSetState(state);
    },
    onQuit() {
        irukaGame.finalizeAttempt("quit");
        sdk.complete({
            timeMs: Date.now() - ((window as any).irukaGameState?.startTime ?? Date.now()),
            extras: { reason: "hub_quit", stats: irukaGame.prepareSubmitData() },
        });
    },
});
