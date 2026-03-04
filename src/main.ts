import Phaser from 'phaser';
import { PreloadScene, SpeakScene, UnderlineCharScene, EndGameScene } from './scenes';
import { initRotateOrientation } from './utils/rotateOrientation';
import AudioManager from './audio/AudioManager';
import { SceneKeys } from './consts/Keys';

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
    scene: [PreloadScene, SpeakScene, UnderlineCharScene, EndGameScene],
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

const game = new Phaser.Game(config);

// --- XỬ LÝ LOGIC UI & XOAY MÀN HÌNH ---
function updateUIButtonScale() {
    const resetBtn = document.getElementById('btn-reset') as HTMLImageElement;
    if (!resetBtn) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const scale = Math.min(w, h) / 1080;
    const baseSize = 100;
    const newSize = baseSize * scale;

    resetBtn.style.width = `${newSize}px`;
    resetBtn.style.height = 'auto';
}

/** Hiện các nút game */
export function showGameButtons() {
    const reset = document.getElementById('btn-reset');
    if (reset) reset.style.display = 'block';
}

/** Ẩn các nút game */
export function hideGameButtons() {
    const reset = document.getElementById('btn-reset');
    if (reset) reset.style.display = 'none';
}

/** Gắn sự kiện cho nút Reset */
function attachResetHandler() {
    const resetBtn = document.getElementById('btn-reset') as HTMLImageElement;

    if (resetBtn) {
        resetBtn.onclick = () => {
            console.log('Nút restart được nhấn. Dừng tất cả audio và khởi động lại scene.');

            game.sound.stopByKey('bgm-nen');
            AudioManager.stopAll();

            try {
                AudioManager.play('sfx-click');
            } catch (e) {
                console.error("Lỗi phát sfx-click khi restart:", e);
            }

            if (window.gameScene && window.gameScene.scene) {
                window.gameScene.scene.stop();
                window.gameScene.scene.start(SceneKeys.SpeakScene);
            } else {
                console.error('Không tìm thấy gameScene trên window. Không thể restart.');
            }

            hideGameButtons();
        };
    }
}

// Khởi tạo xoay màn hình
initRotateOrientation(game);
attachResetHandler();

// Scale nút theo kích thước màn hình
updateUIButtonScale();
window.addEventListener('resize', updateUIButtonScale);
window.addEventListener('orientationchange', updateUIButtonScale);

document.getElementById('btn-reset')?.addEventListener('sfx-click', () => {
    window.gameScene?.scene.restart();
});
