import Phaser from "phaser";
import GameScene from "./GameScene";
import EndGameScene from "./EndGameScene";
import AudioManager from "./AudioManager";
import { initRotateOrientation } from "./rotateOrientation";
import PreloadScene from "./PreloadScene";

import { installIrukaE2E } from "./e2e/installIrukaE2E";

const AUDIO_UNLOCKED_KEY = "__audioUnlocked__";
const AUDIO_UNLOCKED_EVENT = "audio-unlocked";
let audioUnlockListenersAttached = false;

function markAudioUnlocked() {
  const win = window as unknown as Record<string, unknown>;
  if (win[AUDIO_UNLOCKED_KEY]) return;
  win[AUDIO_UNLOCKED_KEY] = true;
  window.dispatchEvent(new Event(AUDIO_UNLOCKED_EVENT));
}

function unlockAudioFromUserGesture() {
  ensureBgmStarted();
}

function setupGlobalAudioUnlock() {
  const win = window as unknown as Record<string, unknown>;
  if (audioUnlockListenersAttached) return;
  if (win[AUDIO_UNLOCKED_KEY]) return;
  audioUnlockListenersAttached = true;

  const handler = () => unlockAudioFromUserGesture();
  (["pointerdown", "touchstart", "mousedown", "keydown"] as const).forEach((ev) => {
    document.addEventListener(ev, handler, { once: true, capture: true } as AddEventListenerOptions);
  });
}

setupGlobalAudioUnlock();

const containerId = "game-container";
let container = document.getElementById(containerId);
if (!container) {
  container = document.createElement("div");
  container.id = containerId;
  document.body.appendChild(container);
}

const root = document.documentElement;
root.style.margin = "0";
root.style.padding = "0";
root.style.width = "100%";
root.style.height = "100%";

document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.width = "100%";
document.body.style.height = "100%";

const INTRO_VIEWPORT_BGS = ["assets/bg/bg1.jpg"];
const GAME_VIEWPORT_BGS = ["assets/bg/bg1.jpg"];
const END_VIEWPORT_BGS = ["assets/bg/bg1.jpg"];

function setViewportBg(url: string, position: string = "center center") {
  document.body.style.backgroundImage = `url("${url}")`;
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = position;
  document.body.style.boxSizing = "border-box";
}

export function setRandomIntroViewportBg() {
  const url = INTRO_VIEWPORT_BGS[Math.floor(Math.random() * INTRO_VIEWPORT_BGS.length)];
  const isLandscape = window.innerWidth > window.innerHeight;
  if (isLandscape) {
    setViewportBg(url, "center top");
  } else {
    setViewportBg(url, "center center");
  }
}

export function setRandomGameViewportBg() {
  const url = GAME_VIEWPORT_BGS[Math.floor(Math.random() * GAME_VIEWPORT_BGS.length)];
  setViewportBg(url, "center center");
}

export function setRandomEndViewportBg() {
  const url = END_VIEWPORT_BGS[Math.floor(Math.random() * END_VIEWPORT_BGS.length)];
  setViewportBg(url, "center center");
}

// ========== HIỆN / ẨN NÚT VIEWPORT ==========
export function setGameButtonsVisible(visible: boolean) {
  const replayBtn = document.getElementById("btn-replay") as
    | HTMLButtonElement
    | null;
  const nextBtn = document.getElementById("btn-next") as
    | HTMLButtonElement
    | null;
  const display = visible ? "block" : "none";
  if (replayBtn) replayBtn.style.display = display;
  // Luôn ẩn nút chuyển màn
  if (nextBtn) nextBtn.style.display = "none";
}

if (container instanceof HTMLDivElement) {
  container.style.position = "fixed";
  container.style.inset = "0"; // full màn hình
  container.style.margin = "0";
  container.style.padding = "0";
  container.style.display = "flex";
  container.style.justifyContent = "center";
  container.style.alignItems = "center";
  container.style.overflow = "hidden";
  container.style.boxSizing = "border-box";
  container.style.background = "transparent";
}

// Giữ tham chiếu game để tránh tạo nhiều lần (HMR, reload…)
let gamePhaser: Phaser.Game | null = null;
// ========== GLOBAL BGM (CHẠY XUYÊN SUỐT GAME) ==========
// ========== GLOBAL BGM (CHẠY XUYÊN SUỐT GAME) ==========

export function ensureBgmStarted() {
  console.log("[BGM] ensure play bgm_main");
  try { markAudioUnlocked(); } catch { }
  try { void AudioManager.unlockAndWarmup?.(); } catch { }
  try {
    const startBgm = () => {
      if (!AudioManager.isPlaying("bgm_main")) AudioManager.playWhenReady?.("bgm_main");
    };
    if ((window as any).__rotateOverlayActive__ && AudioManager.isPlaying("voice_rotate")) {
      AudioManager.onceEnded?.("voice_rotate", startBgm);
      setTimeout(startBgm, 4000);
    } else {
      startBgm();
    }
  } catch { }
}


(Object.assign(window as any, {
  setRandomIntroViewportBg,
  setRandomGameViewportBg,
  setRandomEndViewportBg,
  setGameButtonsVisible,
  ensureBgmStarted,
  resetHubProgress,
}));

// ================== CẤU HÌNH PHASER ==================
const RENDER_RESOLUTION = Math.min(4, window.devicePixelRatio || 1);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  parent: containerId,
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: false,
  },
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
  },
  scene: [PreloadScene, GameScene, EndGameScene],
};
(config as any).resolution = RENDER_RESOLUTION;
(config as any).render = (config as any).render ?? {};
(config as any).render.antialiasGL = true;

function setupHtmlButtons() {
  const replayBtn = document.getElementById("btn-replay");
  if (replayBtn) {
    replayBtn.addEventListener("click", () => {
      if (!gamePhaser) return;
      unlockAudioFromUserGesture();
      AudioManager.stopAll();
      irukaGame.retryFromStart();
      const scene = gamePhaser.scene.getScene("GameScene") as GameScene | null;
      if (scene) scene.scene.restart({ score: 0 });
      ensureBgmStarted();
    });
  }
}

async function initGame() {
  try {
    const fonts = (document as any).fonts;
    if (fonts) await fonts.load('400 20px "Fredoka"');
    await AudioManager.loadAll();
  } catch (e) { }
  if (!gamePhaser) {
    gamePhaser = new Phaser.Game(config);
    initRotateOrientation(gamePhaser);
    setupHtmlButtons();
  }
}

import { game as irukaGame } from "@iruka-edu/mini-game-sdk";

function getHubOrigin(): string {
  const qs = new URLSearchParams(window.location.search);
  return qs.get("hubOrigin") || "*";
}

export function resetHubProgress() {
  const now = Date.now();
  (window as any).irukaGameState = { startTime: now, currentScore: 0 };
  (irukaGame as any).startTime = now;

  if (sdk) {
    sdk.score(0, 0);
    sdk.progress({ levelIndex: 0, total: 4, score: 0 });
  }
}

export const sdk = irukaGame.createGameSdk({
  hubOrigin: getHubOrigin(),
  onInit() {
    sdk.ready({ capabilities: ["resize", "score", "complete", "stats", "hint"] });
    irukaGame.setTotal(4);
    resetHubProgress();
  },
  onStart() {
    const now = Date.now();
    (irukaGame as any).startTime = now;
    if ((window as any).irukaGameState) (window as any).irukaGameState.startTime = now;

    gamePhaser?.scene.resume("GameScene");
    gamePhaser?.scene.resume("EndGameScene");
  },
  onQuit() {
    irukaGame.finalizeAttempt("quit");
    const gameData = (irukaGame as any).prepareSubmitData?.() || {};
    const trackerData = (window as any)._getMatchedTrackerData?.() || {};
    const mergedData = { ...gameData, ...trackerData };

    const timeMs = Date.now() - ((window as any).irukaGameState?.startTime ?? Date.now());
    sdk.complete({
      timeMs,
      ...mergedData,
      extras: {
        reason: "user_exit",
        stats: {
          ...mergedData,
        },
      },
    } as any);
  },
});

export { irukaGame };

(window as any).resetHubProgress = resetHubProgress;

installIrukaE2E(sdk);
document.addEventListener("DOMContentLoaded", initGame);
