import Phaser from "phaser";
import { GameSceneBalloon } from "./scenes/GameSceneBalloon";
import { CountConnectScene } from "./scenes/CountConnectScene";
import { ColorSceneBalloon } from "./scenes/ColorSceneBalloon";
import EndGameScene from "./scenes/EndGameScene";
import AudioManager from "./AudioManager";
import { initRotateOrientation } from "./rotateOrientation";
import PreloadScene from "./PreloadScene";
import {
    setGameInstance,
    ensureBgmStarted,
    markAudioUnlocked,
    unlockAudioFromUserGesture,
    setupGlobalAudioUnlock,
    sdk // Re-export sdk if needed or just initialize it via setGameInstance
} from "./gameContext";

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

const GAME_VIEWPORT_BGS = [
    "assets/bg/bg1.jpg",
];

function setViewportBg(url: string, position: string = "center center") {
    document.body.style.backgroundImage = `url("${url}")`;
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = position;
    document.body.style.boxSizing = "border-box";
}

// Override setRandomGameViewportBg implementation if needed locally or use imported one
// Wait, gameContext doesn't have GAME_VIEWPORT_BGS array because it's local asset path dependent? 
// Actually, gameContext doesn't import implementation details of viewport implementation from logical game context.
// Let's keep local implementation of setRandomGameViewportBg in mainBalloon.ts but export it for window if needed.
// But wait, gameContext didn't export setRandomGameViewportBg.
// The user's mainBalloon.ts had setRandomGameViewportBg exported and assigned to window.

// Let's redefine it here as it was.
function setRandomGameViewportBgLocal() {
    const url =
        GAME_VIEWPORT_BGS[Math.floor(Math.random() * GAME_VIEWPORT_BGS.length)];
    setViewportBg(url, "center center");
}

function setGameButtonsVisible(visible: boolean) {
    const replayBtn = document.getElementById("btn-replay") as HTMLButtonElement | null;
    const nextBtn = document.getElementById("btn-next") as HTMLButtonElement | null;
    const display = visible ? "block" : "none";
    if (replayBtn) replayBtn.style.display = display;
    if (nextBtn) nextBtn.style.display = "none";
}

if (container instanceof HTMLDivElement) {
    container.style.position = "absolute";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.display = "block";
    container.style.overflow = "hidden";
    container.style.boxSizing = "border-box";
    container.style.background = "transparent";
}

let game: Phaser.Game | null = null;

(Object.assign(window as any, {
    setRandomGameViewportBg: setRandomGameViewportBgLocal,
    setGameButtonsVisible,
    ensureBgmStarted,
}));

const RENDER_RESOLUTION = Math.min(3, window.devicePixelRatio || 1);

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1920,
    height: 1080,
    parent: containerId,
    transparent: true,
    backgroundColor: "rgba(0,0,0,0)",
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
        pixelArt: false,
        antialias: true,
        roundPixels: true,
    },
    scene: [PreloadScene, GameSceneBalloon, CountConnectScene, ColorSceneBalloon, EndGameScene],
};

(config as any).resolution = RENDER_RESOLUTION;
(config as any).render = (config as any).render ?? {};
(config as any).render.antialiasGL = true;

function setupHtmlButtons() {
    const replayBtn = document.getElementById("btn-replay");
    if (replayBtn) {
        replayBtn.addEventListener("click", () => {
            if (!game) return;
            unlockAudioFromUserGesture();
            AudioManager.stopAll();
            const scene = game.scene.getScene("GameSceneBalloon") as GameSceneBalloon | null;
            if (!scene) return;
            scene.scene.restart();
            ensureBgmStarted();
        });
    }
    const nextBtn = document.getElementById("btn-next") as HTMLButtonElement | null;
    if (nextBtn) {
        nextBtn.style.display = "none";
    }
    setGameButtonsVisible(false);
}

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

    try {
        // We can just call ensureBgmStarted if needed, but logic inside checks gestures.
        // Or if previously unlocked:
        markAudioUnlocked(); // Use imported version check if needed but markAudioUnlocked checks internally.
        // Or cleaner:
        // const win = window as unknown as Record<string, unknown>;
        // if (win["__audioUnlocked__"]) ensureBgmStarted();
        // Since we imported ensureBgmStarted, we can just use it if logic matches.
        // But main.ts logic: if(win[KEY]) ensureBgmStarted().
        ensureBgmStarted();
    } catch { }

    setRandomGameViewportBgLocal();

    if (!game) {
        game = new Phaser.Game(config);
        setGameInstance(game); // Important: set global game instance for SDK
        initRotateOrientation(game);
        setupHtmlButtons();

        game.events.on('FLOW_GO_END', (data: any) => {
            setGameButtonsVisible(false);
            if (game) {
                game.scene.stop('CountConnectScene');
                game.scene.stop('GameSceneBalloon');
                game.scene.stop('ColorSceneBalloon');
                game.scene.start('EndGameScene', data);
            }
        });
    }

    // Let Phaser handle canvas positioning via CENTER_BOTH
    setTimeout(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("#game-container canvas");
        if (canvas) {
            canvas.style.display = "block";
            canvas.style.padding = "0";
            canvas.style.imageRendering = "auto";
            canvas.style.backgroundColor = "transparent";
        }
    }, 50);
}

export { sdk }; // Re-export SDK so other modules can use it if they import mainBalloon (though they should use gameContext)

document.addEventListener("DOMContentLoaded", initGame);

