import Phaser from "phaser";
//import OverlayScene from "./OverlayScene";
import GameScene from "./scene/GameScene";
import EndGameScene from "./scene/EndGameScene";
import AudioManager from "./audio/AudioManager";
import { initRotateOrientation } from "./rotateOrientation";
import PreloadScene from "./scene/PreloadScene";
import { buildReplayStartData, getReplayMode } from "./config/replayMode";

const AUDIO_UNLOCKED_KEY = "__audioUnlocked__";
const AUDIO_UNLOCKED_EVENT = "audio-unlocked";

function markAudioUnlocked() {
  const win = window as unknown as Record<string, unknown>;
  if (win[AUDIO_UNLOCKED_KEY]) return;
  win[AUDIO_UNLOCKED_KEY] = true;
  window.dispatchEvent(new Event(AUDIO_UNLOCKED_EVENT));
}

function unlockAudioFromUserGesture() {
  try {
    markAudioUnlocked();
  } catch {}

  (async () => {
    try {
      await AudioManager.unlockAndWarmup?.();
    } catch {}

    try {
      if (!AudioManager.isPlaying("bgm_main")) AudioManager.playWhenReady?.("bgm_main");
    } catch {}
  })();
}

function setupGlobalAudioUnlock() {
  const win = window as unknown as Record<string, unknown>;
  if (win[AUDIO_UNLOCKED_KEY]) return;

  const handler = () => unlockAudioFromUserGesture();
  (["pointerdown", "touchstart", "mousedown", "keydown"] as const).forEach((ev) => {
    document.addEventListener(ev, handler, { once: true, capture: true } as AddEventListenerOptions);
  });
}


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
  // Chỉ bật nếu chưa phát; để BGM chạy liên tục xuyên suốt các màn
  if (!AudioManager.isPlaying("bgm_main")) AudioManager.playWhenReady?.("bgm_main");
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
}));

// ================== CẤU HÌNH PHASER ==================
// Increase internal canvas resolution on HiDPI to reduce blur when the canvas is scaled.
const CANVAS_ZOOM = Math.min(window.devicePixelRatio || 1, 2);
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720, // 16:9
  zoom: CANVAS_ZOOM,
  parent: containerId,
  transparent: true, // Canvas trong suốt để nhìn thấy background của body
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  // Chạy PreloadScene trước để load toàn bộ asset, rồi mới vào GameScene
  scene: [PreloadScene, GameScene, EndGameScene],
};

// ================== KẾT NỐI NÚT HTML (ngoài Phaser) ==================
function setupHtmlButtons() {
  const replayBtn = document.getElementById("btn-replay");
  if (replayBtn) {
    replayBtn.addEventListener("click", () => {
      if (!game) return;

      // Unlock audio ngay trên thao tác click DOM.
      unlockAudioFromUserGesture();

      // Dừng toàn bộ âm thanh trước khi chơi lại để tránh lồng nhau
      AudioManager.stopAll();

      // Replay modes:
      // - strict: always restart from stage 1
      // - debug: randomize level start to test quickly
      const stopSafe = (key: string) => {
        try {
          if (game?.scene?.isActive(key) || game?.scene?.isSleeping(key) || game?.scene?.isPaused(key)) {
            game?.scene?.stop(key);
          }
        } catch {}
      };

      const gs = ((): GameScene | null => {
        try {
          return game.scene.getScene("GameScene") as GameScene;
        } catch {
          return null;
        }
      })();
      const mode = getReplayMode();
      const data = buildReplayStartData({ mode, gameScene: gs });

      // Stop all running scenes first (prevents stuck/paused coordinator or lingering listeners).
      stopSafe("EndGameScene");
      stopSafe("CountAndPaintScene");
      stopSafe("GameScene");

      game.scene.start("GameScene", data);
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
  setupGlobalAudioUnlock();

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

document.addEventListener("DOMContentLoaded", initGame);
