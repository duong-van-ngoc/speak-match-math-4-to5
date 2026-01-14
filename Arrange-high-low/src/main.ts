import Phaser from "phaser";
import { game as irukaGame } from "@iruka-edu/mini-game-sdk";
import GameScene from "./GameScene";
import EndGameScene from "./EndGameScene";
import AudioManager from "./AudioManager";
import { initRotateOrientation } from "./rotateOrientation";
import PreloadScene from "./PreloadScene";

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
const INTRO_VIEWPORT_BGS = ["assets/bg/bg1.jpg", "assets/bg/bg2.jpg"];
const GAME_VIEWPORT_BGS = ["assets/bg/bg1.jpg", "assets/bg/bg2.jpg"];
const END_VIEWPORT_BGS = ["assets/bg/bg1.jpg", "assets/bg/bg2.jpg"];

// Cho phép chỉnh vị trí BG (center / top...)
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

  // Landscape: ưu tiên giữ phần trên (title), cắt nhiều phía dưới
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
function setGameButtonsVisible(visible: boolean) {
  const replayBtn = document.getElementById("btn-replay") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("btn-next") as HTMLButtonElement | null;

  const display = visible ? "block" : "none";
  if (replayBtn) replayBtn.style.display = display;

  // ✅ Next bị remove khỏi DOM, nhưng giữ câu lệnh này để "giữ nguyên logic"
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
let gamePhaser: Phaser.Game | null = null;
// ================== SDK GAMEHUB ==================
function applyResize(width: number, height: number) {
    const gameDiv = document.getElementById('game-container');
    if (gameDiv) {
        gameDiv.style.width = `${width}px`;
        gameDiv.style.height = `${height}px`;
    }
    // Phaser Scale FIT: gọi resize để canvas update
    gamePhaser?.scale.resize(width, height);
}

function broadcastSetState(payload: any) {
    // chuyển xuống scene đang chạy để bạn route helper (audio/score/timer/result...)
    const scene = gamePhaser?.scene.getScenes(true)[0] as any;
    scene?.applyHubState?.(payload);
}

function getHubOrigin(): string {
  const qs = new URLSearchParams(window.location.search);
  const o = qs.get("hubOrigin");
  if (o) return o;
  try {
    const ref = document.referrer;
    if (ref) return new URL(ref).origin;
  } catch {}
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
    gamePhaser?.scene.resume("GameScene");
    gamePhaser?.scene.resume("EndGameScene");
  },
  onPause() {
    gamePhaser?.scene.pause("GameScene");
  },
  onResume() {
    gamePhaser?.scene.resume("GameScene");
  },
  onResize(size) {
    applyResize(size.width, size.height);
  },
  onSetState(state) {
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

// ========== GLOBAL BGM (CHẠY XUYÊN SUỐT GAME) ==========
export function ensureBgmStarted() {
  console.log("[BGM] ensure play bgm_main");
  // Chỉ bật nếu chưa phát; để BGM chạy liên tục xuyên suốt các màn
  if (!AudioManager.isPlaying("bgm_main")) {
    AudioManager.play("bgm_main");
  }
}

// Cho các Scene gọi qua window
Object.assign(window as any, {
  setRandomIntroViewportBg,
  setRandomGameViewportBg,
  setRandomEndViewportBg,
  setGameButtonsVisible,
});

// ================== CẤU HÌNH PHASER ==================
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720, // 16:9
  parent: containerId,
  transparent: true, // Canvas trong suốt để nhìn thấy background của body
  scale: {
    mode: Phaser.Scale.FIT, // Điều chỉnh tự động phù hợp với màn hình
    autoCenter: Phaser.Scale.CENTER_BOTH, // Căn giữa game
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [PreloadScene, GameScene, EndGameScene], // Các scene trong game
};

// ✅ helper: cố gắng lấy số lượng level an toàn
function getTotalLevels(scene: any): number {
  const n =
    scene?.totalLevels ??
    scene?.TOTAL_LEVELS ??
    (Array.isArray(scene?.levels) ? scene.levels.length : undefined) ??
    (Array.isArray(scene?.levelConfigs) ? scene.levelConfigs.length : undefined) ??
    (typeof scene?.getLevelCount === "function" ? scene.getLevelCount() : undefined);

  return Number.isFinite(n) && n > 0 ? n : 5;
}

// ================== KẾT NỐI NÚT HTML (ngoài Phaser) ==================
function setupHtmlButtons() {
  const replayBtn = document.getElementById("btn-replay");
  if (replayBtn) {
    replayBtn.addEventListener("click", () => {
      if (!gamePhaser) return;

      // Dừng toàn bộ âm thanh trước khi chơi lại để tránh lồng nhau
      AudioManager.stopAll();

      const gs = gamePhaser.scene.getScene("GameScene") as GameScene | null;

      const total = getTotalLevels(gs);
      const startIndex = Phaser.Math.Between(0, Math.max(0, total - 1));

      const data = {
        // ✅ replay: random vào 1 màn bất kì nhưng vẫn phải chơi đủ toàn bộ màn
        levelIndex: 0,
        score: 0,
        keepLevels: true,
        startIndex,
      };

      // ✅ “ở đâu cũng replay được”: đang ở GameScene thì restart, còn lại thì start GameScene
      if (gs && gamePhaser.scene.isActive("GameScene")) {
        gs.scene.restart(data);
      } else {
        // nếu đang ở EndGameScene thì stop để khỏi chồng scene
        if (gamePhaser.scene.isActive("EndGameScene")) gamePhaser.scene.stop("EndGameScene");
        gamePhaser.scene.start("GameScene", data);
      }

      ensureBgmStarted();
    });
  }

  // ✅ BỎ HẲN NÚT NEXT: remove khỏi DOM luôn
  const nextBtn = document.getElementById("btn-next");
  if (nextBtn) nextBtn.remove();

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
    await waitForFredoka(); // Chờ font Fredoka
  } catch (e) {
    console.warn("Không load kịp font Fredoka, chạy game luôn.");
  }

  try {
    await AudioManager.loadAll(); // Chờ tải tất cả âm thanh
  } catch (e) {
    console.warn("Không load được audio, chạy game luôn.", e);
  }

  if (!gamePhaser) {
    gamePhaser = new Phaser.Game(config);
    initRotateOrientation(gamePhaser); // Khởi tạo xoay màn hình cho game nếu cần
    setupHtmlButtons(); // Cài đặt các nút HTML
  }

  // Cài đặt canvas để đảm bảo game luôn hiển thị chính xác
  setTimeout(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#game-container canvas");
    if (canvas) {
      canvas.style.margin = "0";
      canvas.style.padding = "0";
      canvas.style.display = "block";
      canvas.style.imageRendering = "auto";
      canvas.style.backgroundColor = "transparent"; // Đảm bảo canvas không bị che khuất
    }
  }, 50);
}

document.addEventListener("DOMContentLoaded", initGame);
