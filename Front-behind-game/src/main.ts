import Phaser from "phaser";
//import OverlayScene from "./OverlayScene";
import { GameScene } from "./scenes/GameScene";
import { CountConnectScene } from "./scenes/CountConnectScene";
import { ColorScene } from "./scenes/ColorScene";
import EndGameScene from "./scenes/EndGameScene";
import AudioManager from "./AudioManager";
import { initRotateOrientation } from "./rotateOrientation";
import PreloadScene from "./PreloadScene";

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

  const handler = () => {
    if ((window as any).__audioUnlocked__) return;
    markAudioUnlocked();
    unlockAudioFromUserGesture();
  };
  (["pointerdown", "touchstart", "mousedown", "keydown"] as const).forEach((ev) => {
    document.addEventListener(ev, handler, { once: true, capture: false } as AddEventListenerOptions);
  });
}

// Attach as early as possible so a fast "first click" during loading still unlocks audio.
setupGlobalAudioUnlock();


// ================== TẠO CONTAINER GAME ==================
const containerId = "game-container";
let container = document.getElementById(containerId);
if (!container) {
  container = document.createElement("div");
  container.id = containerId;
  document.body.appendChild(container);
}

// ================== CSS CHO HTML & BODY ==================
const root = document.documentElement;

root.style.margin = "0";
root.style.padding = "0";
root.style.width = "100%";
root.style.height = "100%";

document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.width = "100%";
document.body.style.height = "100%";

// ========== RANDOM BACKGROUND VIEWPORT ==========
const INTRO_VIEWPORT_BGS = [
  "assets/bg/bg1.jpg",
];

const GAME_VIEWPORT_BGS = [
  "assets/bg/bg1.jpg",
];

const END_VIEWPORT_BGS = [
  "assets/bg/bg1.jpg",
];

// Cho phép chỉnh vị trí BG (center / top...)
function setViewportBg(url: string, position: string = "center center") {
  document.body.style.backgroundImage = `url("${url}")`;
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = position;
  document.body.style.boxSizing = "border-box";
}

export function setRandomIntroViewportBg() {
  const url =
    INTRO_VIEWPORT_BGS[Math.floor(Math.random() * INTRO_VIEWPORT_BGS.length)];

  const isLandscape = window.innerWidth > window.innerHeight;

  // Landscape: ưu tiên giữ phần trên (title), cắt nhiều phía dưới
  if (isLandscape) {
    setViewportBg(url, "center top");
  } else {
    setViewportBg(url, "center center");
  }
}

export function setRandomGameViewportBg() {
  const url =
    GAME_VIEWPORT_BGS[Math.floor(Math.random() * GAME_VIEWPORT_BGS.length)];
  setViewportBg(url, "center center");
}

export function setRandomEndViewportBg() {
  const url =
    END_VIEWPORT_BGS[Math.floor(Math.random() * END_VIEWPORT_BGS.length)];
  setViewportBg(url, "center center");
}

// ========== HIỆN / ẨN NÚT VIEWPORT ==========
function setGameButtonsVisible(visible: boolean) {
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

// ================== CSS CHO CONTAINER (TRONG SUỐT) ==================
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
let game: Phaser.Game | null = null;
// ========== GLOBAL BGM (CHẠY XUYÊN SUỐT GAME) ==========
// ========== GLOBAL BGM (CHẠY XUYÊN SUỐT GAME) ==========

export function ensureBgmStarted() {
  console.log("[BGM] ensure play bgm_main");
  try {
    markAudioUnlocked();
  } catch { }

  try {
    void AudioManager.unlockAndWarmup?.();
  } catch { }

  try {
    AudioManager.startBgm('bgm_main');
  } catch { }
}



// function setupGlobalBgm() {
//   const startBgm = () => {
//     ensureBgmStarted();
//   };

//   ["pointerdown", "touchstart", "mousedown"].forEach((ev) => {
//     document.addEventListener(ev, startBgm, { once: true });
//   });
// }


// Cố gắng resume AudioContext khi overlay bật/tắt
// function resumeSoundContext(scene: Phaser.Scene) {
//   const sm = scene.sound as any;
//   const ctx: AudioContext | undefined = sm.context || sm.audioContext;
//   if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
//     ctx.resume();
//   }
// }
// Cho các Scene gọi qua window
(Object.assign(window as any, {
  setRandomIntroViewportBg,
  setRandomGameViewportBg,
  setRandomEndViewportBg,
  setGameButtonsVisible,
  ensureBgmStarted,
}));

// ================== CẤU HÌNH PHASER ==================
// Increase internal canvas resolution to reduce blur (especially when Scale.FIT stretches the canvas).
// Cap to avoid heavy GPU cost on very high-DPR devices.
const RENDER_RESOLUTION = Math.min(3, window.devicePixelRatio || 1);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080, // 16:9
  parent: containerId,
  transparent: true, // Canvas trong suốt để nhìn thấy background của body
  backgroundColor: "rgba(0,0,0,0)",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
  },
  // Chạy PreloadScene trước để load toàn bộ asset, rồi mới vào GameScene
  scene: [PreloadScene, GameScene, CountConnectScene, ColorScene, EndGameScene],
};

// Phaser supports these, but the TS type in this project doesn't declare them.
(config as any).resolution = RENDER_RESOLUTION;
(config as any).render = (config as any).render ?? {};
(config as any).render.antialiasGL = true;
// ================== KẾT NỐI NÚT HTML (ngoài Phaser) ==================
function setupHtmlButtons() {
  const replayBtn = document.getElementById("btn-replay");
  if (replayBtn) {
    replayBtn.addEventListener("click", () => {
      const g = game;
      if (!g) return;
      // Dừng toàn bộ âm thanh trước khi chơi lại để tránh lồng nhau
      AudioManager.stopAll();

      // Restart lại toàn bộ flow từ PreloadScene.
      // Stop tất cả scene đang chạy để tránh "scene lơ lửng" làm mất banner/voice khi vừa vào game.
      try {
        const activeScenes = g.scene.getScenes(true);
        activeScenes.forEach((s) => g.scene.stop(s.scene.key));
      } catch { }

      g.scene.start("PreloadScene");
      // ensureBgmStarted() sẽ được gọi lại khi người dùng tương tác trong scene mới, 
      // hoặc nếu window.__audioUnlocked__ đã true thì scene sẽ tự gọi.
      ensureBgmStarted();
    });
  }

  // Ẩn hoàn toàn nút chuyển màn
  const nextBtn = document.getElementById("btn-next") as
    | HTMLButtonElement
    | null;
  if (nextBtn) {
    nextBtn.style.display = "none";
  }

  // Mặc định ẩn nút (intro, endgame)
  setGameButtonsVisible(false);
}

// ================== CHỜ FONT FREDOKA ==================
function waitForFredoka(): Promise<void> {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let done = false;

    document.fonts.load('400 20px "Fredoka"').then(() => {
      if (!done) {
        done = true;
        resolve();
      }
    });

    setTimeout(() => {
      if (!done) {
        done = true;
        resolve();
      }
    }, 10);
  });
}
// ================== KHỞI TẠO GAME ==================
async function initGame() {
  try {
    await waitForFredoka();
  } catch (e) {
    console.warn("Không load kịp font Fredoka, chạy game luôn.");
  }

  try {
    await AudioManager.loadAll();
  } catch (e) {
    console.warn("Không load được audio, chạy game luôn.", e);
  }
  // If the user already clicked/tapped while assets were loading, start BGM now.
  try {
    const win = window as unknown as Record<string, unknown>;
    if (win[AUDIO_UNLOCKED_KEY]) ensureBgmStarted();
  } catch { }

  setRandomGameViewportBg();

  // Bật nhạc nền 1 lần, loop xuyên suốt game (sau user gesture)
  // setupGlobalBgm();

  if (!game) {
    // setRandomIntroViewportBg();
    game = new Phaser.Game(config);
    initRotateOrientation(game);
    setupHtmlButtons();
  }

  setTimeout(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>("#game-container canvas");
    if (canvas) {
      canvas.style.margin = "0";
      canvas.style.padding = "0";
      canvas.style.display = "block";
      canvas.style.imageRendering = "auto";
      canvas.style.backgroundColor = "transparent";
    }
  }, 50);
}


// ========== IRUKA MINI GAME SDK INTEGRATION ==========
import { game as irukaGame } from "@iruka-edu/mini-game-sdk";

function applyResize(width: number, height: number) {
  const gameDiv = document.getElementById('game-container');
  if (gameDiv) {
    gameDiv.style.width = `${width}px`;
    gameDiv.style.height = `${height}px`;
  }
  game?.scale.resize(width, height);
}

function broadcastSetState(payload: any) {
  const scene = game?.scene.getScenes(true)[0] as any;
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
    game?.scene.resume("GameScene");
    game?.scene.resume("EndGameScene");
  },
  onPause() {
    game?.scene.pause("GameScene");
  },
  onResume() {
    game?.scene.resume("GameScene");
  },
  onResize(size: { width: number; height: number }) {
    applyResize(size.width, size.height);
  },
  onSetState(state: unknown) {
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

document.addEventListener("DOMContentLoaded", initGame);
