import Phaser from 'phaser';
import { BootScene, PreloadScene, EndGameScene } from './scenes';
import VehicleScene from './scenes/speak/VehicleScene';
import { initRotateOrientation } from './utils/rotateOrientation';
import AudioManager from './audio/AudioManager';
import { SceneKeys } from './consts/Keys';
import { game as gameSDK } from '@iruka-edu/mini-game-sdk';

declare global {
    interface Window {
        gameScene: any;
        irukaHost: any;
        irukaGameState: any;
    }
}

// --- CẤU HÌNH GAME ---
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1920,
    height: 1080,
    parent: 'game-container',
    scene: [BootScene, PreloadScene, VehicleScene, EndGameScene],
    backgroundColor: '#ffffff',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    render: {
        transparent: true,
    },
};

const gamePhaser = new Phaser.Game(config);

// ========================================
// SDK INTEGRATION
// ========================================

function applyResize(width: number, height: number) {
    const gameDiv = document.getElementById('game-container');
    if (gameDiv) {
        gameDiv.style.width = `${width}px`;
        gameDiv.style.height = `${height}px`;
    }
    // Phaser Scale FIT: gọi resize để canvas update
    gamePhaser.scale.resize(width, height);
}

function broadcastSetState(payload: any) {
    // Chuyển xuống scene đang chạy để route helper (audio/score/timer/result...)
    const scene = gamePhaser.scene.getScenes(true)[0] as any;
    scene?.applyHubState?.(payload);
}

// Lấy hubOrigin: tốt nhất từ query param, fallback document.referrer
function getHubOrigin(): string {
    const qs = new URLSearchParams(window.location.search);
    const o = qs.get('hubOrigin');
    if (o) return o;

    // Fallback: origin của referrer (hub)
    try {
        const ref = document.referrer;
        if (ref) return new URL(ref).origin;
    } catch { }
    return '*'; // Nếu protocol bắt buộc origin cụ thể thì KHÔNG dùng "*"
}

export const sdk = gameSDK.createGameSdk({
    hubOrigin: getHubOrigin(),

    onInit(_ctx) {
        // Reset stats session nếu cần
        // gameSDK.resetAll();

        // Báo READY sau INIT
        sdk.ready({
            capabilities: ['resize', 'score', 'complete', 'save_load', 'set_state'],
        });
    },

    onStart() {
        gamePhaser.scene.resume(SceneKeys.SpeakScene);
        gamePhaser.scene.resume(SceneKeys.EndGame);
    },

    onPause() {
        gamePhaser.scene.pause(SceneKeys.SpeakScene);
    },

    onResume() {
        gamePhaser.scene.resume(SceneKeys.SpeakScene);
    },

    onResize(size) {
        applyResize(size.width, size.height);
    },

    onSetState(state) {
        broadcastSetState(state);
    },

    onQuit() {
        // QUIT: chốt attempt là quit + gửi complete
        gameSDK.finalizeAttempt('quit');
        sdk.complete({
            timeMs: Date.now() - (window.irukaGameState?.startTime ?? Date.now()),
            extras: { reason: 'hub_quit', stats: gameSDK.prepareSubmitData() },
        });
    },
});

// Export gameSDK để các scene khác dùng
export { gameSDK };

// ========================================
// XỬ LÝ LOGIC UI & XOAY MÀN HÌNH
// ========================================

function updateUIButtonScale() {
    const resetBtn = document.getElementById('btn-reset') as HTMLImageElement;
    if (!resetBtn) return;

    const h = window.innerHeight;

    // Nut reset: kich thuoc hinh vuong 1/9 chieu cao man hinh
    const newSize = h / 9;

    resetBtn.style.width = `${newSize}px`;
    resetBtn.style.height = `${newSize}px`;
}

export function showGameButtons() {
    const reset = document.getElementById('btn-reset');
    if (reset) reset.style.display = 'block';
}

export function hideGameButtons() {
    const reset = document.getElementById('btn-reset');
    if (reset) reset.style.display = 'none';
}

function attachResetHandler() {
    const resetBtn = document.getElementById('btn-reset') as HTMLImageElement;

    if (resetBtn) {
        resetBtn.onclick = () => {
            console.log('Restart button clicked. Stopping all audio and restarting scene.');

            gamePhaser.sound.stopByKey('bgm-nen');
            AudioManager.stopAll();

            try {
                AudioManager.play('sfx-click');
            } catch (e) {
                console.error("Error playing sfx-click on restart:", e);
            }

            // SDK: Ghi nhận retry từ đầu
            gameSDK.retryFromStart();

            if (window.gameScene && window.gameScene.scene) {
                window.gameScene.scene.stop();
                window.gameScene.scene.start(SceneKeys.SpeakScene);
            } else {
                console.error('GameScene instance not found on window. Cannot restart.');
            }

            hideGameButtons();
        };
    }
}

// Khởi tạo xoay màn hình
initRotateOrientation(gamePhaser);
attachResetHandler();

// Scale nút
updateUIButtonScale();
window.addEventListener('resize', updateUIButtonScale);
window.addEventListener('orientationchange', updateUIButtonScale);

// Hover effect cho nút restart
const resetBtnHover = document.getElementById('btn-reset') as HTMLImageElement;
if (resetBtnHover) {
    resetBtnHover.style.transition = 'transform 0.15s ease-out';
    resetBtnHover.addEventListener('mouseenter', () => {
        resetBtnHover.style.transform = 'scale(1.1)';
    });
    resetBtnHover.addEventListener('mouseleave', () => {
        resetBtnHover.style.transform = 'scale(1.0)';
    });
}

document.getElementById('btn-reset')?.addEventListener('sfx-click', () => {
    window.gameScene?.scene.restart();
});
