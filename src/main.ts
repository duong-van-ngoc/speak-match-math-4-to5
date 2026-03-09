import Phaser from 'phaser';
import { configureSdkContext, game } from '@iruka-edu/mini-game-sdk';
import AudioManager from './audio/AudioManager';
import { SceneKeys } from './consts/Keys';
import { installIrukaE2E } from './e2e/installIrukaE2E';
import { PreloadScene, SpeakScene, UnderlineCharScene, EndGameScene } from './scenes';
import { initRotateOrientation } from './utils/rotateOrientation';

declare global {
    interface Window {
        gameScene: any;
        irukaHost: any;
        irukaGameState: any;
    }
}

configureSdkContext({
    fallback: {
        gameId: 'speak-match-math-4-to5',
        lessonId: 'math-game-age-4to5',
        gameVersion: '0.0.0',
    },
});

function applyResize(width: number, height: number) {
    const gameDiv = document.getElementById('game-container');
    if (gameDiv) {
        gameDiv.style.width = `${width}px`;
        gameDiv.style.height = `${height}px`;
    }

    gamePhaser.scale.resize(width, height);
}

function getPrimaryScene(): any {
    return gamePhaser.scene.getScenes(true)[0] as any;
}

function callSceneMethod(methodName: string): void {
    getPrimaryScene()?.[methodName]?.();
}

function broadcastSetState(payload: any) {
    getPrimaryScene()?.applyHubState?.(payload);
}

function getScene(sceneKey: string): Phaser.Scene | null {
    try {
        return gamePhaser.scene.getScene(sceneKey);
    } catch {
        return null;
    }
}

function setScenePaused(sceneKey: string, paused: boolean) {
    const scene = getScene(sceneKey);
    if (!scene) return;

    if (paused) {
        if (scene.scene.isActive()) {
            scene.scene.pause();
        }
        return;
    }

    if (scene.scene.isPaused()) {
        scene.scene.resume();
    }
}

function getHubOrigin(): string {
    const qs = new URLSearchParams(window.location.search);
    const originFromQuery = qs.get('hubOrigin');
    if (originFromQuery) return originFromQuery;

    try {
        const ref = document.referrer;
        if (ref) return new URL(ref).origin;
    } catch {
        // Ignore malformed referrer.
    }

    return '*';
}

export const sdk = game.createGameSdk({
    hubOrigin: getHubOrigin(),

    onInit() {
        game.resetAll();
        sdk.ready({
            capabilities: [
                'resize',
                'score',
                'complete',
                'save_load',
                'set_state',
                'stats',
                'hint',
                'pronunciation',
            ],
        });
    },

    onStart() {
        setScenePaused(SceneKeys.SpeakScene, false);
        setScenePaused(SceneKeys.EndGame, false);
    },

    onPause() {
        setScenePaused(SceneKeys.SpeakScene, true);
        setScenePaused(SceneKeys.EndGame, true);
    },

    onResume() {
        setScenePaused(SceneKeys.SpeakScene, false);
        setScenePaused(SceneKeys.EndGame, false);
    },

    onResize(size) {
        applyResize(size.width, size.height);
    },

    onSetState(state) {
        broadcastSetState(state);
    },

    onQuit() {
        callSceneMethod('handleHubQuit');

        const state = window.irukaGameState || {};
        if (!state.attemptFinalized) {
            game.finalizeAttempt('quit');
            state.attemptFinalized = true;
            window.irukaGameState = state;
        }

        sdk.complete({
            score: state.currentScore ?? game.prepareSubmitData().finalScore,
            timeMs: Date.now() - (state.startTime ?? Date.now()),
            extras: {
                reason: 'hub_quit',
                stats: game.prepareSubmitData(),
            },
        });
    },
});

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
        arcade: { debug: false },
    },
    render: {
        transparent: true,
    },
};

export const gamePhaser = new Phaser.Game(config);

function updateUIButtonScale() {
    const resetBtn = document.getElementById('btn-reset') as HTMLImageElement | null;
    if (!resetBtn) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(w, h) / 1080;
    const baseSize = 100;
    const newSize = baseSize * scale;

    resetBtn.style.width = `${newSize}px`;
    resetBtn.style.height = 'auto';
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
    const resetBtn = document.getElementById('btn-reset') as HTMLImageElement | null;
    if (!resetBtn) return;

    resetBtn.onclick = () => {
        callSceneMethod('handleExternalReset');
        game.retryFromStart();

        const bgm = gamePhaser.sound.get('bgm-nen');
        if (bgm) {
            gamePhaser.sound.stopByKey('bgm-nen');
        }

        AudioManager.stopAll();

        try {
            AudioManager.play('sfx-click');
        } catch (error) {
            console.error('Lỗi phát sfx-click khi restart:', error);
        }

        const speakScene = getScene(SceneKeys.SpeakScene);
        if (speakScene) {
            speakScene.scene.stop();
            speakScene.scene.start(SceneKeys.SpeakScene);
        } else if (window.gameScene?.scene) {
            window.gameScene.scene.stop();
            window.gameScene.scene.start(SceneKeys.SpeakScene);
        } else {
            console.error('Không tìm thấy SpeakScene. Không thể restart.');
        }

        hideGameButtons();
    };
}

initRotateOrientation(gamePhaser);
attachResetHandler();

updateUIButtonScale();
window.addEventListener('resize', updateUIButtonScale);
window.addEventListener('orientationchange', updateUIButtonScale);

document.getElementById('btn-reset')?.addEventListener('sfx-click', () => {
    window.gameScene?.scene.restart();
});

installIrukaE2E(sdk);
