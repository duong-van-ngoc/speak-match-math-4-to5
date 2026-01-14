    import Phaser from 'phaser';
    import { gameConfig } from './game/config';
    import { initRotateOrientation } from './rotateOrientation';
    import AudioManager from './audio/AudioManager'; // ✅ nếu path khác thì sửa lại
    import { game as irukaGame } from "@iruka-edu/mini-game-sdk";
// --- SDK tích hợp GameHub ---
function applyResize(width: number, height: number) {
    const gameDiv = document.getElementById('game-container');
    if (gameDiv) {
        gameDiv.style.width = `${width}px`;
        gameDiv.style.height = `${height}px`;
    }
    window.game?.scale?.resize(width, height);
}

function broadcastSetState(payload: any) {
    const scene = window.game?.scene?.getScenes(true)[0] as any;
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
        window.game?.scene?.resume("LessonScene");
        window.game?.scene?.resume("EndGameScene");
    },
    onPause() {
        window.game?.scene?.pause("LessonScene");
    },
    onResume() {
        window.game?.scene?.resume("LessonScene");
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

    declare global {
    interface Window {
        lessonScene?: any;
        hintScene?: any;

        __currentLesson?: any;
        __currentLessonId?: string;
        __lessonPool?: string[];

        game?: Phaser.Game;

        // ✅ reset queue + locks
        __resetInProgress?: boolean;
        __resetQueue?: number;
        __requestReset?: () => void;

        __preloadRunning?: boolean;

        // ✅ Phaser BGM reference (LessonScene.ensureBgm set vào window.phaserBgm)
        phaserBgm?: Phaser.Sound.BaseSound | null;
    }
    }

    function startGame() {
    const game = new Phaser.Game(gameConfig);
    window.game = game;

    setTimeout(() => {
        if (!window.game) return;
        initRotateOrientation(window.game, {
        mainSceneKey: 'LessonSelectScene',
        overlaySceneKey: null,
        });
    }, 100);

    resizeGame();
    updateUIButtonScale();
    }

    // Chờ load font 'Baloo 2' trước khi khởi tạo game để tránh FOIT/FOUT
    if (document.fonts && document.fonts.load) {
    document.fonts.load('700 32px "Baloo 2"').then(() => startGame());
    } else {
    startGame();
    }

    function resizeGame() {
    const gameDiv = document.getElementById('game-container');
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (gameDiv) {
        gameDiv.style.transform = '';
        gameDiv.style.width = `${w}px`;
        gameDiv.style.height = `${h}px`;
    }
    }

    window.addEventListener('resize', () => {
    resizeGame();
    updateUIButtonScale();
    });
    window.addEventListener('orientationchange', () => {
    resizeGame();
    updateUIButtonScale();
    });

    function updateUIButtonScale() {
    const container = document.getElementById('game-container');
    const resetBtn = document.getElementById('btn-reset') as HTMLImageElement | null;

    if (!container || !resetBtn) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const scale = Math.min(w, h) / 720;
    const baseSize = 80;
    const newSize = baseSize * scale;

    resetBtn.style.width = `${newSize}px`;
    resetBtn.style.height = 'auto';
    }

    export function showGameButtons() {
    const reset = document.getElementById('btn-reset');
    if (!reset) return;
    reset.style.display = 'block';
    updateUIButtonScale();
    }

    export function hideGameButtons() {
    const reset = document.getElementById('btn-reset');
    if (!reset) return;
    reset.style.display = 'none';
    }

    // ✅ stop BGM của Phaser (AudioManager không stop được cái này)
    function stopPhaserBgm() {
    const bgm = window.phaserBgm;
    if (!bgm) return;

    try { bgm.stop(); } catch {}
    try { bgm.destroy(); } catch {}

    window.phaserBgm = null;
    }

    // ✅ reset core
    function doReset() {
    const game = window.game;
    if (!game) return;

    window.__resetInProgress = true;

    // ✅ stop tất cả âm (Howler)
    try { AudioManager.stopAll?.(); } catch {}
    try { AudioManager.stopAllExceptBgm?.(); } catch {}

    // ✅ stop BGM Phaser
    stopPhaserBgm();

    const sm = game.scene;

    // stop các scene gameplay có thể đang mở
    const scenesToStop = ['HintScene', 'SummaryScene', 'LessonScene', 'PreloadScene'];
    for (const key of scenesToStop) {
        const s = sm.getScene(key) as Phaser.Scene | null;
        if (s && s.scene?.isActive()) sm.stop(key);
    }

    // ✅ về preload (PreloadScene tự random lessonId + load)
    sm.start('PreloadScene');
    }

    // ✅ spam vẫn chạy: nếu đang reset hoặc đang preload -> xếp hàng
    function requestReset() {
    // đang chạy preload/load asset => đợi
    if (window.__preloadRunning) {
        window.__resetQueue = (window.__resetQueue ?? 0) + 1;
        return;
    }

    // đang reset => xếp hàng
    if (window.__resetInProgress) {
        window.__resetQueue = (window.__resetQueue ?? 0) + 1;
        return;
    }

    doReset();
    }

    window.__requestReset = requestReset;

    // ✅ click handler
    document.getElementById('btn-reset')?.addEventListener('click', () => {
    requestReset();
    });
